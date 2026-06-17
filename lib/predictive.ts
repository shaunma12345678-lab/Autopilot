// Predictive pre-foreclosure engine — our OWN forecast of which properties are
// likely to enter foreclosure BEFORE any notice is filed. This is the moat: it
// fuses early-warning signals (tax delinquency, probate, vacancy, code
// violations, evictions, lien stacking, tired-landlord patterns) into a single
// probability + timeframe, with the exact factors so it's explainable.
//
// CRITICAL: these are PREDICTIONS, not filed foreclosures. The UI must always
// label them as our forecast. `isConfirmedForeclosure` separates the two.

import type { ForeclosureLead } from "@/lib/agents/foreclosure-agent"

export interface Prediction {
  predicted:   boolean            // a forecast (no confirmed filing) with signal
  confirmed:   boolean            // already a filed foreclosure (not a forecast)
  probability: number             // 0-100 likelihood of foreclosure in timeframe
  timeframe:   string             // human window
  confidence:  "high" | "medium" | "low"
  factors:     string[]           // explainable drivers (what we detected)
}

// Is this property already in the foreclosure pipeline (pre-foreclosure through
// auction)? If so it's a "pre-foreclosure" lead, NOT a forward-looking
// prediction. Predictions are properties NOT yet in the pipeline (below).
export function isConfirmedForeclosure(lead: ForeclosureLead): boolean {
  const stage = lead.foreclosureStage
  // Hard pipeline markers — unambiguously already in the foreclosure process.
  if (stage === "NOTICE_OF_DEFAULT" || stage === "LIS_PENDENS" || stage === "NOTICE_OF_SALE" || stage === "AUCTION") return true
  if (lead.auctionDate) return true
  if (typeof lead.daysUntilAuction === "number" && lead.daysUntilAuction >= 0) return true
  if ((lead.defaultAmount ?? 0) > 0) return true
  // NOTE: bare PRE_FORECLOSURE is the extractor's catch-all default, NOT a
  // verified filing. Without a default amount or sale date it stays a forecast
  // candidate — the early-distress signals below decide whether we predict it.
  return false
}

// Weighted early-warning signals. Tuned so 3 independent signals ⇒ high
// probability, and interactions (e.g. vacant + tax delinquent) compound.
export function predictPreForeclosure(lead: ForeclosureLead): Prediction {
  if (isConfirmedForeclosure(lead)) {
    return { predicted: false, confirmed: true, probability: 100, timeframe: "in foreclosure now", confidence: "high", factors: [] }
  }

  const text = [lead.distressSignals?.join(" "), lead.scoreReason, lead.foreclosureType].filter(Boolean).join(" ").toLowerCase()
  let p = 0
  const factors: string[] = []
  const add = (pts: number, label: string) => { p += pts; factors.push(label) }

  const taxDelq = lead.taxDelinquent || /tax delinquen|tax default|back tax|delinquent tax/.test(text)
  const probate = /probate|deceased|estate|inherited|obituary/.test(text)
  const divorce = /divorce|marital|dissolution/.test(text)
  const vacant  = lead.occupancy === "vacant" || /vacant|abandoned|boarded/.test(text)
  const code    = /code violation|condemn|nuisance|unsafe/.test(text)
  const evict   = /eviction|unlawful detainer/.test(text)
  const liens    = (lead.juniorLiens?.length ?? 0) >= 1 || /\blien\b|judgment|heloc/.test(text)
  const thinEq   = (lead.equityPercent ?? 100) < 12 && (lead.equityPercent ?? 100) >= 0
  const absentee = lead.isAbsentee || lead.occupancy === "absentee" || /absentee|out-of-state|out of state|non[- ]owner/.test(text)
  const tiredLL  = absentee && (lead.yearsOwned ?? 0) >= 12

  if (taxDelq) add(30, "Property-tax delinquent")
  if (probate) add(26, "Probate / inherited estate")
  if (divorce) add(20, "Divorce / marital dissolution")
  if (vacant)  add(22, "Vacant / abandoned")
  if (code)    add(16, "Code violations")
  if (evict)   add(16, "Eviction filing (landlord stress)")
  if (liens)   add(14, "Liens / judgments stacking")
  if (tiredLL) add(14, "Long-held absentee (tired landlord)")
  else if (absentee) add(10, "Absentee / out-of-area owner")
  if (thinEq)  add(12, "Equity eroding")

  // Compounding: multiple independent distress vectors sharply raise risk.
  if (factors.length >= 3) p += 12
  if (taxDelq && vacant) p += 8 // the classic abandon-and-stop-paying pattern

  const probability = Math.max(0, Math.min(95, Math.round(p)))
  const timeframe = probability >= 60 ? "~1–3 months" : probability >= 38 ? "~3–6 months" : "~6–12 months"
  const confidence = factors.length >= 3 ? "high" : factors.length === 2 ? "medium" : "low"

  return { predicted: factors.length > 0, confirmed: false, probability, timeframe, confidence, factors }
}
