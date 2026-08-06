// Valuation axis — quality relative to the price being paid for it.
//
// WHY THIS EXISTS. The point-in-time backtest (see
// STOCK_CRYPTO_ANALYSIS_IMPLEMENTATION.md §4) found the quality score has no
// forward-return edge: quartile spread +0.06% at 90 days, -0.60% at one year.
// That result is not a bug, and it is not surprising. Quality is public,
// heavily analyzed, and already reflected in the price. Buying excellent
// companies at any price does not generate return — buying anything for less
// than it is worth does.
//
// So this measures a different thing from every other file in the scoring
// system: not "is this a good business" but "is this cheap relative to what it
// has historically cost". Those are independent questions and must be scored
// independently, exactly as strength and risk already are.
//
// PRE-REGISTRATION. This file is committed BEFORE it is backtested, so the
// specification is fixed in git history ahead of any result. Everything below
// is stated in advance:
//
//   H1: valuation percentile has a positive relationship with forward excess
//       return (cheap outperforms).
//   H2: the combination of decent-quality AND cheap outperforms either alone.
//   H3: cheap-and-deteriorating (the classic value trap) underperforms cheap
//       alone.
//
// Whatever the backtest returns is what gets reported. No threshold in this
// file may be adjusted in response to results — doing so would fit the sample
// and make any published figure fiction.

import type { FundamentalSeries } from "./edgar-normalize"

export interface ValuationResult {
  /** Trailing earnings yield (inverse P/E), as a percentage. Negative when the
   *  company lost money — deliberately not clamped, since a loss is real. */
  earningsYieldPct: number | null
  /** Free-cash-flow yield. The more reliable of the two: harder to manage than
   *  reported earnings, and defined for companies with accounting losses but
   *  real cash generation. */
  fcfYieldPct: number | null
  salesYieldPct: number | null
  /** Where today's yield sits within this company's OWN trailing history,
   *  0-100. High = cheap versus its own past. */
  ownHistoryPercentile: number | null
  /** 0-100 composite. Higher = cheaper. Null when nothing is computable. */
  valuationScore: number | null
  reasons: string[]
}

// YIELDS, NOT MULTIPLES. P/E is undefined at zero earnings and flips sign
// through it, so a company going from +$1 to -$1 of profit swings from a P/E of
// 300 to -300 while the business barely changed. The inverse is continuous
// across zero and rank-orders correctly without special cases.
function yieldPct(flow: number | null, marketCap: number | null): number | null {
  if (flow === null || marketCap === null || marketCap <= 0) return null
  return (flow / marketCap) * 100
}

// A minimum of five annual observations before an own-history percentile means
// anything. Below that the "percentile" is just a rank among three numbers.
const MIN_HISTORY_YEARS = 5

// Rank of `current` within `history`, 0-100.
function percentileOf(current: number, history: number[]): number {
  const below = history.filter(h => h < current).length
  return (below / history.length) * 100
}

export function computeValuation(
  series: FundamentalSeries,
  marketCapUsd: number | null,
  /** Market cap at each historical fiscal year end, aligned to `series` order.
   *  Required for the own-history percentile; without it only current yields
   *  are computed. */
  historicalMarketCaps: Array<number | null> = []
): ValuationResult {
  const reasons: string[] = []

  const netIncome = series.netIncome?.[0]?.value ?? null
  const revenue = series.revenue?.[0]?.value ?? null
  const cfo = series.cfo?.[0]?.value ?? null
  const capex = series.capex?.[0]?.value ?? null
  const fcf = cfo !== null && capex !== null ? cfo - Math.abs(capex) : null

  const earningsYieldPct = yieldPct(netIncome, marketCapUsd)
  const fcfYieldPct = yieldPct(fcf, marketCapUsd)
  const salesYieldPct = yieldPct(revenue, marketCapUsd)

  // ── Own-history percentile ───────────────────────────────────────────────
  //
  // Comparing a company's multiple to a market or sector average is far less
  // informative than comparing it to itself. A software company at 30x
  // earnings is not "expensive" relative to a utility at 15x; it is expensive
  // relative to its own 20x median. Self-comparison removes the sector effect
  // entirely rather than trying to adjust for it.
  let ownHistoryPercentile: number | null = null

  const preferred = fcfYieldPct !== null ? "fcf" : "earnings"
  const currentYield = preferred === "fcf" ? fcfYieldPct : earningsYieldPct

  if (currentYield !== null && historicalMarketCaps.length >= MIN_HISTORY_YEARS) {
    // Align capex to CFO by PERIOD END, never by array index. The two series
    // can cover different sets of years, and index-pairing them silently
    // subtracts one year's capex from another year's cash flow — the same
    // class of period-misalignment bug that once produced a 73% gross margin
    // for Apple.
    const capexByEnd = new Map((series.capex ?? []).map(o => [o.end, o.value]))
    const flows = preferred === "fcf"
      ? (series.cfo ?? []).map(o => {
          const cx = capexByEnd.get(o.end)
          return cx === undefined ? null : o.value - Math.abs(cx)
        })
      : (series.netIncome ?? []).map(o => o.value)

    const historicalYields: number[] = []
    for (let i = 0; i < Math.min(flows.length, historicalMarketCaps.length); i++) {
      const y = yieldPct(flows[i], historicalMarketCaps[i])
      if (y !== null) historicalYields.push(y)
    }

    if (historicalYields.length >= MIN_HISTORY_YEARS) {
      ownHistoryPercentile = percentileOf(currentYield, historicalYields)
      if (ownHistoryPercentile >= 75) {
        reasons.push(`Trading at a higher ${preferred === "fcf" ? "free-cash-flow" : "earnings"} yield than in ${ownHistoryPercentile.toFixed(0)}% of its own history — cheap versus how the market has usually priced it.`)
      } else if (ownHistoryPercentile <= 25) {
        reasons.push(`Trading at a lower ${preferred === "fcf" ? "free-cash-flow" : "earnings"} yield than in ${(100 - ownHistoryPercentile).toFixed(0)}% of its own history — expensive versus its own past.`)
      }
    }
  }

  // ── Composite ────────────────────────────────────────────────────────────
  //
  // The own-history percentile carries the composite when available, because
  // it is the only component that is comparable across companies. Absolute
  // yield is a weak secondary: a 10% FCF yield genuinely is cheap in most
  // contexts, but the threshold is not sector-neutral, so it gets less weight.
  const parts: Array<{ value: number; weight: number }> = []
  if (ownHistoryPercentile !== null) parts.push({ value: ownHistoryPercentile, weight: 0.7 })
  if (fcfYieldPct !== null) {
    // 0% yield -> 0, 10% yield -> 100, clipped. Clipping matters: one bad
    // datapoint producing a 900% yield must not dominate the composite.
    parts.push({ value: Math.max(0, Math.min(100, fcfYieldPct * 10)), weight: 0.3 })
  } else if (earningsYieldPct !== null) {
    parts.push({ value: Math.max(0, Math.min(100, earningsYieldPct * 10)), weight: 0.3 })
  }

  // Weight renormalization, never zero-fill — same rule as every other scorer
  // here. A missing component must not be scored as "expensive".
  let valuationScore: number | null = null
  if (parts.length > 0) {
    const totalWeight = parts.reduce((s, p) => s + p.weight, 0)
    valuationScore = Math.round(parts.reduce((s, p) => s + p.value * p.weight, 0) / totalWeight)
  }

  if (fcfYieldPct !== null && fcfYieldPct < 0) {
    reasons.push("Free cash flow is negative, so there is no cash yield to buy — the valuation case has to rest on future cash, not current.")
  }

  return { earningsYieldPct, fcfYieldPct, salesYieldPct, ownHistoryPercentile, valuationScore, reasons }
}

// ── Combining quality with valuation ───────────────────────────────────────

export type ValueTier = "cheap_and_sound" | "cheap_but_impaired" | "fair" | "expensive" | "unknown"

// H2/H3 above, expressed as gates rather than as an average.
//
// Averaging quality and valuation would let a very cheap price paper over a
// failing business, which is precisely the value trap this must avoid. The
// distinction that matters is not cheap-vs-expensive but cheap-and-sound
// versus cheap-and-deteriorating, so soundness is a gate and not a term.
const CHEAP_PERCENTILE = 65
const SOUNDNESS_FLOOR = 45

export function classifyValue(
  valuationScore: number | null,
  qualityScore: number | null,
  riskScore: number | null
): { tier: ValueTier; rationale: string } {
  if (valuationScore === null || qualityScore === null) {
    return { tier: "unknown", rationale: "Not enough data to judge price against quality." }
  }

  const cheap = valuationScore >= CHEAP_PERCENTILE
  const sound = qualityScore >= SOUNDNESS_FLOOR && (riskScore === null || riskScore < 70)

  if (cheap && sound) {
    return {
      tier: "cheap_and_sound",
      rationale: "Priced below its own historical norm while the underlying business still scores as sound — the combination that has to be present for a discount to be an opportunity rather than a warning.",
    }
  }
  if (cheap && !sound) {
    return {
      tier: "cheap_but_impaired",
      rationale: "Cheap versus its own history, but the business itself scores weak or carries high risk. A low price attached to a deteriorating business is usually correct pricing, not a discount.",
    }
  }
  if (valuationScore <= 35) {
    return {
      tier: "expensive",
      rationale: "Priced above its own historical norm. Quality can be excellent and the price can still already reflect it.",
    }
  }
  return { tier: "fair", rationale: "Priced broadly in line with its own history." }
}
