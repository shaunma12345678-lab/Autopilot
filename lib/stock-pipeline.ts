// Shared orchestration used by both the on-demand lookup route and the
// recurring re-scoring cron: resolve a symbol, pull fresh EDGAR + price data,
// run every scoring model, and upsert into Ticker.
//
// One code path, two triggers — a user's lookup permanently seeds the
// accumulated dataset, exactly like the real estate search does for new leads.
// That accumulation is also what makes sector benchmarking better over time.
import { prisma } from "@/lib/prisma"
import { resolveCik, getSubmissions, getCompanyFacts, searchGoingConcern, countGaapConcepts, findOperatingCik } from "@/lib/edgar-client"
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
import { extractNarrative } from "@/lib/narrative-extract"
import { summarizeLiveEvents } from "@/lib/live-events"
import { readCompanyNews } from "@/lib/news-feed"
import { diffRiskFactors } from "@/lib/risk-factor-diff"
import { computeValuation, classifyValue } from "@/lib/valuation"
import { buildBearCase } from "@/lib/bear-case"
import { checkDataIntegrity } from "@/lib/filing-integrity"
import { getMarketContext } from "@/lib/market-percentile"
import { analyzeBenford } from "@/lib/benford"
import { getShortInterest, interpretShortInterest } from "@/lib/short-interest"
import { getFederalRevenue, reconcileFederalRevenue } from "@/lib/federal-revenue"
import { fetchDeepHistory } from "@/lib/price-history"
import { computeConsistency } from "@/lib/consistency"
import { analyzeInsiderActivity, recordClusterBuyDiscovery } from "@/lib/form4-insider"
import { computeBalanceSheetRisk } from "@/lib/balance-sheet-risk"
import { computeAccountingQuality } from "@/lib/accounting-quality"
import { checkContradictions } from "@/lib/contradiction-check"
import { captureSnapshot, detectDeterioration } from "@/lib/score-history"
import { assessStockConviction } from "@/lib/conviction"
import { computeCapitalAllocation } from "@/lib/capital-allocation"
import { readProxyGovernance } from "@/lib/governance"

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

  // A ticker that maps to a holding-company shell has almost no XBRL history.
  // Fall back to the operating entity before concluding the data doesn't exist.
  let cik = resolved.cik
  let effectiveFacts = facts
  let effectiveSubmissions = submissions
  if (countGaapConcepts(facts) < 150) {
    const operatingCik = await findOperatingCik(submissions?.name ?? resolved.name).catch(() => null)
    if (operatingCik && operatingCik !== resolved.cik) {
      const [betterFacts, betterSubs] = await Promise.all([
        getCompanyFacts(operatingCik),
        getSubmissions(operatingCik),
      ])
      if (countGaapConcepts(betterFacts) > countGaapConcepts(facts)) {
        cik = operatingCik
        effectiveFacts = betterFacts!
        effectiveSubmissions = betterSubs ?? submissions
      }
    }
  }

  const price = history.latestPrice !== null
    ? { symbol, price: history.latestPrice, date: history.bars.at(-1)?.date ?? "" }
    : null

  const series = extractSeries(effectiveFacts)

  // Deterministic integrity checks BEFORE anything interprets these numbers.
  // Every score below is arithmetic on this XBRL; if the filing does not
  // internally reconcile, careful interpretation later cannot recover from it.
  const integrity = checkDataIntegrity(series)
  // Digit analysis over every USD figure already in the payload — no extra
  // fetch, and it reads the numbers as a distribution rather than one at a time.
  const benford = analyzeBenford(effectiveFacts)
  if (integrity.corrupt) {
    return {
      ok: false,
      error: `${symbol}: filing data failed integrity checks — ${integrity.checks.filter(c => !c.passed).map(c => c.detail).join(" ")}`,
    }
  }

  const fundamentals = normalizeFundamentals(effectiveFacts, series)
  const priceMetrics = history.bars.length > 0 ? computePriceMetrics(history.bars, benchmark) : null

  const marketCap = price && fundamentals.sharesOutstanding
    ? price.price * fundamentals.sharesOutstanding
    : null

  // Historical market caps at each fiscal period end, for the own-history
  // valuation percentile. Shares are matched to the period they were reported
  // for and priced at that period's close.
  //
  // Uses DEEP history, not `history.bars`. The live provider chain returns only
  // ~13 months, so every fiscal year end older than that prices to null and the
  // series falls below the five years the percentile requires — leaving the
  // composite to fall back on the absolute-yield term alone. That silently
  // ships a weaker valuation score than the one that was backtested, since the
  // own-history percentile carries 70% of the composite and is the component
  // with measured signal.
  const deepBars = await fetchDeepHistory(symbol).catch(() => [])
  const valuationBars = deepBars.length > history.bars.length ? deepBars : history.bars
  const sharesByEnd = new Map((series.sharesOutstanding ?? []).map(o => [o.end, o.value]))
  const closeOnDate = (iso: string): number | null => {
    let found: number | null = null
    for (const b of valuationBars) {
      if (b.date <= iso) found = b.close
      else break
    }
    return found
  }
  const anchorSeries = series.cfo?.length ? series.cfo : series.netIncome
  const historicalMarketCaps = (anchorSeries ?? []).map(o => {
    const sh = sharesByEnd.get(o.end)
    const px = closeOnDate(o.end)
    return sh && px ? sh * px : null
  })
  const valuation = computeValuation(series, marketCap, historicalMarketCaps)

  const sicCode = effectiveSubmissions?.sic ?? null
  const piotroski = computePiotroski(series)
  const altman = computeAltmanZ(series, marketCap, sicCode)
  const beneish = computeBeneishM(series)

  // Market-wide percentiles from SEC frames — the real distribution across
  // every filer, not our own accumulated sample of a few hundred.
  const marketCtx = await getMarketContext({
    revenueTtm: fundamentals.revenueTtm,
    netIncome: series.netIncome?.[0]?.value ?? null,
    totalAssets: series.totalAssets?.[0]?.value ?? null,
    operatingCashFlow: series.cfo?.[0]?.value ?? null,
    rndExpense: series.researchAndDevelopment?.[0]?.value ?? null,
  }).catch(() => ({ percentiles: [], reasons: [] }))

  const shortInterest = await getShortInterest(symbol).catch(() => null)
  const federal = await getFederalRevenue(effectiveSubmissions?.name ?? resolved.name).catch(() => null)

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
  const balanceSheet = computeBalanceSheetRisk(series, fundamentals.freeCashFlowTtm)
  const accounting = computeAccountingQuality(series)
  const capitalAllocation = computeCapitalAllocation(series, history.bars)

  // Form 4 parsing costs one small fetch per filing, so it's capped and
  // guarded rather than gated behind an opt-in flag.
  const insider = await analyzeInsiderActivity(cik, effectiveSubmissions?.recentForms ?? [])
    .catch(() => null)

  // Live 8-K events are free (already in the submissions payload) so they
  // always run. This is what catches a restatement filed last week that no
  // backward-looking ratio can see.
  const liveEvents = summarizeLiveEvents(effectiveSubmissions?.recentForms ?? [])

  // DEEP RESEARCH — governance (DEF 14A), business narrative (10-K) and recent
  // news each cost a document fetch plus an AI call. Run sequentially they took
  // a measured 230 SECONDS for a single company, which meant the deep-research
  // cron completed exactly one company per firing before hitting its budget.
  //
  // The three are independent of one another, so they run concurrently and the
  // wall time collapses to roughly the slowest single call. Each is guarded on
  // its own: any one failing leaves the others and the score intact.
  let governance: Awaited<ReturnType<typeof readProxyGovernance>> = null
  let narrative: Awaited<ReturnType<typeof readFilingNarrative>> = null
  let news: Awaited<ReturnType<typeof readCompanyNews>> = null
  let riskDiff: Awaited<ReturnType<typeof diffRiskFactors>> | null = null

  if (opts.includeNarrative || opts.includeNews) {
    const proxy = effectiveSubmissions?.recentForms?.find(f => f.form === "DEF 14A")
    const latest10K = effectiveSubmissions?.recentForms?.find(f => f.form === "10-K")

    const [gov, narr, nws, rdiff] = await Promise.all([
      opts.includeNarrative && proxy
        ? readProxyGovernance(cik, proxy.accessionNumber, proxy.primaryDocument, proxy.filingDate).catch(() => null)
        : Promise.resolve(null),

      opts.includeNarrative && latest10K
        ? fetchFilingSections(cik, latest10K.accessionNumber, latest10K.primaryDocument, latest10K.form, latest10K.filingDate)
            .then(async sections => {
              if (!sections) return null
              // Rules first. Contradiction detection needs management's CLAIMS,
              // not prose, and rules cannot rate-limit or exhaust a quota — the
              // failure that silently disabled this check entirely.
              const deterministic = extractNarrative(
                sections.mdna, sections.business, sections.sourceUrl, sections.filingDate
              )
              if (deterministic) return deterministic
              // Only fall back to the model when extraction genuinely found no
              // claims, which usually means the filing sections did not parse.
              return readFilingNarrative(sections).catch(() => null)
            })
            .catch(() => null)
        : Promise.resolve(null),

      opts.includeNews
        ? readCompanyNews(effectiveSubmissions?.name ?? resolved.name, symbol).catch(() => null)
        : Promise.resolve(null),

      // Year-over-year risk-factor diff — runs alongside the others since it's
      // another independent filing fetch.
      opts.includeNarrative
        ? diffRiskFactors(cik, effectiveSubmissions?.recentForms ?? []).catch(() => null)
        : Promise.resolve(null),
    ])

    governance = gov
    narrative = narr
    news = nws
    riskDiff = rdiff
  }

  // Deterioration is measured against this asset's own history, so it needs a
  // provisional read of the current scores first. Cheap: one indexed query.
  const provisionalRisk = 20 + liveEvents.riskPenalty + balanceSheet.riskPenalty + accounting.riskPenalty
  const deterioration = await detectDeterioration({
    subjectType: "stock",
    symbol,
    qualityScore: null,     // filled from the real score below on the next run
    riskScore: provisionalRisk,
    forwardScore: forward.forwardScore,
    hardExits: [
      { active: liveEvents.hasRestatement, reason: "Filed a restatement — the company stated its prior financial statements should not be relied on. Every metric derived from them is unreliable until restated figures are filed." },
      { active: goingConcern.hits > 0, reason: '"Going concern" doubt disclosed in recent SEC filings — the most serious solvency warning a company can issue.' },
    ],
  }).catch(() => null)

  const result = scoreStock({
    fundamentals, price, priceMetrics, piotroski, altman, beneish, sectorRelative,
    goingConcernHits: goingConcern.hits,
    externalRiskPenalty:
      liveEvents.riskPenalty + (news?.riskPenalty ?? 0) +
      balanceSheet.riskPenalty + (governance?.riskPenalty ?? 0) + accounting.riskPenalty +
      (riskDiff?.riskPenalty ?? 0),
    externalRiskFlags: [
      ...liveEvents.flags,
      ...balanceSheet.flags,
      ...accounting.flags,
      ...(governance?.flags ?? []),
      ...(riskDiff?.materialNewRisks ?? []).map(r => `⚠ Newly disclosed this year: ${r}`),
      ...integrity.flags,
      ...benford.flags,
      ...interpretShortInterest(shortInterest, null, false).flags,
      ...reconcileFederalRevenue(federal, fundamentals.revenueGrowthYoyPct).flags,
      ...(news?.materialConcerns ?? []).map(c => `⚠ Reported in recent coverage: ${c}`),
    ],
    hasRestatement: liveEvents.hasRestatement,
    forwardScore: forward.forwardScore,
    consistencyScore: consistency.score,
    insiderScoreBonus: insider?.scoreBonus ?? 0,
    deterioration: deterioration ? { shouldSell: deterioration.shouldSell, reasons: deterioration.reasons } : null,
  })


  const positionCtx = computePositionContext(history.bars)
  const situationSummary = describeSituation({
    ctx: positionCtx,
    qualityScore: result.qualityScore,
    riskScore: result.riskScore,
    forwardScore: forward.forwardScore,
  })

  // Cross-validate management's narrative against the audited numbers. This is
  // the check that catches promotional language the AI would otherwise accept.
  const contradiction = checkContradictions({
    narrative, fundamentals, forward, accounting, balanceSheet,
    capitalAllocation,
  })

  const conviction = assessStockConviction({
    qualityScore: result.qualityScore,
    riskScore: result.riskScore,
    piotroskiScore: piotroski.normalized,
    altmanZone: altman.zone,
    beneishFlag: beneish.flagged,
    accountingQualityScore: accounting.qualityScore,
    consistencyScore: consistency.score,
    forwardScore: forward.forwardScore,
    governanceScore: governance?.governanceScore ?? null,
    credibilityScore: contradiction.credibilityScore,
    hasRestatement: liveEvents.hasRestatement,
    earlyWarning: result.earlyWarning,
    dataConfidence: result.dataConfidence,
  })


  // Adversarial pass. Runs only on the deep path — it costs an LLM call, and a
  // bear case built on thin data would be speculation rather than analysis.
  // Given the numbers, not just the narrative, so every objection has to point
  // at a figure or a disclosure.
  const bear = opts.includeNarrative && result.qualityScore !== null && result.dataConfidence !== "insufficient"
    ? await buildBearCase({
        symbol,
        name: effectiveSubmissions?.name ?? resolved.name,
        fundamentals,
        qualityScore: result.qualityScore,
        riskScore: result.riskScore,
        riskFlags: result.riskFlags,
        piotroskiScore: piotroski.normalized,
        altmanZone: altman.zone,
        beneishFlag: beneish.flagged,
        valuationPercentile: valuation.ownHistoryPercentile,
        fcfYieldPct: valuation.fcfYieldPct,
        newsConcerns: news?.materialConcerns ?? [],
        newRisks: riskDiff?.materialNewRisks ?? [],
        contradictions: contradiction.flags,
      }).catch(() => null)
    : null

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
    cik,
    symbol,
    name: effectiveSubmissions?.name ?? resolved.name,
    sector: effectiveSubmissions?.sicDescription ?? null,
    sicCode,
    exchange: effectiveSubmissions?.exchanges?.[0] ?? null,

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
    forwardReasons: [...forward.forwardReasons, ...consistency.reasons, ...capitalAllocation.reasons],

    cashConversionRatio: accounting.cashConversionRatio,
    avgCashConversion: accounting.avgCashConversion,
    dsoDays: accounting.dsoDays,
    dsoTrendDays: accounting.dsoTrendDays,
    inventoryTurns: accounting.inventoryTurns,
    inventoryTurnsTrend: accounting.inventoryTurnsTrend,
    accountingQualityScore: accounting.qualityScore,
    accountingFlags: [...accounting.flags, ...accounting.notes],

    goingConcernHits: goingConcern.hits,
    benfordMad: benford.mad,
    benfordConformity: benford.conformity,
    benfordSampleSize: benford.sampleSize,
    shortSharesCurrent: shortInterest?.currentShares ?? null,
    shortChangePct: shortInterest?.changePct ?? null,
    shortDaysToCover: shortInterest?.daysToCover ?? null,
    shortTrend: shortInterest?.trend ?? null,
    shortSettlementDate: shortInterest?.settlementDate ?? null,
    federalContractValueUsd: federal?.activeContractValueUsd ?? null,
    federalContractChangePct: federal?.changePct ?? null,
    federalAwardCount: federal?.awardCount ?? null,
    bearSummary: bear?.summary ?? null,
    bearThesisRisks: bear?.thesisRisks ?? null,
    bearKillShot: bear?.killShot ?? null,
    bearConviction: bear?.bearConviction ?? null,
    bearWhatMustGoRight: bear?.whatWouldHaveToGoRight ?? null,
    valuationScore: valuation.valuationScore,
    earningsYieldPct: valuation.earningsYieldPct,
    fcfYieldPct: valuation.fcfYieldPct,
    valuationPercentile: valuation.ownHistoryPercentile,
    valueTier: classifyValue(valuation.valuationScore, result.qualityScore, result.riskScore).tier,
    valuationReasons: valuation.reasons.length > 0 ? valuation.reasons : null,

    newRiskCount: riskDiff?.newRiskCount ?? null,
    materialNewRisks: riskDiff?.materialNewRisks ?? null,
    riskFactorSummary: riskDiff?.summary ?? null,

    convictionTier: conviction.tier,
    convictionGates: conviction.gates,
    convictionSummary: conviction.summary,

    credibilityScore: contradiction.credibilityScore,
    contradictions: contradiction.contradictions,
    contradictionFlags: contradiction.flags,

    debtDueNext12MoUsd: balanceSheet.debtDueNext12MoUsd,
    debtWallToFcfYears: balanceSheet.debtWallToFcfYears,
    sbcToRevenuePct: balanceSheet.sbcToRevenuePct,
    goodwillToAssetsPct: balanceSheet.goodwillToAssetsPct,
    hadGoodwillImpairment: balanceSheet.hadGoodwillImpairment,
    effectiveTaxRatePct: balanceSheet.effectiveTaxRatePct,
    balanceSheetFlags: [...balanceSheet.flags, ...balanceSheet.notes],

    capitalAllocationScore: capitalAllocation.score,
    avgBuybackPricePercentile: capitalAllocation.avgBuybackPricePercentile,
    capitalAllocationReasons: capitalAllocation.reasons,

    ...(governance ? {
      governanceScore: governance.governanceScore,
      payAlignment: governance.payAlignment,
      dualClass: governance.dualClass,
      governanceSummary: governance.summary,
      governanceFlags: governance.flags,
      governanceSourceUrl: governance.sourceUrl,
    } : {}),

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
      newsHeadlines: news.items.map(i => `${i.title} — ${i.source}`),
      newsMaterialConcerns: [...news.materialConcerns, ...news.materialDevelopments],
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
    qualityReasons: [...result.qualityReasons, ...marketCtx.reasons],
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

  // Append to score history so the NEXT run can measure deterioration against
  // today. This is what makes a sell signal possible at all.
  await captureSnapshot({
    subjectType: "stock",
    subjectId: saved.id,
    symbol,
    qualityScore: result.qualityScore,
    riskScore: result.riskScore,
    forwardScore: forward.forwardScore,
    actionSignal: result.actionSignal,
    priceUsd: price?.price ?? null,
  })

  await logStockUnderwriteCall(saved).catch(() => {})

  return { ok: true, ticker: saved }
}
