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
import { fetchStockPrice } from "@/lib/price-feed"
import { fetchDailyHistory, getBenchmarkHistory, computePriceMetrics } from "@/lib/price-history"
import { computePiotroski } from "@/lib/stock-scores/piotroski"
import { computeAltmanZ } from "@/lib/stock-scores/altman"
import { computeBeneishM } from "@/lib/stock-scores/beneish"
import { getSectorBenchmark, scoreAgainstSector } from "@/lib/sector-benchmarks"
import { scoreStock } from "@/lib/stock-scoring"
import { logStockUnderwriteCall } from "@/lib/underwrite-tracker"
import { stampFields, type ProvenanceMap } from "@/lib/data-integrity"

export interface AnalyzeStockResult {
  ok: boolean
  error?: string
  ticker?: Record<string, unknown>
}

function makeCuid(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789"
  return `c${Array.from({ length: 24 }, () => chars[Math.floor(Math.random() * chars.length)]).join("")}`
}

export async function analyzeAndUpsertTicker(symbolRaw: string): Promise<AnalyzeStockResult> {
  const symbol = symbolRaw.trim().toUpperCase()
  if (!symbol) return { ok: false, error: "Symbol is required" }

  const resolved = await resolveCik(symbol)
  if (!resolved) return { ok: false, error: `"${symbol}" is not a known SEC-registered ticker` }

  const [submissions, facts, goingConcern, price, history, benchmark] = await Promise.all([
    getSubmissions(resolved.cik),
    getCompanyFacts(resolved.cik),
    searchGoingConcern(resolved.cik),
    fetchStockPrice(symbol),
    fetchDailyHistory(symbol),
    getBenchmarkHistory(),
  ])

  if (!facts) return { ok: false, error: `No SEC XBRL filing data found for ${symbol}` }

  const series = extractSeries(facts)
  const fundamentals = normalizeFundamentals(facts, series)
  const priceMetrics = history.length > 0 ? computePriceMetrics(history, benchmark) : null

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

  const result = scoreStock({
    fundamentals, price, priceMetrics, piotroski, altman, beneish, sectorRelative,
    goingConcernHits: goingConcern.hits,
  })

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

  await logStockUnderwriteCall(saved).catch(() => {})

  return { ok: true, ticker: saved }
}
