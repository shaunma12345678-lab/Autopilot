// Market snapshot — turns the area's search results into an investor's market
// read: value distribution, distress density, deal quality, equity, rent yield,
// hidden-gem count, and the hottest ZIPs. All computed from data we already
// pulled (no external API). Pure, synchronous, null-safe.

import type { ForeclosureLead } from "@/lib/agents/foreclosure-agent"
import type { Fundamentals } from "@/lib/market-fundamentals"
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

// Fundamentals (when provided) sharpen every strategy with the real market
// screen: rental vacancy, job growth, migration, renter depth, bedroom rents.
export function scoreStrategies(r: MarketReport, f?: Fundamentals | null): MarketStrategies {
  const eq  = r.avgEquity ?? 30
  const val = r.medianValue ?? 0
  const rent = r.medianRent ?? (val ? Math.round(val * 0.007) : 0)   // LTR monthly
  const jobs = f?.jobGrowthPct ?? null
  const rvac = f?.rentalVacancyPct ?? null
  const inbound = f?.inboundMigrationPct ?? null

  // FLIP — supply (distress) + spread (equity) + resale demand (occupancy,
  // affordability headroom).
  let flipScore = r.distressRate * 0.5 + eq * 0.45 + Math.min(r.gemCount * 2.5, 18)
  if (f?.occupancyPct != null) flipScore += f.occupancyPct >= 90 ? 5 : f.occupancyPct < 82 ? -5 : 0
  if (f?.priceToIncome != null) flipScore += f.priceToIncome <= 4.5 ? 8 : f.priceToIncome >= 7 ? -6 : 0
  flipScore = clamp(flipScore)
  const flipProfit = val ? Math.round(val * (0.06 + Math.min(eq, 50) / 500)) : 0  // rough avg profit/flip
  const flip: StrategyScore = {
    score: flipScore, grade: grade(flipScore),
    verdict: flipScore >= 65 ? "Strong flip market" : flipScore >= 50 ? "Workable for flips" : "Thin for flips",
    roi: val ? `~${k(flipProfit)} profit/flip · ${Math.round((flipProfit / Math.max(val * 0.25, 1)) * 100)}% cash-on-cash (est)` : "value n/a",
    reasons: [
      `${r.distressRate}% distressed supply${r.gemCount ? ` · ${r.gemCount} hidden gems` : ""}`,
      `~${eq}% avg equity ${eq >= 35 ? "→ buy low" : "→ tighter margins"}`,
      ...(f?.occupancyPct != null ? [`${f.occupancyPct}% occupancy → ${f.occupancyPct >= 90 ? "retail buyers waiting" : "verify resale demand"}`] : []),
    ],
    estimated: true,
  }

  // LONG-TERM RENTAL — cap rate + the real rental screen: vacancy, jobs, tenant depth.
  const cap = r.capRate ?? (rent && val ? Math.round((rent * 12 * 0.55) / val * 1000) / 10 : 5)
  let ltrScore = cap * 8 + (val && val < 350_000 ? 10 : 0)
  if (rvac != null) ltrScore += rvac <= 5 ? 12 : rvac <= 9 ? 4 : -8
  if (jobs != null) ltrScore += jobs >= 1.5 ? 10 : jobs > 0 ? 5 : -6
  if (f?.renterSharePct != null && f.renterSharePct >= 40) ltrScore += 5
  ltrScore = clamp(ltrScore)
  const longRental: StrategyScore = {
    score: ltrScore, grade: grade(ltrScore),
    verdict: ltrScore >= 65 ? "Strong cash flow" : ltrScore >= 50 ? "Balanced" : "Appreciation play, thin cash flow",
    roi: `${cap}% cap rate · ~$${rent}/mo${f?.rent3br ? ` (3-bed $${f.rent3br})` : ""}${r.rentYield != null ? ` · ${r.rentYield}% gross yield` : ""}`,
    reasons: [
      val ? `median ${k(val)} · ${cap}% cap` : `${cap}% cap rate`,
      ...(rvac != null ? [`${rvac}% rental vacancy ${rvac <= 5 ? "→ units fill fast" : rvac <= 9 ? "→ balanced" : "→ expect gaps between tenants"}`] : []),
      ...(jobs != null ? [`${jobs > 0 ? "+" : ""}${jobs}% jobs YoY${f?.jobsNote ? ` (${f.jobsNote.split(",")[0]})` : ""}`] : []),
      ...(f?.renterSharePct != null ? [`${f.renterSharePct}% of homes rent → ${f.renterSharePct >= 45 ? "deep tenant pool" : "moderate tenant pool"}`] : []),
    ],
    estimated: r.rentYield == null,
  }

  // MID-TERM RENTAL — furnished 1–6mo (corporate / travel nurse). ~1.4× the
  // 1-2 bed rent, fewer turnovers than STR; runs on employment demand.
  const mtrBase = f?.rent2br ?? f?.rent1br ?? rent
  const mtrRent = Math.round(mtrBase * 1.4)
  let mtrScore = (val ? Math.round((mtrRent * 12 * 0.6) / val * 1000) / 10 : cap) * 8
  if (jobs != null) mtrScore += jobs >= 1 ? 10 : jobs > 0 ? 4 : -6
  if (inbound != null && inbound >= 2.5) mtrScore += 6
  mtrScore = clamp(mtrScore)
  const midRental: StrategyScore = {
    score: mtrScore, grade: grade(mtrScore),
    verdict: "Furnished mid-term — steadier than STR",
    roi: `~$${mtrRent}/mo · ${val ? Math.round((mtrRent * 12 * 0.6) / val * 1000) / 10 : cap}% cap (est)`,
    reasons: [
      `~1.4× the ${f?.rent2br ? "2-bed" : "market"} rent ($${mtrBase} → $${mtrRent}), fewer turnovers`,
      ...(jobs != null ? [`${jobs > 0 ? "+" : ""}${jobs}% job growth feeds corporate/travel-nurse demand`] : ["demand near hospitals / corporate hubs"]),
    ],
    estimated: true,
  }

  // SHORT-TERM RENTAL — ~2.4× LTR gross at ~55% occupancy; migration/visitor
  // pull raises confidence. Still modeled without paid STR data — flagged.
  const strBase = f?.rent2br ?? rent
  const strRent = Math.round(strBase * 2.4 * 0.55)
  let strScore = (val >= 250_000 && val <= 1_200_000 ? 54 : 44) + Math.min(r.distressRate * 0.1, 6)
  if (inbound != null) strScore += inbound >= 3 ? 10 : inbound >= 1.5 ? 5 : 0
  if (f?.occupancyPct != null && f.occupancyPct < 82) strScore -= 6
  strScore = clamp(strScore)
  const shortRental: StrategyScore = {
    score: strScore, grade: grade(strScore),
    verdict: "High upside, variable — verify local STR rules + demand",
    roi: `~$${strRent}/mo net (est, ~55% occ)`,
    reasons: [
      `~2.4× the ${f?.rent2br ? "2-bed" : "long-term"} rent gross`,
      ...(inbound != null ? [`${inbound}% moved in last year → ${inbound >= 3 ? "strong visitor/relocation pull" : "moderate demand pull"}`] : []),
      "check city STR permits + seasonality",
    ],
    estimated: true,
  }

  const ranked = [["Flips", flip.score], ["Short-term rentals", shortRental.score], ["Mid-term rentals", midRental.score], ["Long-term rentals", longRental.score]] as Array<[string, number]>
  ranked.sort((a, b) => b[1] - a[1])
  return { flip, shortRental, midRental, longRental, bestFor: ranked[0][0] }
}
