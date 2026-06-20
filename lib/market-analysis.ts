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

export function analyzeMarket(leads: ForeclosureLead[]): MarketReport {
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

  const medianValue = median(values)
  const psf = psfs.length ? Math.round(median(psfs) ?? 0) : null
  const avgScore = n ? Math.round(leads.reduce((s, l) => s + (l.score ?? 0), 0) / n) : 0
  const avgEquity = equities.length ? Math.round(equities.reduce((s, e) => s + e, 0) / equities.length) : null
  const rentYield = yields.length ? Math.round((median(yields) ?? 0) * 10) / 10 : null
  const distressRate = n ? Math.round((distress / n) * 100) : 0
  const predictedRate = n ? Math.round((predicted / n) * 100) : 0

  const insights: string[] = []
  if (medianValue) insights.push(`Median value ≈ $${Math.round(medianValue / 1000)}k${psf ? ` · ~$${psf}/sqft` : ""}`)
  if (distressRate >= 40) insights.push(`High distress density (${distressRate}% show real distress signals) — an active hunting ground`)
  else if (distressRate > 0) insights.push(`${distressRate}% of properties show distress signals`)
  if (gems > 0) insights.push(`${gems} hidden gem${gems === 1 ? "" : "s"} (cross-corroborated, off-market) to work first`)
  if (avgEquity != null) insights.push(`Avg equity ≈ ${avgEquity}% — ${avgEquity >= 35 ? "lots of room to make offers work" : avgEquity >= 15 ? "moderate negotiating room" : "tight; lean to short-sale/subject-to"}`)
  if (rentYield != null) insights.push(`~${rentYield}% gross rent yield — ${rentYield >= 8 ? "strong cash-flow market" : rentYield >= 5 ? "balanced" : "appreciation play, thin cash flow"}`)
  if (topZips[0]) insights.push(`Hottest ZIP: ${topZips[0].zip} (${topZips[0].distress} distressed of ${topZips[0].count})`)

  return { n, medianValue, psf, avgScore, distressRate, predictedRate, gemCount: gems, avgEquity, rentYield, topZips, insights }
}

// ── Strategy fit — how the market performs for each investor strategy ─────────
export interface StrategyScore { score: number; grade: string; verdict: string; reasons: string[]; estimated?: boolean }
export interface MarketStrategies {
  flip:        StrategyScore
  longRental:  StrategyScore
  shortRental: StrategyScore
  buyHold:     StrategyScore   // appreciation / owner-buyer
  bestFor:     string
}

const grade = (s: number): string => (s >= 80 ? "A" : s >= 65 ? "B" : s >= 50 ? "C" : s >= 35 ? "D" : "F")
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)))

export function scoreStrategies(r: MarketReport): MarketStrategies {
  const eq = r.avgEquity ?? 30
  const val = r.medianValue ?? 0

  // FLIP — needs deal SUPPLY (distress) + SPREAD (equity) + ready gems.
  const flipScore = clamp(r.distressRate * 0.55 + eq * 0.5 + Math.min(r.gemCount * 2.5, 20))
  const flip: StrategyScore = {
    score: flipScore, grade: grade(flipScore),
    verdict: flipScore >= 65 ? "Strong flip market" : flipScore >= 50 ? "Workable for flips" : "Thin for flips",
    reasons: [
      `${r.distressRate}% distressed supply${r.gemCount ? ` · ${r.gemCount} hidden gems` : ""}`,
      `~${eq}% avg equity ${eq >= 35 ? "→ room to buy low" : "→ tighter margins"}`,
    ],
  }

  // LONG-TERM RENTAL — gross yield / price-to-rent.
  const yld = r.rentYield ?? (val > 0 ? clamp(70 - val / 12000) / 10 : 6)   // proxy when no rent data
  const ltrScore = clamp(yld * 9 + (val && val < 400_000 ? 12 : 0))
  const longRental: StrategyScore = {
    score: ltrScore, grade: grade(ltrScore),
    verdict: ltrScore >= 65 ? "Strong cash-flow rentals" : ltrScore >= 50 ? "Balanced rentals" : "Appreciation play, thin cash flow",
    reasons: [`~${(r.rentYield ?? Math.round(yld * 10) / 10)}% gross yield`, val ? `median $${Math.round(val / 1000)}k` : "value n/a"],
    estimated: r.rentYield == null,
  }

  // SHORT-TERM RENTAL — we don't have STR demand data; rough proxy from value tier.
  const strScore = clamp((val >= 300_000 && val <= 1_200_000 ? 58 : 42) + Math.min(r.distressRate * 0.1, 8))
  const shortRental: StrategyScore = {
    score: strScore, grade: grade(strScore),
    verdict: "Estimate — confirm with local STR demand",
    reasons: ["Rough proxy (value tier); plug in an STR-data key for real Airbnb demand"],
    estimated: true,
  }

  // BUY & HOLD / appreciation — stability (lower distress) + value tier.
  const bhScore = clamp((100 - r.distressRate) * 0.5 + (val >= 250_000 ? 25 : 15))
  const buyHold: StrategyScore = {
    score: bhScore, grade: grade(bhScore),
    verdict: bhScore >= 65 ? "Stable appreciation market" : "Mixed appreciation outlook",
    reasons: [`${100 - r.distressRate}% non-distressed (stability)`, "appreciation trend needs historical data (estimate)"],
    estimated: true,
  }

  const ranked = [["Flips", flip.score], ["Long-term rentals", longRental.score], ["Short-term rentals", shortRental.score], ["Buy & hold", buyHold.score]] as Array<[string, number]>
  ranked.sort((a, b) => b[1] - a[1])
  return { flip, longRental, shortRental, buyHold, bestFor: ranked[0][0] }
}
