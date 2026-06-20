// Market snapshot — turns the area's search results into an investor's market
// read: value distribution, distress density, deal quality, equity, rent yield,
// hidden-gem count, and the hottest ZIPs. All computed from data we already
// pulled (no external API). Pure, synchronous, null-safe.

import type { ForeclosureLead } from "@/lib/agents/foreclosure-agent"
import { fuseSignals } from "@/lib/signal-fusion"
import { predictPreForeclosure } from "@/lib/predictive"
import { opportunityScore } from "@/lib/opportunity"

export interface ZipStat { zip: string; count: number; medianValue: number | null; distress: number }

export interface MarketReport {
  n:             number
  medianValue:   number | null
  psf:           number | null     // median $/sqft
  avgScore:      number
  distressRate:  number            // % of leads with >=1 corroborated distress signal
  predictedRate: number            // % at-risk (predicted)
  gemCount:      number            // hidden gems (opportunity tier)
  avgEquity:     number | null
  rentYield:     number | null     // median gross annual rent / value, %
  medianRent:    number | null     // long-term monthly rent (est when no data)
  capRate:       number | null     // NOI / value, %
  topZips:       ZipStat[]
  insights:      string[]
}

function median(ns: number[]): number | null {
  const a = ns.filter((n) => Number.isFinite(n) && n > 0).sort((x, y) => x - y)
  if (!a.length) return null
  const m = Math.floor(a.length / 2)
  return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2)
}

const valueOf = (l: ForeclosureLead): number => l.avmValue ?? l.estimatedValue ?? 0

// `real` lets the caller override the (distressed-sample) median value/rent with
// authoritative ACS numbers so every downstream metric + insight is consistent.
export function analyzeMarket(leads: ForeclosureLead[], real?: { value?: number | null; rent?: number | null }): MarketReport {
  const n = leads.length
  const values = leads.map(valueOf)
  const psfs = leads.filter((l) => l.sqft && l.sqft > 200 && valueOf(l) > 0).map((l) => valueOf(l) / l.sqft!)
  const equities = leads.map((l) => l.equityPercent).filter((e): e is number => e != null && e >= 0)
  const yields = leads
    .filter((l) => l.rentEstimate && valueOf(l) > 0)
    .map((l) => (l.rentEstimate! * 12) / valueOf(l) * 100)

  let distress = 0, predicted = 0, gems = 0
  for (const l of leads) {
    if (fuseSignals(l).count >= 1) distress++
    if (predictPreForeclosure(l).predicted) predicted++
    if (opportunityScore(l).tier === "gem") gems++
  }

  // Per-ZIP rollup.
  const byZip = new Map<string, { vals: number[]; distress: number; count: number }>()
  for (const l of leads) {
    const zip = (l.zip || "").slice(0, 5)
    if (!zip) continue
    const z = byZip.get(zip) ?? { vals: [], distress: 0, count: 0 }
    z.count++
    if (valueOf(l) > 0) z.vals.push(valueOf(l))
    if (fuseSignals(l).count >= 1) z.distress++
    byZip.set(zip, z)
  }
  const topZips: ZipStat[] = [...byZip.entries()]
    .map(([zip, z]) => ({ zip, count: z.count, medianValue: median(z.vals), distress: z.distress }))
    .sort((a, b) => b.distress - a.distress || b.count - a.count)
    .slice(0, 6)

  // Real ACS median value/rent win over the distressed-lead sample when present.
  const medianValue = real?.value ?? median(values)
  const psf = psfs.length ? Math.round(median(psfs) ?? 0) : null
  const avgScore = n ? Math.round(leads.reduce((s, l) => s + (l.score ?? 0), 0) / n) : 0
  const avgEquity = equities.length ? Math.round(equities.reduce((s, e) => s + e, 0) / equities.length) : null
  const distressRate = n ? Math.round((distress / n) * 100) : 0
  const predictedRate = n ? Math.round((predicted / n) * 100) : 0

  // Rent + cap rate. Prefer real ACS rent, then our rent estimates, else the
  // 0.7% rule off median value so every market gets a number.
  const rents = leads.map((l) => l.rentEstimate).filter((r): r is number => r != null && r > 0)
  const medianRent = real?.rent ?? (rents.length ? median(rents) : (medianValue ? Math.round(medianValue * 0.007) : null))
  const capRate = medianRent && medianValue ? Math.round((medianRent * 12 * 0.55) / medianValue * 1000) / 10 : null
  // Gross yield from the authoritative value/rent when we have ACS data, else
  // from the per-lead rent estimates.
  const rentYield = (real?.value && medianRent && medianValue)
    ? Math.round((medianRent * 12) / medianValue * 1000) / 10
    : (yields.length ? Math.round((median(yields) ?? 0) * 10) / 10 : null)

  const insights: string[] = []
  if (medianValue) insights.push(`Median value ≈ $${Math.round(medianValue / 1000)}k${psf ? ` · ~$${psf}/sqft` : ""}`)
  if (distressRate >= 40) insights.push(`High distress density (${distressRate}% show real distress signals) — an active hunting ground`)
  else if (distressRate > 0) insights.push(`${distressRate}% of properties show distress signals`)
  if (gems > 0) insights.push(`${gems} hidden gem${gems === 1 ? "" : "s"} (cross-corroborated, off-market) to work first`)
  if (avgEquity != null) insights.push(`Avg equity ≈ ${avgEquity}% — ${avgEquity >= 35 ? "lots of room to make offers work" : avgEquity >= 15 ? "moderate negotiating room" : "tight; lean to short-sale/subject-to"}`)
  if (rentYield != null) insights.push(`~${rentYield}% gross rent yield — ${rentYield >= 8 ? "strong cash-flow market" : rentYield >= 5 ? "balanced" : "appreciation play, thin cash flow"}`)
  if (topZips[0]) insights.push(`Hottest ZIP: ${topZips[0].zip} (${topZips[0].distress} distressed of ${topZips[0].count})`)

  return { n, medianValue, psf, avgScore, distressRate, predictedRate, gemCount: gems, avgEquity, rentYield, medianRent, capRate, topZips, insights }
}

// ── Strategy fit — performance + ROI for each investor strategy ──────────────
export interface StrategyScore { score: number; grade: string; verdict: string; roi: string; reasons: string[]; estimated?: boolean }
export interface MarketStrategies {
  flip:        StrategyScore
  shortRental: StrategyScore   // STR (Airbnb)
  midRental:   StrategyScore   // MTR (furnished, 1-6mo, corporate/travel-nurse)
  longRental:  StrategyScore   // LTR / buy & hold
  bestFor:     string
}

const grade = (s: number): string => (s >= 80 ? "A" : s >= 65 ? "B" : s >= 50 ? "C" : s >= 35 ? "D" : "F")
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)))
const k = (n: number) => `$${Math.round(n / 1000)}k`

export function scoreStrategies(r: MarketReport): MarketStrategies {
  const eq  = r.avgEquity ?? 30
  const val = r.medianValue ?? 0
  const rent = r.medianRent ?? (val ? Math.round(val * 0.007) : 0)   // LTR monthly

  // FLIP — supply (distress) + spread (equity) + ready gems. ROI ≈ profit on cash.
  const flipScore = clamp(r.distressRate * 0.55 + eq * 0.5 + Math.min(r.gemCount * 2.5, 20))
  const flipProfit = val ? Math.round(val * (0.06 + Math.min(eq, 50) / 500)) : 0  // rough avg profit/flip
  const flip: StrategyScore = {
    score: flipScore, grade: grade(flipScore),
    verdict: flipScore >= 65 ? "Strong flip market" : flipScore >= 50 ? "Workable for flips" : "Thin for flips",
    roi: val ? `~${k(flipProfit)} profit/flip · ${Math.round((flipProfit / Math.max(val * 0.25, 1)) * 100)}% cash-on-cash (est)` : "value n/a",
    reasons: [`${r.distressRate}% distressed supply${r.gemCount ? ` · ${r.gemCount} hidden gems` : ""}`, `~${eq}% avg equity ${eq >= 35 ? "→ buy low" : "→ tighter margins"}`],
    estimated: true,
  }

  // LONG-TERM RENTAL — cap rate / gross yield.
  const cap = r.capRate ?? (rent && val ? Math.round((rent * 12 * 0.55) / val * 1000) / 10 : 5)
  const ltrScore = clamp(cap * 9 + (val && val < 350_000 ? 12 : 0))
  const longRental: StrategyScore = {
    score: ltrScore, grade: grade(ltrScore),
    verdict: ltrScore >= 65 ? "Strong cash flow" : ltrScore >= 50 ? "Balanced" : "Appreciation play, thin cash flow",
    roi: `${cap}% cap rate · ~$${rent}/mo${r.rentYield != null ? ` · ${r.rentYield}% gross yield` : ""}`,
    reasons: [val ? `median ${k(val)}` : "value n/a", `${cap}% cap rate`],
    estimated: r.rentYield == null,
  }

  // MID-TERM RENTAL — furnished 1–6mo (corporate / travel nurse). ~1.4× LTR rent,
  // lower turnover than STR. Score tracks LTR with a furnished premium.
  const mtrRent = Math.round(rent * 1.4)
  const mtrCap = val ? Math.round((mtrRent * 12 * 0.6) / val * 1000) / 10 : cap
  const midRental: StrategyScore = {
    score: clamp(mtrCap * 9), grade: grade(clamp(mtrCap * 9)),
    verdict: "Furnished mid-term — steadier than STR",
    roi: `~$${mtrRent}/mo · ${mtrCap}% cap (est)`,
    reasons: ["~1.4× long-term rent, fewer turnovers", "demand near hospitals / corporate hubs"],
    estimated: true,
  }

  // SHORT-TERM RENTAL — ~2.4× LTR gross at ~55% occupancy. High upside + variance.
  const strRent = Math.round(rent * 2.4 * 0.55)
  const strScore = clamp((val >= 250_000 && val <= 1_200_000 ? 56 : 44) + Math.min(r.distressRate * 0.1, 8))
  const shortRental: StrategyScore = {
    score: strScore, grade: grade(strScore),
    verdict: "High upside, variable — verify local STR rules + demand",
    roi: `~$${strRent}/mo net (est, ~55% occ)`,
    reasons: ["~2.4× long-term rent gross", "check city STR permits + seasonality"],
    estimated: true,
  }

  const ranked = [["Flips", flip.score], ["Short-term rentals", shortRental.score], ["Mid-term rentals", midRental.score], ["Long-term rentals", longRental.score]] as Array<[string, number]>
  ranked.sort((a, b) => b[1] - a[1])
  return { flip, shortRental, midRental, longRental, bestFor: ranked[0][0] }
}
