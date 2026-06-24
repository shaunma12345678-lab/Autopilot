// The Best-Deal engine — one unified, elite ranking that fuses EVERY signal the
// platform produces into a single 0-100 score, so the very best deals on the
// market float to the top regardless of type (flip, BRRRR, wholesale, fixer).
// Nobody ranks on all of these at once:
//   • profit margin (flip) + BRRRR capital recovery + discount to ARV
//   • real equity position
//   • seller motivation (distress depth, auction clock, absentee, vacant, taxes)
//   • hidden-gem opportunity (cross-source corroboration, off-market, early)
//   • multi-vector signal fusion (independent distress signals agreeing)
//   • predictive pre-foreclosure probability
// Pure & synchronous. Builds on analyzeDeal/opportunity/fusion/predictive.

import type { ForeclosureLead } from "@/lib/agents/foreclosure-agent"
import { analyzeDeal, fmtMoney, type DealAnalysis } from "@/lib/deal-analysis"
import { opportunityScore } from "@/lib/opportunity"
import { fuseSignals } from "@/lib/signal-fusion"
import { predictPreForeclosure } from "@/lib/predictive"
import { predictLikelyToSell, type SellPrediction } from "@/lib/sell-predictor"

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

export type DealTier = "elite" | "strong" | "solid"
export type ConfLevel = "high" | "medium" | "low"
export interface DealConfidence { level: ConfLevel; label: string }
export interface BestDeal {
  lead:    ForeclosureLead
  deal:    DealAnalysis
  score:   number        // 0-100 unified elite score
  tier:    DealTier
  reasons: string[]      // the specific edges, strongest first
  sell:    SellPrediction // forward-looking "likely to sell" read
  confidence: DealConfidence  // how much to trust the numbers + why
}

// How trustworthy are this deal's numbers, and why — so the score is auditable.
function dealConfidence(lead: ForeclosureLead, deal: DealAnalysis): DealConfidence {
  const comps = lead.comps?.length ?? 0
  const hasSqft = !!(lead.sqft && lead.sqft > 200)
  if (deal.hasValue && !deal.valueEstimated && (hasSqft || comps >= 3))
    return { level: "high", label: `real value${hasSqft ? ` · ${lead.sqft!.toLocaleString()} sqft` : ""}${comps ? ` · ${comps} comps` : ""}` }
  if (deal.hasValue && !deal.valueEstimated)
    return { level: "medium", label: "real value, thin comps — enrich to confirm" }
  if (deal.hasValue && deal.valueEstimated)
    return { level: "low", label: "estimated from area median — enrich for real numbers" }
  return { level: "low", label: "no value yet — run enrich" }
}

export interface BestDealOpts { fallbackPsf?: number; fallbackValue?: number }

export function bestDealScore(lead: ForeclosureLead, opts?: BestDealOpts): BestDeal | null {
  const deal = analyzeDeal(lead, undefined, { fallbackPsf: opts?.fallbackPsf, fallbackValue: opts?.fallbackValue })

  const opp    = opportunityScore(lead)
  const fusion = fuseSignals(lead)
  const pred   = predictPreForeclosure(lead)
  // Financial points only when the value is REAL (not an area-median anchor),
  // so thin bare-address leads rank on their genuine distress signals, not on
  // fabricated margin/equity.
  const realValue = deal.hasValue && !deal.valueEstimated

  const reasons: string[] = []
  let s = 0

  // 1. Margin — only on a real per-property value (up to 45 pts). A strong
  //    spread alone can carry a deal to "strong"; distress signals push to elite.
  if (realValue) {
    const marginPct = deal.arv > 0 ? deal.flipProfit / deal.arv : 0
    s += clamp(marginPct * 180, 0, 45)
    if (deal.flipProfit > 0) reasons.push(`~${fmtMoney(deal.flipProfit)} projected profit${deal.roiPct ? ` · ${deal.roiPct}% ROI` : ""}`)
    if (deal.brrrr?.infinite) { s += 14; reasons.push("BRRRR: refi recovers all capital (near-infinite return)") }
    else if (deal.brrrr && deal.brrrr.discountToArvPct >= 25) { s += 6; reasons.push(`${deal.brrrr.discountToArvPct}% below ARV`) }
  }

  // 2. Equity — only when real debt is recorded (avoids inflated 100%) (up to 18).
  if (deal.totalDebt > 0 && realValue) {
    s += clamp(deal.equityPercent * 0.22, 0, 18)
    if (deal.equityPercent >= 35) reasons.push(`${deal.equityPercent}% equity (~${fmtMoney(deal.equityAvailable)})`)
  }

  // 3. Motivation — likelihood the seller deals (up to 24; weighted up when we
  //    have no financials so the best motivated leads still surface).
  s += clamp(deal.motivation * (realValue ? 0.18 : 0.26), 0, realValue ? 18 : 24)
  if (deal.motivation >= 60) reasons.push("Highly motivated seller")
  if (typeof lead.daysUntilAuction === "number" && lead.daysUntilAuction >= 0 && lead.daysUntilAuction <= 30)
    reasons.push(`Auction in ${lead.daysUntilAuction}d — real time pressure`)

  // 4. Hidden-gem opportunity (cross-corroborated / off-market / early) (up to 16).
  s += clamp(opp.score * (realValue ? 0.14 : 0.18), 0, realValue ? 14 : 16)
  if (opp.tier === "gem") reasons.push("Hidden gem — cross-corroborated & off-market")

  // 5. Multi-vector signal fusion — independent distress signals agreeing (up to 12).
  s += clamp(fusion.count * (realValue ? 2.5 : 3.5), 0, realValue ? 8 : 12)
  if (fusion.corroborated) reasons.push(`${fusion.count} independent distress signals agree (${fusion.level})`)

  // 6. Predictive pre-foreclosure probability (up to 8) — get ahead of the market.
  if (pred.predicted) { s += clamp(pred.probability * (realValue ? 0.04 : 0.08), 0, realValue ? 4 : 8); reasons.push(`Predicted pre-foreclosure (${pred.probability}%)`) }

  // 7. Likely-to-sell — forward-looking owner intent (up to 10).
  const sell = predictLikelyToSell(lead)
  s += clamp(sell.score * 0.1, 0, 10)
  if (sell.score >= 50) reasons.push(`🎯 ${sell.band} likelihood to sell (${sell.timeframe})`)
  if (deal.distressType) reasons.push(deal.distressType)

  const score = clamp(Math.round(s), 0, 100)
  if (score <= 0) return null
  const tier: DealTier = score >= 75 ? "elite" : score >= 55 ? "strong" : "solid"
  return { lead, deal, score, tier, reasons: Array.from(new Set(reasons)).slice(0, 5), sell, confidence: dealConfidence(lead, deal) }
}

// Rank a set of leads into the best deals, best first.
export function rankBestDeals(leads: ForeclosureLead[], opts?: BestDealOpts): BestDeal[] {
  return leads
    .map((l) => bestDealScore(l, opts))
    .filter((d): d is BestDeal => d !== null)
    .sort((a, b) => b.score - a.score || b.deal.flipProfit - a.deal.flipProfit)
}
