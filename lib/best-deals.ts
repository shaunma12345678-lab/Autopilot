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

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

export type DealTier = "elite" | "strong" | "solid"
export interface BestDeal {
  lead:    ForeclosureLead
  deal:    DealAnalysis
  score:   number        // 0-100 unified elite score
  tier:    DealTier
  reasons: string[]      // the specific edges, strongest first
}

export function bestDealScore(lead: ForeclosureLead, fallbackPsf?: number): BestDeal | null {
  const deal = analyzeDeal(lead, undefined, fallbackPsf ? { fallbackPsf } : undefined)
  if (!deal.hasValue) return null

  const opp    = opportunityScore(lead)
  const fusion = fuseSignals(lead)
  const pred   = predictPreForeclosure(lead)

  const reasons: string[] = []
  let s = 0

  // 1. Margin — the money. Flip profit as a % of ARV (up to ~30 pts).
  const marginPct = deal.arv > 0 ? deal.flipProfit / deal.arv : 0
  s += clamp(marginPct * 120, 0, 30)
  if (deal.flipProfit > 0) reasons.push(`~${fmtMoney(deal.flipProfit)} projected profit${deal.roiPct ? ` · ${deal.roiPct}% ROI` : ""}`)

  // 2. BRRRR — capital recycling. Infinite return = the holy grail.
  if (deal.brrrr?.infinite) { s += 8; reasons.push("BRRRR: refi recovers all capital (near-infinite return)") }
  else if (deal.brrrr && deal.brrrr.discountToArvPct >= 25) { s += 4; reasons.push(`${deal.brrrr.discountToArvPct}% below ARV`) }

  // 3. Equity — room to make an offer work (up to 18).
  s += clamp(deal.equityPercent * 0.22, 0, 18)
  if (deal.equityPercent >= 35) reasons.push(`${deal.equityPercent}% equity (~${fmtMoney(deal.equityAvailable)})`)

  // 4. Motivation — likelihood the seller deals (up to 18).
  s += clamp(deal.motivation * 0.18, 0, 18)
  if (deal.motivation >= 60) reasons.push("Highly motivated seller")
  if (typeof lead.daysUntilAuction === "number" && lead.daysUntilAuction >= 0 && lead.daysUntilAuction <= 30)
    reasons.push(`Auction in ${lead.daysUntilAuction}d — real time pressure`)

  // 5. Hidden-gem opportunity (cross-corroborated / off-market / early) (up to 14).
  s += clamp(opp.score * 0.14, 0, 14)
  if (opp.tier === "gem") reasons.push("Hidden gem — cross-corroborated & off-market")

  // 6. Multi-vector signal fusion — independent distress signals agreeing (up to 8).
  s += clamp(fusion.count * 2.5, 0, 8)
  if (fusion.corroborated) reasons.push(`${fusion.count} independent distress signals agree (${fusion.level})`)

  // 7. Predictive pre-foreclosure probability (up to 4) — get ahead of the market.
  if (pred.predicted) { s += clamp(pred.probability * 0.04, 0, 4); reasons.push(`Predicted pre-foreclosure (${pred.probability}%)`) }

  const score = clamp(Math.round(s), 0, 100)
  const tier: DealTier = score >= 75 ? "elite" : score >= 55 ? "strong" : "solid"
  return { lead, deal, score, tier, reasons: reasons.slice(0, 5) }
}

// Rank a set of leads into the best deals, best first.
export function rankBestDeals(leads: ForeclosureLead[], fallbackPsf?: number): BestDeal[] {
  return leads
    .map((l) => bestDealScore(l, fallbackPsf))
    .filter((d): d is BestDeal => d !== null)
    .sort((a, b) => b.score - a.score || b.deal.flipProfit - a.deal.flipProfit)
}
