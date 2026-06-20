// "Hidden Gem" opportunity score — surfaces the deals NOBODY ELSE is working.
// Single-list tools (PropStream, Redfin, BatchLeads) show everyone the same
// on-market / single-signal leads. The deals nobody else knows are the ones
// where MULTIPLE independent distress signals cross-corroborate on an OFF-MARKET
// property the owner hasn't listed — low competition, high motivation. This
// scores exactly that edge. Pure, synchronous, never throws.

import type { ForeclosureLead } from "@/lib/agents/foreclosure-agent"
import { fuseSignals } from "@/lib/signal-fusion"
import { predictPreForeclosure } from "@/lib/predictive"

export interface Opportunity {
  score:     number              // 0-100 — how "hidden gem" this is
  tier:      "gem" | "strong" | "standard"
  offMarket: boolean
  reasons:   string[]
}

export function opportunityScore(lead: ForeclosureLead): Opportunity {
  const fusion = fuseSignals(lead)
  const text = [lead.distressSignals?.join(" "), lead.scoreReason, lead.foreclosureType].filter(Boolean).join(" ").toLowerCase()
  const pred = predictPreForeclosure(lead)

  // On-market = a plain active MLS listing everyone can already see. Off-market
  // (public-record distress, no live listing) is where the edge is.
  const listing  = /active listing|for sale by|\bmls\b|listed for/.test(text)
  const offMarket = !listing || fusion.count >= 2

  const reasons: string[] = []
  let s = 0

  // 1) Cross-source corroboration — THE edge. Each extra independent signal is a
  //    deal a single-list competitor wouldn't connect.
  if (fusion.count >= 2) {
    s += fusion.count * 17
    reasons.push(`${fusion.count} independent distress signals corroborate (${fusion.categories.slice(0, 3).join(", ")}) — competitors see at most one`)
  } else if (fusion.count === 1) {
    s += 12
  }

  // 2) Off-market = low competition.
  if (offMarket) { s += 16; reasons.push("Off-market — owner hasn't listed; few or no other investors on it") }

  // 3) Early / predicted = reach them before the crowd.
  if (pred.predicted && !lead.auctionDate) { s += Math.min(14, Math.round(pred.probability * 0.18)); reasons.push("Early-stage forecast — reach the owner before it's public") }

  // 4) Equity spread = real profit room.
  const eq = lead.equityPercent
  if (eq != null && eq >= 35) { s += 12; reasons.push(`${eq}% equity — real room to make an offer that works`) }
  else if (eq != null && eq >= 20) s += 6

  // 5) Reachable = actionable (we can actually contact the owner).
  if (lead.phone || lead.email || (lead.ownerName && !/unknown/i.test(lead.ownerName))) { s += 6; reasons.push("Owner identified / reachable — actionable now") }

  const score = Math.max(0, Math.min(100, Math.round(s)))
  const tier: Opportunity["tier"] = score >= 68 ? "gem" : score >= 45 ? "strong" : "standard"
  return { score, tier, offMarket, reasons: reasons.slice(0, 4) }
}
