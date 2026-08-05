// Position context — where an asset currently sits relative to its OWN history.
//
// This is the honest version of "when to go in or get out." What can actually
// be computed from data is: is this expensive or cheap versus how it has
// traded, is the trend up or down, and how far is it from its peak. What
// CANNOT be computed is when to buy or sell, how much to allocate, or what any
// particular person should do — that depends on circumstances no dataset here
// contains, and stating it would be advice rather than information.
//
// So every field below is a factual observation about price history, and the
// labels are descriptive conditions ("trading near the top of its 1-year
// range") rather than instructions ("take profits"). That distinction is
// deliberate and load-bearing, both for honesty and for compliance.
import type { DailyBar } from "./price-history"

export type TrendState = "uptrend" | "downtrend" | "sideways" | "unknown"

export interface PositionContext {
  pricePercentile1y: number | null   // 0 = 1-year low, 100 = 1-year high
  trendState: TrendState
  above200dMa: boolean | null
  ma50: number | null
  ma200: number | null
  distanceFrom52HighPct: number | null
  distanceFrom52LowPct: number | null
  /** Descriptive conditions, never instructions. */
  conditions: string[]
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((s, v) => s + v, 0) / values.length
}

export function computePositionContext(bars: DailyBar[]): PositionContext {
  const empty: PositionContext = {
    pricePercentile1y: null, trendState: "unknown", above200dMa: null,
    ma50: null, ma200: null, distanceFrom52HighPct: null, distanceFrom52LowPct: null,
    conditions: [],
  }
  if (bars.length < 60) return empty

  const closes = bars.map(b => b.close)
  const last = closes[closes.length - 1]
  const yearWindow = closes.slice(-252)

  const high = Math.max(...yearWindow)
  const low = Math.min(...yearWindow)
  const range = high - low
  const pricePercentile1y = range > 0 ? Math.round(((last - low) / range) * 100) : null

  const ma50 = mean(closes.slice(-50))
  const ma200 = closes.length >= 200 ? mean(closes.slice(-200)) : null
  const above200dMa = ma200 !== null ? last > ma200 : null

  let trendState: TrendState = "unknown"
  if (ma50 !== null && ma200 !== null) {
    // Classic regime read: price above the long average AND the short average
    // above the long one is an established uptrend; the inverse is a downtrend.
    if (last > ma200 && ma50 > ma200) trendState = "uptrend"
    else if (last < ma200 && ma50 < ma200) trendState = "downtrend"
    else trendState = "sideways"
  }

  const distanceFrom52HighPct = high > 0 ? ((last - high) / high) * 100 : null
  const distanceFrom52LowPct = low > 0 ? ((last - low) / low) * 100 : null

  const conditions: string[] = []
  if (pricePercentile1y !== null) {
    if (pricePercentile1y >= 85) conditions.push(`Trading in the top ${100 - pricePercentile1y}% of its 1-year range — historically expensive relative to its own recent history.`)
    else if (pricePercentile1y <= 15) conditions.push(`Trading in the bottom ${pricePercentile1y}% of its 1-year range — historically cheap relative to its own recent history.`)
    else conditions.push(`Sitting mid-range for the past year (${pricePercentile1y}th percentile).`)
  }
  if (trendState === "uptrend") conditions.push("In an established uptrend — above its 200-day average with the 50-day above the 200-day.")
  else if (trendState === "downtrend") conditions.push("In an established downtrend — below its 200-day average with the 50-day below the 200-day.")
  else if (trendState === "sideways") conditions.push("Trend is mixed — short- and long-term averages disagree.")

  if (distanceFrom52HighPct !== null && distanceFrom52HighPct < -25) {
    conditions.push(`Down ${Math.abs(distanceFrom52HighPct).toFixed(0)}% from its 1-year high.`)
  }

  return {
    pricePercentile1y, trendState, above200dMa, ma50, ma200,
    distanceFrom52HighPct, distanceFrom52LowPct, conditions,
  }
}

// Combines position context with the fundamental/risk read into a single
// plain-language situation description. Still descriptive: it reports the
// combination of conditions, it does not tell anyone what to do about them.
export function describeSituation(params: {
  ctx: PositionContext
  qualityScore: number | null
  riskScore: number | null
  forwardScore: number | null
}): string {
  const { ctx, qualityScore, riskScore, forwardScore } = params
  if (qualityScore === null) return "Not enough data to describe this asset's current situation."

  const strong = qualityScore >= 65
  const risky = (riskScore ?? 50) >= 55
  const improving = forwardScore !== null && forwardScore >= 60
  const cheap = ctx.pricePercentile1y !== null && ctx.pricePercentile1y <= 30
  const rich = ctx.pricePercentile1y !== null && ctx.pricePercentile1y >= 80

  if (strong && improving && cheap) {
    return "Strong current fundamentals and improving forward indicators, while trading toward the lower end of its own 1-year range."
  }
  if (strong && improving && rich) {
    return "Strong fundamentals and improving forward indicators, but already trading near the top of its 1-year range — the quality is not in dispute, the entry price is where the debate sits."
  }
  if (strong && risky) {
    return "Fundamentally solid but carrying elevated risk flags — the strength and the danger are both real and shouldn't be netted against each other."
  }
  if (!strong && cheap && improving) {
    return "Weak on current fundamentals but forward indicators are improving while the price sits low in its range — the classic turnaround setup, which is also the classic value trap setup. The distinguishing evidence is whether the improvement persists."
  }
  if (!strong && ctx.trendState === "downtrend") {
    return "Weak fundamentals in an established downtrend — both the business and the market's read on it are pointing the same direction."
  }
  if (strong) return "Strong fundamentals with no unusual pricing or trend condition standing out."
  return "A middling profile — nothing in the fundamentals, forward indicators, or price behavior stands out in either direction."
}
