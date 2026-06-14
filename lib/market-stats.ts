// #8 Neighborhood snapshot — area stats derived from the current search's leads
// (no external API). Median $/sqft doubles as the auto-ARV fallback for leads
// that have no value of their own. Pure & synchronous.

import type { ForeclosureLead } from "@/lib/agents/foreclosure-agent"

export interface MarketSnapshot {
  count:           number
  hot:             number
  medianValue:     number | null
  medianPsf:       number | null   // median $/sqft across valued leads
  medianEquityPct: number | null
  avgScore:        number
  withValue:       number          // how many leads had a real value
}

function median(nums: number[]): number | null {
  const a = nums.filter((n) => Number.isFinite(n) && n > 0).sort((x, y) => x - y)
  if (!a.length) return null
  const m = Math.floor(a.length / 2)
  return a.length % 2 ? Math.round(a[m]) : Math.round((a[m - 1] + a[m]) / 2)
}

export function marketSnapshot(leads: ForeclosureLead[]): MarketSnapshot {
  const valued = leads.map((l) => l.avmValue ?? l.estimatedValue ?? 0).filter((v) => v > 0)
  const psf = leads
    .map((l) => { const v = l.avmValue ?? l.estimatedValue ?? 0; return v > 0 && l.sqft && l.sqft > 200 ? v / l.sqft : 0 })
    .filter((v) => v > 0)
  const eq = leads.map((l) => l.equityPercent ?? NaN).filter((n) => Number.isFinite(n))
  return {
    count:           leads.length,
    hot:             leads.filter((l) => l.priority === "HOT").length,
    medianValue:     median(valued),
    medianPsf:       median(psf),
    medianEquityPct: median(eq),
    avgScore:        leads.length ? Math.round(leads.reduce((s, l) => s + (l.score ?? 0), 0) / leads.length) : 0,
    withValue:       valued.length,
  }
}
