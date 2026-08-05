// Forward-looking signals — what a company has COMMITTED to or is INVESTING in,
// as opposed to what it already earned.
//
// This is the difference between backward-looking analysis (every ratio in
// stock-scoring.ts describes a period that already closed) and something with
// predictive content. All of it comes from structured XBRL, so unlike
// management narrative it can't be spun:
//
//   • Remaining Performance Obligation (RPO) — revenue already under contract
//     but not yet recognized. This is the single best forward indicator in
//     public filings because it's a signed commitment, not a projection.
//     Verified live: Microsoft carries $684B of RPO against ~$300B of annual
//     revenue — more than two years of contracted future business.
//   • R&D intensity — what share of revenue is being spent building the next
//     product cycle rather than harvesting the current one.
//   • Capex intensity and growth — building physical capacity is a costly,
//     hard-to-fake signal that management expects demand.
//   • Deferred revenue growth — customers paying ahead of delivery.
//   • Revenue acceleration — the second derivative. Growth going from 5% to
//     15% is a different story than 15% holding flat, and neither shows up in
//     a single growth number.
import type { FundamentalSeries } from "./edgar-normalize"
import { seriesAt as at } from "./edgar-normalize"

export interface ForwardSignals {
  rpoUsd: number | null
  rpoToRevenueYears: number | null      // years of revenue already contracted
  rpoGrowthYoyPct: number | null
  rndIntensityPct: number | null        // R&D / revenue
  rndGrowthYoyPct: number | null
  capexIntensityPct: number | null      // capex / revenue
  capexGrowthYoyPct: number | null
  deferredRevenueGrowthYoyPct: number | null
  revenueAccelerationPct: number | null // this year's growth minus last year's
  forwardScore: number | null           // 0-100 composite
  forwardReasons: string[]
  fieldsPresent: number
}

function growth(current: number | null, prior: number | null): number | null {
  if (current === null || prior === null || prior === 0) return null
  const g = ((current - prior) / Math.abs(prior)) * 100
  return isFinite(g) ? g : null
}

function ratioPct(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator === 0) return null
  const r = (numerator / denominator) * 100
  return isFinite(r) ? r : null
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x))
}

export function computeForwardSignals(s: FundamentalSeries): ForwardSignals {
  const revenue = at(s.revenue, 0)
  const revenuePrior = at(s.revenue, 1)
  const revenuePrior2 = at(s.revenue, 2)

  const rpoUsd = at(s.remainingPerformanceObligation, 0)
  const rpoPrior = at(s.remainingPerformanceObligation, 1)
  const rnd = at(s.researchAndDevelopment, 0)
  const rndPrior = at(s.researchAndDevelopment, 1)
  const capex = at(s.capex, 0)
  const capexPrior = at(s.capex, 1)
  const deferred = at(s.deferredRevenue, 0)
  const deferredPrior = at(s.deferredRevenue, 1)

  const rpoToRevenueYears = rpoUsd !== null && revenue !== null && revenue > 0 ? rpoUsd / revenue : null
  const rpoGrowthYoyPct = growth(rpoUsd, rpoPrior)
  const rndIntensityPct = ratioPct(rnd, revenue)
  const rndGrowthYoyPct = growth(rnd, rndPrior)
  const capexIntensityPct = ratioPct(capex, revenue)
  const capexGrowthYoyPct = growth(capex, capexPrior)
  const deferredRevenueGrowthYoyPct = growth(deferred, deferredPrior)

  const growthNow = growth(revenue, revenuePrior)
  const growthPrior = growth(revenuePrior, revenuePrior2)
  const revenueAccelerationPct = growthNow !== null && growthPrior !== null ? growthNow - growthPrior : null

  // Weighted composite over whatever is available, renormalized — same
  // philosophy as the main scorer: a missing input is never treated as a zero.
  const parts: Array<{ label: string; weight: number; points: number }> = []
  const reasons: string[] = []

  if (rpoToRevenueYears !== null) {
    // 1 year of contracted backlog is genuinely strong; 2+ is exceptional.
    parts.push({ label: "Contracted backlog", weight: 30, points: clamp(rpoToRevenueYears * 55, 0, 100) })
    if (rpoToRevenueYears >= 1) {
      reasons.push(`✓ ${rpoToRevenueYears.toFixed(1)} years of revenue is already under contract but not yet recognized — future business that is committed, not forecast.`)
    } else if (rpoToRevenueYears >= 0.4) {
      reasons.push(`${(rpoToRevenueYears * 12).toFixed(0)} months of revenue is already contracted.`)
    }
  }

  if (rpoGrowthYoyPct !== null) {
    parts.push({ label: "Backlog growth", weight: 15, points: clamp(50 + rpoGrowthYoyPct * 1.5, 0, 100) })
    if (rpoGrowthYoyPct > 20) reasons.push(`✓ Contracted backlog grew ${rpoGrowthYoyPct.toFixed(0)}% — demand is being locked in faster than it's being delivered.`)
    else if (rpoGrowthYoyPct < -10) reasons.push(`⚠ Contracted backlog shrank ${Math.abs(rpoGrowthYoyPct).toFixed(0)}% — future committed revenue is declining.`)
  }

  if (revenueAccelerationPct !== null) {
    parts.push({ label: "Revenue acceleration", weight: 20, points: clamp(50 + revenueAccelerationPct * 3, 0, 100) })
    if (revenueAccelerationPct > 5) reasons.push(`✓ Growth is accelerating — up ${revenueAccelerationPct.toFixed(1)} points versus the prior year's rate.`)
    else if (revenueAccelerationPct < -5) reasons.push(`⚠ Growth is decelerating — down ${Math.abs(revenueAccelerationPct).toFixed(1)} points versus the prior year's rate.`)
  }

  if (rndIntensityPct !== null) {
    // Meaningful reinvestment without being so high it signals no operating leverage.
    parts.push({ label: "R&D intensity", weight: 15, points: clamp(rndIntensityPct * 5, 0, 100) })
    if (rndIntensityPct >= 12) reasons.push(`✓ Reinvesting ${rndIntensityPct.toFixed(1)}% of revenue into R&D — funding the next product cycle, not just harvesting the current one.`)
  }

  if (capexGrowthYoyPct !== null && capexIntensityPct !== null) {
    parts.push({ label: "Capacity investment", weight: 12, points: clamp(50 + capexGrowthYoyPct * 0.6, 0, 100) })
    if (capexGrowthYoyPct > 40 && capexIntensityPct > 8) {
      reasons.push(`✓ Capital spending rose ${capexGrowthYoyPct.toFixed(0)}% — management is building capacity, an expensive bet that demand is coming.`)
    }
  }

  if (deferredRevenueGrowthYoyPct !== null) {
    parts.push({ label: "Prepaid demand", weight: 8, points: clamp(50 + deferredRevenueGrowthYoyPct * 1.5, 0, 100) })
    if (deferredRevenueGrowthYoyPct > 20) reasons.push(`✓ Deferred revenue grew ${deferredRevenueGrowthYoyPct.toFixed(0)}% — customers are paying ahead of delivery.`)
  }

  const fieldsPresent = parts.length
  if (fieldsPresent === 0) {
    return {
      rpoUsd, rpoToRevenueYears, rpoGrowthYoyPct, rndIntensityPct, rndGrowthYoyPct,
      capexIntensityPct, capexGrowthYoyPct, deferredRevenueGrowthYoyPct, revenueAccelerationPct,
      forwardScore: null,
      forwardReasons: ["This company doesn't report the forward-looking figures (backlog, R&D, deferred revenue) that would support a forward view."],
      fieldsPresent: 0,
    }
  }

  const totalWeight = parts.reduce((sum, p) => sum + p.weight, 0)
  const forwardScore = Math.round(parts.reduce((sum, p) => sum + p.points * p.weight, 0) / totalWeight)

  return {
    rpoUsd, rpoToRevenueYears, rpoGrowthYoyPct, rndIntensityPct, rndGrowthYoyPct,
    capexIntensityPct, capexGrowthYoyPct, deferredRevenueGrowthYoyPct, revenueAccelerationPct,
    forwardScore,
    forwardReasons: reasons.length > 0 ? reasons : ["Forward indicators are present but unremarkable in either direction."],
    fieldsPresent,
  }
}
