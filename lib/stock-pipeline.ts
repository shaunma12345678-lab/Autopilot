// Shared orchestration used by both the on-demand lookup route and the
// recurring re-scoring cron: resolve a symbol, pull fresh EDGAR + price data,
// run every scoring model, and upsert into Ticker.
//
// One code path, two triggers — a user's lookup permanently seeds the
// accumulated dataset, exactly like the real estate search does for new leads.
// That accumulation is also what makes sector benchmarking better over time.
import { prisma } from "@/lib/prisma"
import { resolveCik, getSubmissions, getCompanyFacts, searchGoingConcern } from "@/lib/edgar-client"
import { normalizeFundamentals, extractSeries } from "@/lib/edgar-normalize"
import { fetchHistory, getBenchmarkHistory, computePriceMetrics } from "@/lib/price-history"
import { computePiotroski } from "@/lib/stock-scores/piotroski"
import { computeAltmanZ } from "@/lib/stock-scores/altman"
import { computeBeneishM } from "@/lib/stock-scores/beneish"
import { getSectorBenchmark, scoreAgainstSector } from "@/lib/sector-benchmarks"
import { scoreStock } from "@/lib/stock-scoring"
import { logStockUnderwriteCall } from "@/lib/underwrite-tracker"
import { stampFields, type ProvenanceMap } from "@/lib/data-integrity"
import { computeForwardSignals } from "@/lib/forward-signals"
import { computePositionContext, describeSituation } from "@/lib/position-context"
import { fetchFilingSections, readFilingNarrative } from "@/lib/edgar-narrative"
import { summarizeLiveEvents } from "@/lib/live-events"
import { scanCompanyNews } from "@/lib/company-news"
import { computeConsistency } from "@/lib/consistency"
import { analyzeInsiderActivity, recordClusterBuyDiscovery } from "@/lib/form4-insider"

export interface AnalyzeStockResult {
  ok: boolean
  error?: string
  ticker?: Record<string, unknown>
}

function makeCuid(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789"
  return `c${Array.from({ length: 24 }, () => chars[Math.floor(Math.random() * chars.length)]).join("")}`
}

export async function analyzeAndUpsertTicker(
  symbolRaw: string,
  opts: { includeNarrative?: boolean; includeNews?: boolean } = {}
): Promise<AnalyzeStockResult> {
  const symbol = symbolRaw.trim().toUpperCase()
  if (!symbol) return { ok: false, error: "Symbol is required" }

  const resolved = await resolveCik(symbol)
  if (!resolved) return { ok: false, error: `"${symbol}" is not a known SEC-registered ticker` }

  // One provider call returns both the daily series and the live quote, so
  // there's no separate price request to pay for.
  const [submissions, facts, goingConcern, history, benchmark] = await Promise.all([
    getSubmissions(resolved.cik),
    getCompanyFacts(resolved.cik),
    searchGoingConcern(resolved.cik),
    fetchHistory(symbol),
    getBenchmarkHistory(),
  ])

  if (!facts) return { ok: false, error: `No SEC XBRL filing data found for ${symbol}` }

  const price = history.latestPrice !== null
    ? { symbol, price: history.latestPrice, date: history.bars.at(-1)?.date ?? "" }
    : null

  const series = extractSeries(facts)
  const fundamentals = normalizeFundamentals(facts, series)
  const priceMetrics = history.bars.length > 0 ? computePriceMetrics(history.bars, benchmark) : null

  const marketCap = price && fundamentals.sharesOutstanding
    ? price.price * fundamentals.sharesOutstanding
    : null

  const sicCode = submissions?.sic ?? null
  const piotroski = computePiotroski(series)
  const altman = computeAltmanZ(series, marketCap, sicCode)
  const beneish = computeBeneishM(series)

  const sectorBenchmark = await getSectorBenchmark(sicCode)
  const sectorRelative = scoreAgainstSector({
    netMarginPct: fundamentals.netMarginPct,
    operatingMarginPct: fundamentals.operatingMarginPct,
    grossMarginPct: fundamentals.grossMarginPct,
    roePct: fundamentals.roePct,
    fcfMarginPct: fundamentals.fcfMarginPct,
    revenueGrowthYoyPct: fundamentals.revenueGrowthYoyPct,
    debtToEquity: fundamentals.debtToEquity,
  }, sectorBenchmark)

  // Forward signals and multi-year consistency both feed scoring, so they're
  // computed before it. Both are pure computation over data already fetched.
  const forward = computeForwardSignals(series)
  const consistency = computeConsistency(series)

  // Form 4 parsing costs one small fetch per filing, so it's capped and
  // guarded rather than gated behind an opt-in flag.
  const insider = await analyzeInsiderActivity(resolved.cik, submissions?.recentForms ?? [])
    .catch(() => null)

  // Live 8-K events are free (already in the submissions payload) so they
  // always run. This is what catches a restatement filed last week that no
  // backward-looking ratio can see.
  const liveEvents = summarizeLiveEvents(submissions?.recentForms ?? [])

  // News costs a web search + AI call, so it's opt-in like the narrative read.
  let news: Awaited<ReturnType<typeof scanCompanyNews>> = null
  if (opts.includeNews) {
    news = await scanCompanyNews(symbol, submissions?.name ?? resolved.name).catch(() => null)
  }

  const result = scoreStock({
    fundamentals, price, priceMetrics, piotroski, altman, beneish, sectorRelative,
    goingConcernHits: goingConcern.hits,
    externalRiskPenalty: liveEvents.riskPenalty + (news?.riskPenalty ?? 0),
    externalRiskFlags: [
      ...liveEvents.flags,
      ...(news?.materialConcerns ?? []).map(c => `⚠ Reported in recent coverage: ${c}`),
    ],
    hasRestatement: liveEvents.hasRestatement,
    forwardScore: forward.forwardScore,
    consistencyScore: consistency.score,
    insiderScoreBonus: insider?.scoreBonus ?? 0,
  })

  const positionCtx = computePositionContext(history.bars)
  const situationSummary = describeSituation({
    ctx: positionCtx,
    qualityScore: result.qualityScore,
    riskScore: result.riskScore,
    forwardScore: forward.forwardScore,
  })

  // Reading the filing narrative costs an 8MB document fetch plus an AI call,
  // so it's opt-in: on-demand lookups get it, bulk cron re-scoring doesn't.
  let narrative: Awaited<ReturnType<typeof readFilingNarrative>> = null
  if (opts.includeNarrative) {
    try {
      const latest10K = submissions?.recentForms?.find(f => f.form === "10-K")
      if (latest10K) {
        const sections = await fetchFilingSections(
          resolved.cik, latest10K.accessionNumber, latest10K.primaryDocument,
          latest10K.form, latest10K.filingDate
        )
        if (sections) narrative = await readFilingNarrative(sections)
      }
    } catch { /* narrative is an enhancement; never block the score on it */ }
  }

  // Per-field source attribution — the integrity layer's core promise: a user
  // can always see whether a number was filed with the SEC, quoted from a
  // market feed, or computed by us.
  const fieldSources: ProvenanceMap = {
    ...stampFields([
      "revenueTtm", "revenueGrowthYoyPct", "grossMarginPct", "operatingMarginPct", "netMarginPct",
      "roePct", "roicPct", "debtToEquity", "interestCoveragePct", "currentRatio",
      "freeCashFlowTtm", "fcfMarginPct", "accrualsRatioPct", "sharesOutstanding", "buybackYieldPct",
      "payoutRatioEarningsPct", "payoutRatioFcfPct",
    ], "sec-edgar-xbrl"),
    ...stampFields(["sector", "exchange", "sicCode", "name"], "sec-edgar-submissions"),
    ...stampFields(["priceUsd"], "stooq-quote"),
    ...stampFields(["momentum12m1Pct", "pctFrom52WeekHigh", "volatility30dPct", "maxDrawdown1yPct", "betaVsSpy"], "stooq-history"),
    ...stampFields(["piotroskiScore", "altmanZScore", "beneishMScore", "peRatio", "dividendYieldPct"], "derived", { isEstimate: true }),
    ...stampFields(["sectorRelativeScore"], "sector-benchmark", { isEstimate: true }),
    ...stampFields(["rpoUsd", "rndIntensityPct", "capexIntensityPct", "deferredRevenueGrowthYoyPct"], "sec-edgar-xbrl"),
    ...stampFields(["forwardScore", "pricePercentile1y", "trendState", "situationSummary"], "derived", { isEstimate: true }),
    ...stampFields(["narrativeSummary", "narrativeStrategy", "narrativeHeadwinds"], "sec-edgar-submissions", { isEstimate: true, note: "AI reading of management's own narrative — reports what management states, not verified fact." }),
  }

  const data = {
    cik: resolved.cik,
    symbol,
    name: submissions?.name ?? resolved.name,
    sector: submissions?.sicDescription ?? null,
    sicCode,
    exchange: submissions?.exchanges?.[0] ?? null,

    revenueTtm: fundamentals.revenueTtm,
    revenueGrowthYoyPct: fundamentals.revenueGrowthYoyPct,
    grossMarginPct: fundamentals.grossMarginPct,
    operatingMarginPct: fundamentals.operatingMarginPct,
    netMarginPct: fundamentals.netMarginPct,
    roePct: fundamentals.roePct,
    roicPct: fundamentals.roicPct,
    debtToEquity: fundamentals.debtToEquity,
    interestCoveragePct: fundamentals.interestCoveragePct,
    currentRatio: fundamentals.currentRatio,
    freeCashFlowTtm: fundamentals.freeCashFlowTtm,
    fcfMarginPct: fundamentals.fcfMarginPct,
    accrualsRatioPct: fundamentals.accrualsRatioPct,
    sharesOutstanding: fundamentals.sharesOutstanding,
    buybackYieldPct: fundamentals.buybackYieldPct,

    dividendYieldPct: (fundamentals.dividendPerShare && price)
      ? (fundamentals.dividendPerShare / price.price) * 100 : null,
    payoutRatioEarningsPct: fundamentals.payoutRatioEarningsPct,
    payoutRatioFcfPct: fundamentals.payoutRatioFcfPct,

    priceUsd: price?.price ?? null,
    peRatio: result.peRatio,

    piotroskiScore: piotroski.normalized,
    piotroskiDetail: piotroski.tests,
    altmanZScore: altman.zScore,
    altmanZone: altman.zone,
    beneishMScore: beneish.mScore,
    beneishFlag: beneish.flagged,

    momentum12m1Pct: priceMetrics?.momentum12m1Pct ?? null,
    pctFrom52WeekHigh: priceMetrics?.pctFrom52WeekHigh ?? null,
    volatility30dPct: priceMetrics?.volatility30dPct ?? null,
    maxDrawdown1yPct: priceMetrics?.maxDrawdown1yPct ?? null,
    betaVsSpy: priceMetrics?.betaVsSpy ?? null,

    sectorRelativeScore: sectorRelative.score,
    sectorPeerCount: sectorRelative.peerCount,

    rpoUsd: forward.rpoUsd,
    rpoToRevenueYears: forward.rpoToRevenueYears,
    rpoGrowthYoyPct: forward.rpoGrowthYoyPct,
    rndIntensityPct: forward.rndIntensityPct,
    capexIntensityPct: forward.capexIntensityPct,
    capexGrowthYoyPct: forward.capexGrowthYoyPct,
    deferredRevenueGrowthYoyPct: forward.deferredRevenueGrowthYoyPct,
    revenueAccelerationPct: forward.revenueAccelerationPct,
    forwardScore: forward.forwardScore,
    forwardReasons: [...forward.forwardReasons, ...consistency.reasons],

    consistencyScore: consistency.score,
    consistencyDetail: consistency.detail,
    yearsOfData: consistency.yearsOfData,

    insiderBuyCount90d: insider?.buyCount90d ?? null,
    insiderSellCount90d: insider?.sellCount90d ?? null,
    insiderNetSharesBought90d: insider?.netSharesBought90d ?? null,
    insiderClusterBuy: insider?.clusterBuy ?? null,
    insiderSummary: insider?.summary ?? null,

    liveEvents: liveEvents.events,
    liveEventFlags: liveEvents.flags,
    hasRestatement: liveEvents.hasRestatement,
    hasAuditorChange: liveEvents.hasAuditorChange,
    execChangeCount: liveEvents.execChangeCount,

    ...(news ? {
      newsSummary: news.summary,
      newsTone: news.tone,
      newsHeadlines: news.headlines,
      newsMaterialConcerns: news.materialConcerns,
    } : {}),

    pricePercentile1y: positionCtx.pricePercentile1y,
    trendState: positionCtx.trendState,
    ma50: positionCtx.ma50,
    ma200: positionCtx.ma200,
    situationSummary,

    ...(narrative ? {
      narrativeSummary: narrative.summary,
      narrativeStrategy: narrative.strategy,
      narrativeGrowthDrivers: narrative.growthDrivers,
      narrativeHeadwinds: narrative.headwinds,
      narrativeCapitalPlans: narrative.capitalPlans,
      narrativeOutlookTone: narrative.outlookTone,
      narrativeSourceUrl: narrative.sourceUrl,
      narrativeFilingDate: narrative.filingDate,
    } : {}),

    qualityScore: result.qualityScore,
    qualityReasons: result.qualityReasons,
    riskScore: result.riskScore,
    riskFlags: result.riskFlags,
    strengthTier: result.strengthTier,
    actionSignal: result.actionSignal,
    actionRationale: result.actionRationale,
    dataCompletenessPct: result.dataCompletenessPct,
    dataConfidence: result.dataConfidence,
    fieldSources,
    earlyWarning: result.earlyWarning,
    lastScoredAt: new Date().toISOString(),
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existing = await (prisma.ticker as any).findFirst({ where: { symbol } })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const saved = existing
    ? await (prisma.ticker as any).update({ where: { id: existing.id }, data })
    : await (prisma.ticker as any).create({ data })

  if (goingConcern.hits > 0) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const existingSignal = await (prisma.tickerSignal as any).findFirst({
        where: { tickerId: saved.id, signalType: "going_concern_8k" },
      })
      if (!existingSignal) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (prisma.tickerSignal as any).create({
          data: {
            id: makeCuid(),
            tickerId: saved.id,
            signalType: "going_concern_8k",
            signalDate: goingConcern.latestDate ? new Date(goingConcern.latestDate).toISOString() : new Date().toISOString(),
            rawData: { hits: goingConcern.hits },
            source: "edgar-fulltext-search",
          },
        })
      }
    } catch { /* signal logging is best-effort, never blocks scoring */ }
  }

  // Surface genuine cluster buying in the discovery feed alongside late
  // filings and IPO registrations.
  if (insider?.clusterBuy) {
    await recordClusterBuyDiscovery({
      cik: resolved.cik,
      symbol,
      companyName: submissions?.name ?? resolved.name,
      activity: insider,
    }).catch(() => {})
  }

  await logStockUnderwriteCall(saved).catch(() => {})

  return { ok: true, ticker: saved }
}
