// Walk-forward weight fitting — learning from measured outcomes.
//
// THE ONLY RULE THAT MATTERS HERE. Fit on an EARLY period, evaluate on a LATER
// period, and never let the later period influence a single choice. Fit on the
// whole sample and you get a beautiful accuracy figure that describes noise in
// this particular dataset and nothing about the future. That is not a subtle
// statistical point — it is the single most common way quantitative results are
// fabricated, usually without anyone intending to fabricate anything.
//
// This system already has both halves of a supervised problem, which is why
// this is possible at all without an ML stack:
//
//   Features: every company scored point-in-time via factsAsOf(), which
//   reconstructs exactly what was knowable on a date by discarding anything
//   filed after it. No look-ahead in the inputs.
//
//   Labels: forward excess return versus SPY over the same window.
//
// WHAT IT LEARNS, AND WHY IT IS DELIBERATELY SIMPLE. It fits ONE number per
// feature: how much that feature's rank should count toward a combined score.
// A richer model would fit better and generalise worse — with a few thousand
// overlapping observations across one broad market regime, anything with many
// parameters will memorise the sample. A linear combination of ranks is the
// most expressive thing this much data honestly supports.
//
// WHY RANKS RATHER THAN RAW VALUES. Raw financial values are wildly
// scale-dependent and heavy-tailed, so one company with a 900% FCF yield from a
// bad datapoint would dominate any fit. Ranking within each period removes that
// entirely and makes weights comparable across features measured in different
// units.
import type { BacktestObservation } from "./backtest"

export interface FeatureVector {
  qualityScore: number | null
  valuationScore: number | null
  piotroskiScore: number | null
  riskScore: number | null
}

export interface LabelledObservation extends BacktestObservation {
  features: FeatureVector
}

export type FeatureName = keyof FeatureVector

export const FEATURES: FeatureName[] = ["qualityScore", "valuationScore", "piotroskiScore", "riskScore"]

export interface FittedWeights {
  weights: Record<FeatureName, number>
  trainPeriod: { from: string; to: string; n: number }
  testPeriod: { from: string; to: string; n: number }
  /** Out-of-sample quartile spread using the fitted weights. THE number. */
  testQuartileSpreadPct: number | null
  /** In-sample spread, reported only to show the gap. A large gap IS overfitting. */
  trainQuartileSpreadPct: number | null
  notes: string[]
}

// Converts values to within-period percentile ranks, so weights are comparable
// and no outlier can dominate.
function rankWithinPeriod(obs: LabelledObservation[], feature: FeatureName): Map<string, number> {
  const byPeriod = new Map<string, LabelledObservation[]>()
  for (const o of obs) {
    const arr = byPeriod.get(o.asOf) ?? []
    arr.push(o)
    byPeriod.set(o.asOf, arr)
  }

  const ranks = new Map<string, number>()
  for (const [, group] of byPeriod) {
    const valued = group.filter(g => g.features[feature] !== null)
    if (valued.length < 5) continue
    const sorted = [...valued].sort((a, b) => (a.features[feature] as number) - (b.features[feature] as number))
    sorted.forEach((o, i) => {
      ranks.set(`${o.symbol}|${o.asOf}`, (i / (sorted.length - 1)) * 100)
    })
  }
  return ranks
}

function quartileSpread(scored: Array<{ score: number; excess: number }>): number | null {
  if (scored.length < 40) return null
  const sorted = [...scored].sort((a, b) => b.score - a.score)
  const q = Math.floor(sorted.length / 4)
  const top = sorted.slice(0, q).reduce((s, x) => s + x.excess, 0) / q
  const bot = sorted.slice(-q).reduce((s, x) => s + x.excess, 0) / q
  return top - bot
}

// Correlation between a feature's rank and forward excess return, computed ONLY
// on training data. This is the weight: a feature that ranked winners above
// losers in the training period gets positive weight proportional to how
// reliably it did so.
function fitWeight(train: LabelledObservation[], ranks: Map<string, number>): number {
  const pairs: Array<[number, number]> = []
  for (const o of train) {
    const r = ranks.get(`${o.symbol}|${o.asOf}`)
    if (r === undefined) continue
    pairs.push([r, o.excessReturnPct])
  }
  if (pairs.length < 30) return 0

  const n = pairs.length
  const meanX = pairs.reduce((s, p) => s + p[0], 0) / n
  const meanY = pairs.reduce((s, p) => s + p[1], 0) / n
  let num = 0, denX = 0, denY = 0
  for (const [x, y] of pairs) {
    const dx = x - meanX, dy = y - meanY
    num += dx * dy; denX += dx * dx; denY += dy * dy
  }
  if (denX === 0 || denY === 0) return 0
  return num / Math.sqrt(denX * denY)
}

export function fitWalkForward(
  observations: LabelledObservation[],
  splitDate: string
): FittedWeights {
  const train = observations.filter(o => o.asOf < splitDate)
  const test = observations.filter(o => o.asOf >= splitDate)

  const notes: string[] = []
  const weights = {} as Record<FeatureName, number>

  if (train.length < 100 || test.length < 100) {
    for (const f of FEATURES) weights[f] = 0
    return {
      weights,
      trainPeriod: { from: train[0]?.asOf ?? "-", to: train.at(-1)?.asOf ?? "-", n: train.length },
      testPeriod: { from: test[0]?.asOf ?? "-", to: test.at(-1)?.asOf ?? "-", n: test.length },
      testQuartileSpreadPct: null, trainQuartileSpreadPct: null,
      notes: [`Too few observations to fit honestly: ${train.length} train, ${test.length} test. Both need at least 100.`],
    }
  }

  // Ranks are computed within each period across the FULL sample, which is safe
  // because ranking is relative to contemporaneous peers and uses no outcome
  // information whatsoever. The weights below are fitted on training rows only.
  const rankMaps = new Map<FeatureName, Map<string, number>>()
  for (const f of FEATURES) rankMaps.set(f, rankWithinPeriod(observations, f))

  for (const f of FEATURES) {
    weights[f] = fitWeight(train, rankMaps.get(f)!)
  }

  const scoreOf = (o: LabelledObservation): number | null => {
    let total = 0, used = 0
    for (const f of FEATURES) {
      const r = rankMaps.get(f)!.get(`${o.symbol}|${o.asOf}`)
      if (r === undefined) continue
      total += r * weights[f]
      used++
    }
    // Weight renormalisation, same rule as every scorer here: a missing feature
    // must not be scored as a zero.
    return used > 0 ? total / used : null
  }

  const build = (rows: LabelledObservation[]) =>
    rows.map(o => ({ score: scoreOf(o), excess: o.excessReturnPct }))
        .filter((x): x is { score: number; excess: number } => x.score !== null)

  const trainQuartileSpreadPct = quartileSpread(build(train))
  const testQuartileSpreadPct = quartileSpread(build(test))

  notes.push(
    `Fitted on ${train.length} observations before ${splitDate}; evaluated on ${test.length} observations from ${splitDate} onward. The test period influenced no weight.`,
    `Weights are rank correlations from the training period only. Ranks are within-period, so no outlier can dominate and weights are comparable across features measured in different units.`,
  )

  if (trainQuartileSpreadPct !== null && testQuartileSpreadPct !== null) {
    const gap = trainQuartileSpreadPct - testQuartileSpreadPct
    if (gap > 3) {
      notes.push(`⚠ In-sample spread exceeds out-of-sample by ${gap.toFixed(2)} points. That gap IS overfitting: the weights describe the training period better than they describe the future. Treat the out-of-sample figure as the only real one.`)
    }
    if (testQuartileSpreadPct <= 0) {
      notes.push(`The fitted combination has no out-of-sample edge. Reporting that plainly is the point of running this — a fit that fails is information, and adjusting the features until it passes would make any published figure fiction.`)
    }
  }

  return {
    weights,
    trainPeriod: { from: train[0]?.asOf ?? "-", to: train.at(-1)?.asOf ?? "-", n: train.length },
    testPeriod: { from: test[0]?.asOf ?? "-", to: test.at(-1)?.asOf ?? "-", n: test.length },
    testQuartileSpreadPct, trainQuartileSpreadPct, notes,
  }
}
