// The AutoPilot Potential Score — OUR proprietary per-property index (versioned
// so the outcome ledger can prove each version's accuracy). One 0-100 number
// that fuses layers nobody else has together: property distress + motivation,
// the underwrite, the CITY's tailwind (jobs/migration/vacancy), the ZIP's
// distress density, exit LIQUIDITY (active cash buyers we track in the county),
// and competition (how many other investors have seen it). Every component is
// returned with its weight and a plain-English reason — the full breakdown.
// Pure and synchronous; context is optional and each missing piece just
// renormalizes the weights (never fake a number).

import type { ForeclosureLead } from "@/lib/agents/foreclosure-agent"
import { predictPreForeclosure } from "@/lib/predictive"
import { fuseSignals } from "@/lib/signal-fusion"
import { opportunityScore } from "@/lib/opportunity"
import { competitionRadar } from "@/lib/competition"
import { analyzeDeal } from "@/lib/deal-analysis"
import { predictLikelyToSell } from "@/lib/sell-predictor"

export const POTENTIAL_VERSION = "v1"

export interface PotentialPart {
  key: string
  label: string
  score: number      // 0-100 within this component
  weight: number     // its share of the composite
  reason: string
}

export interface Potential {
  score: number          // 0-100 composite
  version: string
  tier: "prime" | "strong" | "watch" | "pass"
  parts: PotentialPart[]
}

export interface PotentialContext {
  marketUpside?: number | null       // the city's upside score (0-100) from market fundamentals
  marketLabel?: string | null        // e.g. "Riverside, CA"
  zipDistressDensity?: number | null // 0-100: how distress-dense this lead's ZIP is within its area
  buyersInCounty?: number | null     // active cash buyers we track in this county (exit liquidity)
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)))

export function potentialScore(lead: ForeclosureLead, ctx?: PotentialContext): Potential {
  const parts: PotentialPart[] = []
  const add = (key: string, label: string, score: number, weight: number, reason: string) =>
    parts.push({ key, label, score: clamp(score), weight, reason })

  // 1) Distress & motivation — will this owner transact? (our predictive core)
  const pred = predictPreForeclosure(lead)
  const fusion = fuseSignals(lead)
  const sell = predictLikelyToSell(lead)
  const distressScore = pred.confirmed
    ? 82 + Math.min(fusion.count * 4, 12)
    : pred.probability * 0.7 + sell.score * 0.25 + Math.min(fusion.count * 5, 15)
  add("distress", "Distress & motivation", distressScore, 30,
    pred.confirmed
      ? `In the foreclosure pipeline · ${fusion.count} corroborating signal${fusion.count === 1 ? "" : "s"}`
      : `${pred.probability}% foreclosure forecast · ${sell.score}% likely to sell · ${fusion.count} signal${fusion.count === 1 ? "" : "s"}`)

  // 2) Deal math — does the underwrite pencil?
  const a = analyzeDeal(lead)
  let dealScore = 35
  let dealReason = "No value data yet — enrich to underwrite"
  if (a.hasValue) {
    const roi = a.roiPct ?? 0
    const marginPct = a.arv > 0 ? (a.headlineProfit / a.arv) * 100 : 0
    dealScore = clamp(marginPct * 3 + Math.min(roi, 60) * 0.6 + (a.equityPercent >= 30 ? 12 : 0))
    dealReason = `${a.grade}-grade · ~$${Math.round(a.headlineProfit / 1000)}k ${a.headlineLabel.toLowerCase()}${a.equityPercent ? ` · ${a.equityPercent}% equity` : ""}${a.valueEstimated ? " (value modeled)" : ""}`
  }
  add("deal", "Deal economics", dealScore, 25, dealReason)

  // 3) Market tailwind — is the CITY moving with you? (jobs, migration, supply)
  if (ctx?.marketUpside != null) {
    add("market", "Market tailwind", ctx.marketUpside, 15,
      `${ctx.marketLabel ?? "This market"} upside ${ctx.marketUpside}/100 (growth · jobs · migration · supply)`)
  }

  // 4) Micro-location — is the ZIP a hunting ground?
  if (ctx?.zipDistressDensity != null) {
    add("location", "ZIP opportunity", ctx.zipDistressDensity, 10,
      `${lead.zip || "This ZIP"} ranks ${ctx.zipDistressDensity}/100 for distress density in its area`)
  }

  // 5) Exit liquidity — are there real buyers to sell to? (our buyer index)
  if (ctx?.buyersInCounty != null) {
    const liq = clamp(Math.log2(Math.max(1, ctx.buyersInCounty + 1)) * 18)
    add("liquidity", "Exit liquidity", liq, 10,
      `${ctx.buyersInCounty} active cash buyer${ctx.buyersInCounty === 1 ? "" : "s"} tracked in this county`)
  }

  // 6) Competition — how many other investors have seen this?
  const opp = opportunityScore(lead)
  const comp = competitionRadar(lead, pred.predicted, opp.tier === "gem")
  add("competition", "Low competition", comp.earlyScore, 10,
    comp.reasons[0] ?? (opp.offMarket ? "Off-market — few investors have seen it" : "Marketed — expect other offers"))

  // Composite over the parts we actually have (missing context renormalizes).
  const totalW = parts.reduce((s, p) => s + p.weight, 0)
  const score = totalW > 0 ? clamp(parts.reduce((s, p) => s + p.score * p.weight, 0) / totalW) : 0
  const tier: Potential["tier"] = score >= 75 ? "prime" : score >= 58 ? "strong" : score >= 40 ? "watch" : "pass"
  return { score, version: POTENTIAL_VERSION, tier, parts }
}

// ZIP distress density (0-100) for each ZIP within one result set — pure helper
// so callers can build the micro-location context from data they already have.
export function zipDensityMap(leads: ForeclosureLead[]): Map<string, number> {
  const byZip = new Map<string, { n: number; distressed: number }>()
  for (const l of leads) {
    const zip = (l.zip || "").slice(0, 5)
    if (!zip) continue
    const z = byZip.get(zip) ?? { n: 0, distressed: 0 }
    z.n++
    if (fuseSignals(l).count >= 1) z.distressed++
    byZip.set(zip, z)
  }
  const counts = [...byZip.values()].map((z) => z.distressed)
  const maxD = Math.max(1, ...counts)
  const out = new Map<string, number>()
  for (const [zip, z] of byZip) out.set(zip, clamp((z.distressed / maxD) * 70 + (z.n >= 5 ? 15 : 0) + (z.distressed / Math.max(1, z.n)) * 15))
  return out
}
