// Fixer-Upper finder — turns the area's distressed listings into renovation
// deals: detect condition signals, comp the ARV (already filled by the comp
// engine), run the explicit fix-&-flip MAO formula, and rank by how good the
// flip is. Pure & synchronous, builds on analyzeDeal. Never throws.

import type { ForeclosureLead } from "@/lib/agents/foreclosure-agent"
import { analyzeDeal, type DealAnalysis } from "@/lib/deal-analysis"

// Listing language that signals a property needs work (the classic fixer tells).
const FIXER_RE = /fixer|tlc|handyman|needs?\s+(work|repair|updat|rehab|love|tlc)|as.?is|sold as is|cash only|investor special|investors?\s+only|gut\b|tear.?down|teardown|sweat equity|rehab|renovat|dated|original condition|diamond in the rough|value.?add|bring.{0,10}contractor|priced to sell/i

function fixerText(lead: ForeclosureLead): string {
  return [lead.scoreReason, lead.distressSignals?.join(" "), lead.foreclosureType, lead.propertyType, lead.lender]
    .filter(Boolean).join(" ").toLowerCase()
}

export function isFixerUpper(lead: ForeclosureLead): boolean {
  return FIXER_RE.test(fixerText(lead))
}

// Why this is a fixer (condition signals) — drives the score + the UI.
export function fixerCondition(lead: ForeclosureLead): string[] {
  const signals: string[] = []
  const t = fixerText(lead)
  if (FIXER_RE.test(t)) signals.push("Listing language signals condition (as-is / TLC / needs work)")
  const age = lead.yearBuilt ? new Date().getFullYear() - lead.yearBuilt : null
  if (age != null && age >= 40) signals.push(`Built ${lead.yearBuilt} (~${age}y) — likely dated systems`)
  if (lead.occupancy === "vacant") signals.push("Vacant — deferred maintenance is common")
  if (/reo|bank.?owned|foreclos/.test(t)) signals.push("Bank-owned / foreclosure — typically sold as-is")
  if (lead.taxDelinquent) signals.push("Tax delinquent — distressed owner, deferred upkeep")
  return signals
}

export interface FixerDeal {
  lead:             ForeclosureLead
  deal:             DealAnalysis
  conditionSignals: string[]
  fixerScore:       number   // 0-100 — flip margin + condition + motivation + equity room
}

export function analyzeFixer(lead: ForeclosureLead, fallbackPsf?: number): FixerDeal | null {
  const deal = analyzeDeal(lead, undefined, fallbackPsf ? { fallbackPsf } : undefined)
  if (!deal.hasValue || !deal.maoDetail) return null   // need an ARV to underwrite a flip

  const conditionSignals = fixerCondition(lead)
  const marginPct = deal.arv > 0 ? deal.flipProfit / deal.arv : 0

  let score = marginPct * 170                                  // ~0-48 for margins up to ~28%
  score += Math.min(deal.motivation * 0.28, 24)                // motivated seller → likely discount
  score += Math.min(conditionSignals.length * 7, 21)           // genuine fixer condition
  score += Math.min(Math.max(deal.equityPercent, 0) * 0.15, 12) // equity = room to buy below ARV
  if (deal.grade === "A") score += 8
  const fixerScore = Math.max(0, Math.min(100, Math.round(score)))

  return { lead, deal, conditionSignals, fixerScore }
}
