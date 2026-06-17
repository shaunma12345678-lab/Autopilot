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
  // "Confirmed pre-foreclosure" = a trustee sale / auction is actually
  // SCHEDULED or already happening — that's the normal-search bucket. Anything
  // at an EARLIER point (notice of default, lis pendens, or a generic
  // pre-foreclosure with no sale date) is still a FORECAST: we predict it will
  // reach the auction block, but it hasn't been scheduled yet. Splitting on
  // "is a sale scheduled?" is the one signal our data reliably carries, so the
  // predictive bucket is never empty.
  const stage = lead.foreclosureStage
  if (stage === "NOTICE_OF_SALE" || stage === "AUCTION") return true
  if (lead.auctionDate) return true
  if (typeof lead.daysUntilAuction === "number" && lead.daysUntilAuction >= 0) return true
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

  // A REAL early foreclosure filing (notice of default / lis pendens) is itself
  // a strong forecast — these are recorded court/recorder events, not listings,
  // so they qualify on their own. A bare PRE_FORECLOSURE is just the listing
  // default and does NOT auto-qualify — it needs a genuine distress/motivation
  // signal below. This keeps "predicted" a DISTINCT subset (purple) instead of
  // turning every ordinary listing purple.
  const stage = lead.foreclosureStage
  if (stage === "NOTICE_OF_DEFAULT")   add(36, "Notice of default filed — early in the foreclosure timeline")
  else if (stage === "LIS_PENDENS")    add(34, "Lis pendens filed — pre-sale stage")

  // Motivated-seller / stale-listing signals (from listing data like Redfin):
  // long days-on-market, price cuts, as-is / must-sell language forecast a
  // distressed sale before any filing.
  const motivated = /motivated seller|price (?:cut|reduced|drop|reduction)|must sell|\bas[- ]is\b|cash only|fixer|distressed listing|short sale/.test(text)
  if (motivated) add(16, "Motivated-seller signals (long days-on-market / price cuts / as-is)")

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
