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

export interface PayoffEstimate { balance: number; rate: number; originalLoan: number; monthsPaid: number }

// Approx U.S. average 30-yr fixed mortgage rate by purchase year (%).
function avgRateForYear(year: number): number {
  if (year >= 2023) return 6.8
  if (year >= 2022) return 5.3
  if (year >= 2020) return 3.1
  if (year >= 2018) return 4.5
  if (year >= 2015) return 3.9
  if (year >= 2010) return 4.6
  if (year >= 2007) return 6.3
  if (year >= 2003) return 5.8
  if (year >= 1999) return 7.4
  return 8.0
}

// #1 Mortgage payoff estimator — amortize the original loan to "today" so equity
// is usable even when no AVM or recorded lien total is available.
export function estimateLoanPayoff(lead: ForeclosureLead): PayoffEstimate | null {
  const price = lead.purchasePrice
  if (!price || price <= 0) return null

  let year: number | null = null
  if (lead.purchaseDate) { const d = new Date(lead.purchaseDate); if (!Number.isNaN(d.getTime())) year = d.getFullYear() }
  if (!year && lead.yearsOwned) year = new Date().getFullYear() - lead.yearsOwned
  if (!year || year < 1970 || year > new Date().getFullYear()) return null

  const monthsPaid = Math.max(0, Math.round((Date.now() - new Date(year, 0, 1).getTime()) / (1000 * 60 * 60 * 24 * 30.44)))
  const originalLoan = Math.round(price * 0.8) // assume 80% LTV at purchase
  const ratePct = avgRateForYear(year)
  const r = ratePct / 100 / 12
  const n = 360
  const k = Math.min(monthsPaid, n)
  if (k >= n) return { balance: 0, rate: ratePct, originalLoan, monthsPaid }
  const f = Math.pow(1 + r, n), g = Math.pow(1 + r, k)
  const balance = r > 0 ? Math.max(0, Math.round((originalLoan * (f - g)) / (f - 1))) : Math.round(originalLoan * (1 - k / n))
  return { balance, rate: ratePct, originalLoan, monthsPaid }
}

function leadText(lead: ForeclosureLead): string {
  return [lead.distressSignals?.join(" "), lead.lender, lead.foreclosureType, lead.scoreReason]
    .filter(Boolean).join(" ").toLowerCase()
}

// #3 Bankruptcy / automatic-stay detection (signal-based, not PACER-confirmed).
export function detectBankruptcy(lead: ForeclosureLead): boolean {
  return /bankrupt|chapter\s?(7|11|13)|automatic stay|341 meeting/.test(leadText(lead))
}

// #2 Repeat / chronic distress — a prior default, or 3+ distress categories
// stacked. Chronic distress = the most motivated sellers.
export function detectChronicDistress(lead: ForeclosureLead): boolean {
  const t = leadText(lead)
  if (/\b(prior|second|re-?filed|reinstat|previously|repeat|again)\b/.test(t) && /default|foreclos|nod\b/.test(t)) return true
  let cats = 0
  if (lead.foreclosureStage || /foreclos|notice of default|lis pendens|trustee sale|\bnod\b|\bnos\b/.test(t)) cats++
  if (lead.taxDelinquent || /tax delinquen|tax default|back taxes/.test(t)) cats++
  if ((lead.juniorLiens?.length ?? 0) > 0 || /\blien\b/.test(t)) cats++
  if (/code violation|vacant|condemn/.test(t)) cats++
  if (/probate|deceased|estate|divorce/.test(t)) cats++
  return cats >= 3
}

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
  debtEstimated:   boolean         // totalDebt came from the payoff estimator
  estimatedPayoff: number | null   // estimated current mortgage balance
  bankruptcy:      boolean         // possible bankruptcy / automatic stay
  chronic:         boolean         // repeat / chronic distress (high motivation)
  distressed:      boolean         // is this property genuinely distressed?
  distressType:    string          // short label, e.g. "Pre-foreclosure (NOD)"
  cashIn:          number          // estimated capital in (acquisition + rehab)
  roiPct:          number          // flip cash-on-cash return, %
  headlineProfit:  number          // the money number for the chosen exit
  headlineLabel:   string          // "Wholesale spread" | "Flip profit" | …
  whyGood:         string[]        // specific reasons this is (or isn't) a deal
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

  const recordedDebt = lead.totalLiens > 0
    ? lead.totalLiens
    : (lead.defaultAmount ?? 0) + (lead.juniorLiens?.reduce((s, l) => s + (l.amount ?? 0), 0) ?? 0)
  // #1: when nothing is recorded, fall back to the amortized payoff estimate.
  const payoff = estimateLoanPayoff(lead)
  const debtEstimated = recordedDebt <= 0 && payoff !== null
  const totalDebt = recordedDebt > 0 ? recordedDebt : (payoff?.balance ?? 0)

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
  // #2: repeat/chronic distress = the most motivated sellers.
  const chronic = detectChronicDistress(lead)
  if (chronic) motivation += 10
  motivation = Math.max(0, Math.min(100, Math.round(motivation)))

  // #3: possible bankruptcy / automatic stay.
  const bankruptcy = detectBankruptcy(lead)

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
  if (bankruptcy) risks.push({ label: "⚖️ Possible bankruptcy — automatic stay may block foreclosure; verify", severity: "high" })
  if (debtEstimated) risks.push({ label: "Debt is estimated from payoff (no recorded liens) — verify balance", severity: "medium" })

  const scoreParts: ScorePart[] = SCORE_META.map((m) => {
    const value = b?.[m.key] ?? 0
    return { key: m.key, label: m.label, value, max: m.max, pct: Math.round((value / m.max) * 100) }
  })

  // Is it distressed, and what kind?
  const stageRaw = lead.foreclosureStage ?? ""
  let distressType = ""
  if (stageRaw === "NOTICE_OF_SALE" || stageRaw === "AUCTION") distressType = "Foreclosure auction"
  else if (stageRaw === "NOTICE_OF_DEFAULT" || stageRaw === "LIS_PENDENS") distressType = "Pre-foreclosure (NOD)"
  else if (stageRaw === "PRE_FORECLOSURE") distressType = "Pre-foreclosure"
  else if (lead.taxDelinquent) distressType = "Tax delinquent"
  else if (lead.occupancy === "vacant") distressType = "Vacant"
  else if (chronic) distressType = "Chronic distress"
  else if ((lead.distressSignals?.length ?? 0) > 0) distressType = "Distress signal"
  const distressed = Boolean(distressType)

  // Return on investment (flip cash-on-cash: profit ÷ capital in).
  const cashIn = hasValue ? mao + repairCost : 0
  const roiPct = cashIn > 0 ? Math.round((flipProfit / cashIn) * 100) : 0
  const isFlip = exit.strategy.startsWith("Fix")
  const headlineProfit = isFlip ? flipProfit : wholesaleSpread
  const headlineLabel = isFlip ? "Flip profit" : "Wholesale spread"

  // Specific "why it's a good deal" bullets (strongest first, max 5).
  const whyGood: string[] = []
  if (hasValue && equityPercent >= 25) whyGood.push(`${equityPercent}% equity (~${money(equityAvailable)}) — real room to negotiate`)
  if (hasValue && headlineProfit > 0) whyGood.push(isFlip ? `~${money(flipProfit)} flip profit (${roiPct}% ROI)` : `~${money(wholesaleSpread)} assignment spread, little capital`)
  if (typeof lead.daysUntilAuction === "number" && lead.daysUntilAuction >= 0 && lead.daysUntilAuction <= 30) whyGood.push(`Auction in ${lead.daysUntilAuction}d — seller is under real pressure`)
  if (lead.isAbsentee || lead.occupancy === "absentee") whyGood.push("Absentee / out-of-state owner — easier to let go")
  if (lead.occupancy === "vacant") whyGood.push("Vacant — no one to evict, faster close")
  if (chronic) whyGood.push("Repeat/chronic distress — among the most motivated sellers")
  if (whyGood.length < 4) for (const s of lead.distressSignals ?? []) { if (whyGood.length >= 5) break; whyGood.push(s) }

  // Narrative.
  const stageTxt = (lead.foreclosureStage ?? "").replace(/_/g, " ").toLowerCase()
  const parts: string[] = []
  parts.push(`${lead.priority} (${lead.score}/100)`)
  if (hasValue) parts.push(`~${equityPercent}% equity (${money(equityAvailable)}) on a ${money(arv)} home`)
  if (stageTxt) parts.push(stageTxt)
  if (typeof lead.daysUntilAuction === "number" && lead.daysUntilAuction >= 0) parts.push(`auction in ${lead.daysUntilAuction}d`)
  if (chronic) parts.push("repeat/chronic distress")
  let narrative = parts.join(" · ") + "."
  if (hasValue) narrative += ` Best exit: ${exit.strategy} — MAO ${money(mao)}, ${exit.strategy.startsWith("Fix") ? `flip profit ${money(flipProfit)}` : `spread ${money(wholesaleSpread)}`}.`
  if (debtEstimated && payoff) narrative += ` Debt ${money(totalDebt)} is an estimate (orig. ~${money(payoff.originalLoan)} @ ${payoff.rate}%, ${Math.round(payoff.monthsPaid / 12)}y paid).`

  return {
    hasValue, arv, repairLevel, repairCost, totalDebt, mao,
    equityAvailable, equityPercent, wholesaleSpread, flipProfit,
    grade, motivation, exit, risks, scoreParts, narrative,
    debtEstimated, estimatedPayoff: payoff?.balance ?? null, bankruptcy, chronic,
    distressed, distressType, cashIn, roiPct, headlineProfit, headlineLabel, whyGood,
  }
}

export const fmtMoney = money
