// Point-in-time backtesting — does the scoring actually predict anything?
//
// Everything else in this system is REASONED: each criterion has a defensible
// economic argument. That is not the same as evidence. A backtest is the only
// thing that converts "this should work" into "this did work", and without one
// a quality score is an opinion wearing a number's clothing.
//
// NO LOOK-AHEAD BIAS. This is the entire difficulty of backtesting and the
// reason most retail backtests are worthless. If you score a company today
// using today's financials and then measure last year's return, you have
// "predicted" the past using information nobody had at the time, and the
// results will look spectacular and mean nothing.
//
// SEC companyfacts stamps every single datapoint with the date it was `filed`.
// So we can reconstruct exactly what was knowable on any historical date by
// discarding every observation filed after it. A score computed from that is a
// score we genuinely could have produced on that day. That `filed` field is
// what makes an honest backtest possible at all.
//
// PRE-REGISTRATION. This runs the criteria as they already exist. It is not a
// search for criteria that backtest well. Testing forty variants and shipping
// the ten that scored best would overfit to noise and the resulting accuracy
// figure would be fiction — the single most common way backtests lie. If these
// results are weak, the honest response is to report them as weak.
//
// BENCHMARK-RELATIVE. Raw forward returns mostly measure whether the market
// went up, which tells you nothing about the criteria. Every return here is
// excess return versus SPY over the identical window.
import type { CompanyFacts } from "./edgar-client"
import { extractSeries, normalizeFundamentals } from "./edgar-normalize"
import { computePiotroski } from "./stock-scores/piotroski"
import { computeAltmanZ } from "./stock-scores/altman"
import { computeBeneishM } from "./stock-scores/beneish"
import { scoreStock } from "./stock-scoring"
import { computeMetricsFromCloses, type DailyBar } from "./price-history"
import { computeValuation, classifyValue, type ValueTier } from "./valuation"

export interface BacktestObservation {
  symbol: string
  asOf: string
  qualityScore: number
  strengthTier: string
  actionSignal: string | null
  dataConfidence: string
  forwardReturnPct: number
  benchmarkReturnPct: number
  excessReturnPct: number
  valuationScore: number | null
  valueTier: ValueTier
}

export interface TierStats {
  tier: string
  n: number
  meanExcessPct: number
  medianExcessPct: number
  /** Share of observations that beat the benchmark — the honest "hit rate". */
  hitRatePct: number
}

export interface BacktestResult {
  observations: number
  symbolsTested: number
  horizonDays: number
  byTier: TierStats[]
  bySignal: TierStats[]
  byValueTier: TierStats[]
  /** Same test as quartileSpreadPct but ranked on valuation instead of
   *  quality — the direct test of hypothesis H1. */
  valuationQuartileSpreadPct: number | null
  /** Mean excess of top-quartile scores minus bottom-quartile. The headline:
   *  if the score has no predictive content this sits near zero. */
  quartileSpreadPct: number | null
  notes: string[]
}

// ── Point-in-time reconstruction ───────────────────────────────────────────

// Rebuilds a companyfacts payload as it would have appeared on `asOf`, by
// dropping every datapoint filed after that date. This is what removes
// look-ahead bias, and it's exact rather than approximate: we are not guessing
// when information became public, we are reading the filing date SEC recorded.
export function factsAsOf(facts: CompanyFacts, asOf: string): CompanyFacts {
  const src = (facts as { facts?: Record<string, Record<string, { units?: Record<string, Array<Record<string, unknown>>> }>> }).facts
  if (!src) return facts

  const out: Record<string, Record<string, { units: Record<string, Array<Record<string, unknown>>> }>> = {}

  for (const [taxonomy, tags] of Object.entries(src)) {
    for (const [tag, concept] of Object.entries(tags)) {
      if (!concept?.units) continue
      const keptUnits: Record<string, Array<Record<string, unknown>>> = {}
      for (const [unit, rows] of Object.entries(concept.units)) {
        if (!Array.isArray(rows)) continue
        // A row with no `filed` date can't be proven to have been available,
        // so it is excluded rather than assumed. Conservative by design.
        const kept = rows.filter(r => typeof r.filed === "string" && (r.filed as string) <= asOf)
        if (kept.length > 0) keptUnits[unit] = kept
      }
      if (Object.keys(keptUnits).length > 0) {
        if (!out[taxonomy]) out[taxonomy] = {}
        out[taxonomy][tag] = { units: keptUnits }
      }
    }
  }

  return { ...(facts as Record<string, unknown>), facts: out } as CompanyFacts
}

// ── Scoring a single historical date ───────────────────────────────────────

function closeOn(bars: DailyBar[], iso: string): number | null {
  // Bars are chronological. Take the last close at or before the date, so a
  // weekend or holiday resolves to the prior trading day rather than missing.
  let found: number | null = null
  for (const b of bars) {
    if (b.date <= iso) found = b.close
    else break
  }
  return found
}

export function scoreAsOf(
  facts: CompanyFacts,
  bars: DailyBar[],
  benchmarkBars: DailyBar[],
  asOf: string,
  sicCode: string | null
): {
  qualityScore: number | null; strengthTier: string | null; actionSignal: string | null
  dataConfidence: string; valuationScore: number | null; valueTier: ValueTier
} | null {
  const pit = factsAsOf(facts, asOf)
  const series = extractSeries(pit)
  const fundamentals = normalizeFundamentals(pit, series)

  const priceAt = closeOn(bars, asOf)
  if (priceAt === null) return null

  // Price metrics computed only from bars up to asOf — same discipline as the
  // fundamentals. Using the full series here would leak the future through
  // volatility and momentum.
  const priorCloses = bars.filter(b => b.date <= asOf).map(b => b.close)
  const priorBenchCloses = benchmarkBars.filter(b => b.date <= asOf).map(b => b.close)
  const metrics = priorCloses.length >= 60
    ? computeMetricsFromCloses(priorCloses, priorBenchCloses)
    : null

  const sharesOut = series.sharesOutstanding?.[0]?.value ?? null
  const marketCap = sharesOut ? sharesOut * priceAt : null

  const result = scoreStock({
    fundamentals,
    price: null,
    priceMetrics: metrics as never,
    piotroski: computePiotroski(series),
    altman: computeAltmanZ(series, marketCap, sicCode),
    beneish: computeBeneishM(series),
    sectorRelative: null,
    goingConcernHits: 0,
  })

  // Historical market caps, reconstructed at each fiscal period end from the
  // share count reported for that period and the close on that date. Both
  // inputs are point-in-time, so the valuation history carries no look-ahead
  // either.
  const sharesByEnd = new Map((series.sharesOutstanding ?? []).map(o => [o.end, o.value]))
  const anchorSeries = series.cfo?.length ? series.cfo : series.netIncome
  const historicalMarketCaps = (anchorSeries ?? []).map(o => {
    const sh = sharesByEnd.get(o.end)
    const px = closeOn(bars, o.end)
    return sh && px ? sh * px : null
  })

  const valuation = computeValuation(series, marketCap, historicalMarketCaps)
  const { tier: valueTier } = classifyValue(valuation.valuationScore, result.qualityScore, result.riskScore)

  return {
    qualityScore: result.qualityScore,
    strengthTier: result.strengthTier,
    actionSignal: result.actionSignal,
    dataConfidence: result.dataConfidence,
    valuationScore: valuation.valuationScore,
    valueTier,
  }
}

// ── Aggregation ────────────────────────────────────────────────────────────

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function statsFor(label: string, rows: BacktestObservation[]): TierStats {
  const ex = rows.map(r => r.excessReturnPct)
  return {
    tier: label,
    n: rows.length,
    meanExcessPct: ex.reduce((a, b) => a + b, 0) / ex.length,
    medianExcessPct: median(ex),
    hitRatePct: (rows.filter(r => r.excessReturnPct > 0).length / rows.length) * 100,
  }
}

export function aggregate(obs: BacktestObservation[], horizonDays: number): BacktestResult {
  const notes: string[] = []
  if (obs.length === 0) {
    return { observations: 0, symbolsTested: 0, horizonDays, byTier: [], bySignal: [], byValueTier: [], quartileSpreadPct: null, valuationQuartileSpreadPct: null, notes: ["No observations produced."] }
  }

  const group = (key: (o: BacktestObservation) => string | null) => {
    const m = new Map<string, BacktestObservation[]>()
    for (const o of obs) {
      const k = key(o)
      if (!k) continue
      const arr = m.get(k) ?? []
      arr.push(o)
      m.set(k, arr)
    }
    // A bucket under 10 observations is noise, not a finding.
    return [...m.entries()].filter(([, v]) => v.length >= 10).map(([k, v]) => statsFor(k, v))
  }

  const byTier = group(o => o.strengthTier)
  const bySignal = group(o => o.actionSignal)
  const byValueTier = group(o => o.valueTier)

  // Quartile spread — the cleanest single test of whether the score ranks.
  const sorted = [...obs].sort((a, b) => b.qualityScore - a.qualityScore)
  const q = Math.floor(sorted.length / 4)
  let quartileSpreadPct: number | null = null
  if (q >= 10) {
    const top = sorted.slice(0, q).map(o => o.excessReturnPct)
    const bot = sorted.slice(-q).map(o => o.excessReturnPct)
    quartileSpreadPct =
      top.reduce((a, b) => a + b, 0) / top.length - bot.reduce((a, b) => a + b, 0) / bot.length
  } else {
    notes.push("Sample too small for a quartile spread — needs at least 40 observations.")
  }

  // H1: does ranking on CHEAPNESS separate forward returns where ranking on
  // quality did not?
  let valuationQuartileSpreadPct: number | null = null
  const valued = obs.filter(o => o.valuationScore !== null)
  const vq = Math.floor(valued.length / 4)
  if (vq >= 10) {
    const vs = [...valued].sort((a, b) => (b.valuationScore ?? 0) - (a.valuationScore ?? 0))
    const cheap = vs.slice(0, vq).map(o => o.excessReturnPct)
    const rich = vs.slice(-vq).map(o => o.excessReturnPct)
    valuationQuartileSpreadPct =
      cheap.reduce((a, b) => a + b, 0) / cheap.length - rich.reduce((a, b) => a + b, 0) / rich.length
  }

  notes.push(
    `Every score was computed from filings available on its as-of date; datapoints filed later were discarded, so there is no look-ahead bias.`,
    `Returns are excess of SPY over the same ${horizonDays}-day window.`,
    `These are the criteria as already written. No criterion was selected or tuned against these results.`
  )

  return {
    observations: obs.length,
    symbolsTested: new Set(obs.map(o => o.symbol)).size,
    horizonDays,
    byTier,
    bySignal,
    byValueTier,
    quartileSpreadPct,
    valuationQuartileSpreadPct,
    notes,
  }
}
