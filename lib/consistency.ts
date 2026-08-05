// Multi-year consistency — durability across the cycle, not one good year.
//
// Nearly every ratio in the scorer describes a single fiscal period. That's a
// real blind spot: a company with five consecutive years of free-cash-flow
// generation is a fundamentally different business from one that just had its
// first good year, and a single-period snapshot scores them identically.
//
// The data was already being fetched — extractSeries() returns the full annual
// history and the scorer was only reading indices [0] and [1]. This reads the
// rest, which is why it costs nothing extra in API calls.
//
// What consistency captures that a snapshot cannot:
//   • Profitability streak — how many consecutive years actually profitable.
//   • Cash generation streak — years of positive free cash flow. Harder to
//     manipulate than earnings and the better durability test.
//   • Revenue trend quality — steady compounding versus a lucky spike.
//   • Margin stability — volatile margins signal a business with little pricing
//     power, even when the current margin looks fine.
//   • Dilution discipline — share count over the full window, not just YoY.
import type { FundamentalSeries, AnnualObservation } from "./edgar-normalize"

const MAX_YEARS = 6
const MIN_YEARS_FOR_SCORE = 3

function values(series: AnnualObservation[], years = MAX_YEARS): number[] {
  // Series arrive newest-first; reverse so index order matches time order.
  return series.slice(0, years).map(o => o.value).reverse()
}

function streakOf(vals: number[], predicate: (v: number) => boolean): number {
  // Counts consecutive qualifying years ending at the most recent one.
  let streak = 0
  for (let i = vals.length - 1; i >= 0; i--) {
    if (predicate(vals[i])) streak++
    else break
  }
  return streak
}

function coefficientOfVariation(vals: number[]): number | null {
  if (vals.length < 3) return null
  const mean = vals.reduce((s, v) => s + v, 0) / vals.length
  if (mean === 0) return null
  const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length
  return Math.sqrt(variance) / Math.abs(mean)
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x))
}

export interface ConsistencyDetail {
  profitableYears: number
  positiveFcfYears: number
  revenueGrowthYears: number
  marginStability: number | null   // 0-100, higher = steadier
  dilutionOverWindowPct: number | null
  yearsAnalyzed: number
}

export interface ConsistencyResult {
  score: number | null            // 0-100
  detail: ConsistencyDetail
  yearsOfData: number
  reasons: string[]
}

export function computeConsistency(s: FundamentalSeries): ConsistencyResult {
  const revenue = values(s.revenue)
  const netIncome = values(s.netIncome)
  const cfo = values(s.cfo)
  const capex = values(s.capex)
  const shares = values(s.sharesOutstanding)

  const yearsOfData = Math.max(revenue.length, netIncome.length, cfo.length)

  // Free cash flow per year, aligned on however many years both series cover.
  const fcf: number[] = []
  for (let i = 0; i < cfo.length; i++) {
    const cx = capex[i] ?? 0
    fcf.push(cfo[i] - cx)
  }

  const profitableYears = streakOf(netIncome, v => v > 0)
  const positiveFcfYears = streakOf(fcf, v => v > 0)

  let revenueGrowthYears = 0
  for (let i = revenue.length - 1; i > 0; i--) {
    if (revenue[i] > revenue[i - 1]) revenueGrowthYears++
    else break
  }

  // Margin stability from the net-margin series, not the level.
  const margins: number[] = []
  for (let i = 0; i < Math.min(revenue.length, netIncome.length); i++) {
    if (revenue[i] !== 0) margins.push((netIncome[i] / revenue[i]) * 100)
  }
  const cv = coefficientOfVariation(margins)
  // A coefficient of variation of 0 is perfectly steady; 1.0+ is erratic.
  const marginStability = cv === null ? null : Math.round(clamp((1 - Math.min(cv, 1.5) / 1.5) * 100, 0, 100))

  // Share count across the whole window: positive = net dilution.
  const dilutionOverWindowPct = shares.length >= 2 && shares[0] !== 0
    ? ((shares[shares.length - 1] - shares[0]) / shares[0]) * 100
    : null

  const detail: ConsistencyDetail = {
    profitableYears, positiveFcfYears, revenueGrowthYears,
    marginStability, dilutionOverWindowPct, yearsAnalyzed: yearsOfData,
  }

  if (yearsOfData < MIN_YEARS_FOR_SCORE) {
    return {
      score: null,
      detail,
      yearsOfData,
      reasons: [`Only ${yearsOfData} year${yearsOfData === 1 ? "" : "s"} of filing history — not enough to judge consistency.`],
    }
  }

  const parts: Array<{ weight: number; points: number }> = []
  const reasons: string[] = []

  // Cash-flow durability is weighted highest: it's the hardest to manipulate.
  parts.push({ weight: 30, points: clamp((positiveFcfYears / 5) * 100, 0, 100) })
  if (positiveFcfYears >= 5) reasons.push(`✓ ${positiveFcfYears} consecutive years of positive free cash flow — durable cash generation, not a single good year.`)
  else if (positiveFcfYears === 0) reasons.push("⚠ Did not generate positive free cash flow in the most recent year.")

  parts.push({ weight: 25, points: clamp((profitableYears / 5) * 100, 0, 100) })
  if (profitableYears >= 5) reasons.push(`✓ Profitable in each of the last ${profitableYears} years.`)
  else if (profitableYears === 0) reasons.push("⚠ Not profitable in the most recent year.")

  parts.push({ weight: 20, points: clamp((revenueGrowthYears / 4) * 100, 0, 100) })
  if (revenueGrowthYears >= 4) reasons.push(`✓ Revenue grew in each of the last ${revenueGrowthYears} years — compounding rather than spiking.`)

  if (marginStability !== null) {
    parts.push({ weight: 15, points: marginStability })
    if (marginStability >= 80) reasons.push("✓ Margins have been steady across the window — a sign of pricing power.")
    else if (marginStability <= 35) reasons.push("⚠ Margins swing widely year to year, which usually means limited pricing power or a cyclical end market.")
  }

  if (dilutionOverWindowPct !== null) {
    // -20% (heavy buyback) scores 100; +20% (heavy dilution) scores 0.
    parts.push({ weight: 10, points: clamp(50 - dilutionOverWindowPct * 2.5, 0, 100) })
    if (dilutionOverWindowPct <= -10) reasons.push(`✓ Share count shrank ${Math.abs(dilutionOverWindowPct).toFixed(0)}% across the window — sustained buybacks.`)
    else if (dilutionOverWindowPct >= 15) reasons.push(`⚠ Share count grew ${dilutionOverWindowPct.toFixed(0)}% across the window — sustained dilution of existing holders.`)
  }

  const totalWeight = parts.reduce((sum, p) => sum + p.weight, 0)
  const score = Math.round(parts.reduce((sum, p) => sum + p.points * p.weight, 0) / totalWeight)

  return {
    score,
    detail,
    yearsOfData,
    reasons: reasons.length > 0 ? reasons : [`${yearsOfData} years of history analyzed; no consistency pattern stands out.`],
  }
}
