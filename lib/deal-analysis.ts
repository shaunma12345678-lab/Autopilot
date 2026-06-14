// Deal analysis engine — turns a scored lead into a wholesaler-grade
// underwrite: MAO (70% rule), wholesale spread, flip profit, equity position,
// exit-strategy recommendation, risk flags, motivation, and a plain-English
// "why this is a deal" narrative.
//
// Pure & synchronous — no network, never throws. Builds on the fields the
// scoring engine already produced (estimatedValue/avmValue, totalLiens,
// equityPercent, sqft, scoreBreakdown, occupancy, daysUntilAuction…).

import type { ForeclosureLead, ScoreBreakdown } from "@/lib/agents/foreclosure-agent"

export type RepairLevel = "light" | "medium" | "heavy"

// Cost-to-rehab per square foot by scope of work.
export const REPAIR_PSF: Record<RepairLevel, number> = { light: 15, medium: 35, heavy: 65 }
export const REPAIR_LABEL: Record<RepairLevel, string> = {
  light:  "Light ($15/sqft) — paint, carpet, cosmetics",
  medium: "Medium ($35/sqft) — kitchen, baths, systems",
  heavy:  "Heavy ($65/sqft) — full gut / structural",
}

const ASSIGNMENT_FEE = 10_000 // default wholesale assignment fee
const SQFT_FALLBACK   = 1_500

const SCORE_META: { key: keyof ScoreBreakdown; label: string; max: number }[] = [
  { key: "equity",   label: "Equity position",  max: 35 },
  { key: "distress", label: "Distress depth",   max: 25 },
  { key: "stage",    label: "Timing / urgency", max: 20 },
  { key: "owner",    label: "Owner motivation", max: 12 },
  { key: "property", label: "Property quality", max: 8  },
]

export interface RiskFlag { label: string; severity: "high" | "medium" }
export interface ScorePart { key: keyof ScoreBreakdown; label: string; value: number; max: number; pct: number }

export interface DealAnalysis {
  hasValue:        boolean
  arv:             number          // after-repair / current value estimate
  repairLevel:     RepairLevel
  repairCost:      number
  totalDebt:       number
  mao:             number          // max allowable offer (70% rule − repairs)
  equityAvailable: number          // arv − totalDebt
  equityPercent:   number          // 0-100
  wholesaleSpread: number          // mao − totalDebt (assignable room)
  flipProfit:      number          // arv − mao − repairs − selling costs
  grade:           "A" | "B" | "C" | "D" | "F"
  motivation:      number          // 0-100 likelihood owner sells
  exit:            { strategy: string; why: string }
  risks:           RiskFlag[]
  scoreParts:      ScorePart[]
  narrative:       string
}

function money(n: number): string {
  if (!Number.isFinite(n)) return "—"
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return "$" + (n / 1_000_000).toFixed(2).replace(/\.00$/, "") + "M"
  if (abs >= 1_000)     return "$" + Math.round(n / 1_000) + "k"
  return "$" + Math.round(n)
}

export function repairCostFor(lead: ForeclosureLead, level: RepairLevel): number {
  const sqft = lead.sqft && lead.sqft > 200 ? lead.sqft : SQFT_FALLBACK
  return Math.round((sqft * REPAIR_PSF[level]) / 500) * 500
}

// Recommend a rehab scope from property age when we have no inspection.
export function recommendedRepairLevel(lead: ForeclosureLead): RepairLevel {
  const age = lead.yearBuilt ? new Date().getFullYear() - lead.yearBuilt : 35
  if (age <= 12) return "light"
  if (age <= 40) return "medium"
  return "heavy"
}

export function analyzeDeal(lead: ForeclosureLead, levelArg?: RepairLevel): DealAnalysis {
  const repairLevel = levelArg ?? recommendedRepairLevel(lead)
  const arv = lead.avmValue ?? lead.estimatedValue ?? 0
  const hasValue = arv > 0

  const totalDebt = lead.totalLiens > 0
    ? lead.totalLiens
    : (lead.defaultAmount ?? 0) + (lead.juniorLiens?.reduce((s, l) => s + (l.amount ?? 0), 0) ?? 0)

  const repairCost = hasValue ? repairCostFor(lead, repairLevel) : 0
  const mao = hasValue ? Math.max(0, Math.round(arv * 0.7 - repairCost - ASSIGNMENT_FEE)) : 0
  const equityAvailable = hasValue ? Math.max(0, arv - totalDebt) : 0
  const equityPercent = hasValue ? Math.round((equityAvailable / arv) * 100) : (lead.equityPercent ?? 0)
  const wholesaleSpread = hasValue ? mao - totalDebt : 0
  const sellingCosts = hasValue ? Math.round(arv * 0.08) : 0
  const flipProfit = hasValue ? Math.max(0, arv - mao - repairCost - sellingCosts) : 0

  // Grade: F when underwater, else by flip margin + equity.
  let grade: DealAnalysis["grade"]
  const margin = hasValue ? flipProfit / arv : 0
  if (!hasValue) grade = "C"
  else if (equityAvailable <= 0) grade = "F"
  else if (margin >= 0.18 && equityAvailable > 50_000) grade = "A"
  else if (margin >= 0.11) grade = "B"
  else if (margin >= 0.05) grade = "C"
  else grade = "D"

  // Motivation 0-100 — depth of distress, time pressure, absentee, taxes.
  const b = lead.scoreBreakdown
  let motivation = (b?.distress ?? 0) * 2 + (b?.stage ?? 0)            // 0-70
  if (lead.isAbsentee || lead.occupancy === "absentee") motivation += 10
  if (lead.occupancy === "vacant") motivation += 8
  if (typeof lead.daysUntilAuction === "number" && lead.daysUntilAuction >= 0) {
    motivation += lead.daysUntilAuction <= 14 ? 15 : lead.daysUntilAuction <= 30 ? 8 : 3
  }
  if (lead.taxDelinquent) motivation += 6
  motivation = Math.max(0, Math.min(100, Math.round(motivation)))

  // Exit-strategy recommendation.
  let exit: DealAnalysis["exit"]
  const rtv = lead.rentToValue ?? 0
  if (!hasValue) {
    exit = { strategy: "Underwrite first", why: "No reliable value yet — run Live Valuation to size the deal." }
  } else if (equityAvailable <= 0) {
    exit = { strategy: "Short sale / Subject-to", why: "Little or no equity — negotiate the payoff with the lender or take over payments." }
  } else if (wholesaleSpread >= 15_000) {
    exit = { strategy: "Wholesale (assign)", why: `~${money(wholesaleSpread)} of assignable room between payoff and MAO.` }
  } else if (rtv >= 8) {
    exit = { strategy: "BRRRR / Buy & hold", why: `Strong ${rtv.toFixed(1)}% rent-to-value — refinance and hold for cash flow.` }
  } else if (repairLevel === "heavy" && equityAvailable > 60_000) {
    exit = { strategy: "Fix & flip", why: `${money(flipProfit)} projected flip profit after a full rehab.` }
  } else if (wholesaleSpread > 0) {
    exit = { strategy: "Wholesale (thin)", why: `Tight ${money(wholesaleSpread)} spread — negotiate price down before assigning.` }
  } else {
    exit = { strategy: "Negotiate hard", why: "Numbers are tight at asking — needs a discount to pencil." }
  }

  // Risk flags.
  const risks: RiskFlag[] = []
  if (hasValue && equityAvailable <= 0) risks.push({ label: "Underwater — debt ≥ value", severity: "high" })
  if (!hasValue) risks.push({ label: "No value estimate — can't fully underwrite", severity: "medium" })
  if (lead.occupancy === "owner_occupied") risks.push({ label: "Owner-occupied — may resist leaving", severity: "medium" })
  if (typeof lead.daysUntilAuction === "number" && lead.daysUntilAuction >= 0 && lead.daysUntilAuction <= 14)
    risks.push({ label: `Auction in ${lead.daysUntilAuction}d — very short runway`, severity: "high" })
  const superLien = lead.juniorLiens?.some((l) => l.type === "hoa_lien" || l.type === "tax_lien")
  if (superLien) risks.push({ label: "HOA/tax lien — can survive foreclosure", severity: "high" })
  if ((lead.juniorLiens?.length ?? 0) >= 2) risks.push({ label: `${lead.juniorLiens!.length} junior liens stacked behind 1st`, severity: "medium" })

  const scoreParts: ScorePart[] = SCORE_META.map((m) => {
    const value = b?.[m.key] ?? 0
    return { key: m.key, label: m.label, value, max: m.max, pct: Math.round((value / m.max) * 100) }
  })

  // Narrative.
  const stageTxt = (lead.foreclosureStage ?? "").replace(/_/g, " ").toLowerCase()
  const parts: string[] = []
  parts.push(`${lead.priority} (${lead.score}/100)`)
  if (hasValue) parts.push(`~${equityPercent}% equity (${money(equityAvailable)}) on a ${money(arv)} home`)
  if (stageTxt) parts.push(stageTxt)
  if (typeof lead.daysUntilAuction === "number" && lead.daysUntilAuction >= 0) parts.push(`auction in ${lead.daysUntilAuction}d`)
  let narrative = parts.join(" · ") + "."
  if (hasValue) narrative += ` Best exit: ${exit.strategy} — MAO ${money(mao)}, ${exit.strategy.startsWith("Fix") ? `flip profit ${money(flipProfit)}` : `spread ${money(wholesaleSpread)}`}.`

  return {
    hasValue, arv, repairLevel, repairCost, totalDebt, mao,
    equityAvailable, equityPercent, wholesaleSpread, flipProfit,
    grade, motivation, exit, risks, scoreParts, narrative,
  }
}

export const fmtMoney = money
