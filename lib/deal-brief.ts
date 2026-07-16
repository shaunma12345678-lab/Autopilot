// Deal Brief — the investor's due-diligence layer for one property. Three
// honest answers, deterministically composed from the real numbers (no AI, no
// latency, nothing invented):
//   1. WHAT WE KNOW — the verified facts driving the verdict.
//   2. THE GAPS — every unknown, why it matters in dollars, and exactly which
//      button in the app fills it (enrich, skip-trace, valuation, records).
//   3. THE CHECKLIST — what to verify before money moves (title, arrears,
//      occupancy, condition), tailored to this property's age/stage/signals.
// Plus a plain-English explanation paragraph and a what-would-change-my-mind
// sensitivity line. Pure and synchronous; never throws.

import type { ForeclosureLead } from "@/lib/agents/foreclosure-agent"
import { analyzeDeal, estimateLoanPayoff, type DealAnalysis } from "@/lib/deal-analysis"
import { predictPreForeclosure } from "@/lib/predictive"
import { fuseSignals } from "@/lib/signal-fusion"

export interface DealGap {
  key: string
  label: string
  severity: "high" | "medium" | "low"
  why: string          // what this unknown costs you, concretely
  fillWith: string     // the exact app action that fills it
}

export interface DealKnown { label: string; value: string }
export interface DealCheck { item: string; because: string }

export interface DealBrief {
  explanation: string        // plain-English read of the whole deal
  confidence: number         // 0-100 data completeness/quality for THIS lead
  confidenceLabel: string
  knowns: DealKnown[]
  gaps: DealGap[]            // high severity first
  checklist: DealCheck[]
  sensitivity: string        // what would change the verdict, with numbers
}

const money = (n: number) => `$${Math.round(n).toLocaleString()}`

export function dealBrief(lead: ForeclosureLead, precomputed?: DealAnalysis): DealBrief {
  const a = precomputed ?? analyzeDeal(lead)
  const pred = predictPreForeclosure(lead)
  const fusion = fuseSignals(lead)
  const payoff = estimateLoanPayoff(lead)

  // ── What we know ────────────────────────────────────────────────────────────
  const knowns: DealKnown[] = []
  if (lead.foreclosureStage) knowns.push({ label: "Distress stage", value: lead.foreclosureStage.replace(/_/g, " ").toLowerCase() })
  if (fusion.count > 0) knowns.push({ label: "Distress signals", value: `${fusion.count} independent (${fusion.level})` })
  if (a.hasValue && !a.valueEstimated) knowns.push({ label: "Value", value: `${money(a.arv)} (real estimate)` })
  if (lead.sqft) knowns.push({ label: "Size", value: `${lead.sqft.toLocaleString()} sqft${lead.beds ? ` · ${lead.beds}bd/${lead.baths ?? "?"}ba` : ""}` })
  if (lead.yearBuilt) knowns.push({ label: "Built", value: String(lead.yearBuilt) })
  if (lead.ownerName && !/unknown/i.test(lead.ownerName)) knowns.push({ label: "Owner", value: lead.ownerName })
  if (lead.mailingAddress) knowns.push({ label: "Mailing address", value: "on file (county record)" })
  if (lead.phone) knowns.push({ label: "Phone", value: "on file" })
  if ((lead.totalLiens ?? 0) > 0) knowns.push({ label: "Recorded debt", value: money(lead.totalLiens ?? 0) })
  if (lead.auctionDate) knowns.push({ label: "Auction", value: lead.auctionDate })
  if (lead.purchasePrice) knowns.push({ label: "Last sale", value: `${money(lead.purchasePrice)}${lead.purchaseDate ? ` (${String(lead.purchaseDate).slice(0, 4)})` : ""}` })

  // ── The gaps — each with its dollar consequence and the fix ────────────────
  const gaps: DealGap[] = []
  const gap = (key: string, label: string, severity: DealGap["severity"], why: string, fillWith: string) =>
    gaps.push({ key, label, severity, why, fillWith })

  if (!a.hasValue) {
    gap("value", "No value estimate", "high",
      "Without a value there is no MAO, no spread, no verdict — everything downstream is blocked.",
      "✨ Enrich (free) or Live Valuation on the lead card")
  } else if (a.valueEstimated) {
    gap("value-est", "Value is modeled, not measured", "high",
      `The ${money(a.arv)} ARV comes from area medians/appreciation, not comps of THIS house. A 15% miss moves MAO by ~${money(a.arv * 0.15 * 0.7)}.`,
      "Live Valuation button, or pull 3 manual comps before offering")
  }
  if (!lead.sqft) {
    gap("sqft", "Square footage unknown", "high",
      "Rehab is estimated per-sqft — without size, the repair budget (and therefore MAO) is a guess.",
      "✨ Enrich — county parcel records fill sqft in covered counties")
  }
  if (!lead.ownerName || /unknown/i.test(lead.ownerName ?? "")) {
    gap("owner", "Owner unknown", "high",
      "You can't negotiate with an address. No owner = no offer conversation.",
      "👤 Skip-trace (finds the name first, then contact)")
  } else if (!lead.phone && !lead.email) {
    gap("contact", "No phone or email", "medium",
      "Mail-only outreach: slower and one-way. A phone number triples your shot at first contact.",
      "👤 Skip-trace on the lead card")
  }
  if (a.debtEstimated) {
    gap("debt", "Debt is amortization-estimated", "medium",
      `The ${money(a.totalDebt)} payoff is modeled from the ${payoff ? `~${payoff.rate}% ` : ""}original loan — junior liens, arrears, and fees are invisible until a title search.`,
      "Order a title search / O&E report before contracting")
  } else if ((lead.totalLiens ?? 0) === 0 && lead.purchasePrice) {
    gap("liens", "No recorded debt found", "low",
      "Could be free & clear (great) — or the record is incomplete. Verify before assuming equity.",
      "County recorder lookup in 🔎 Property & Records")
  }
  if (!lead.occupancy) {
    gap("occupancy", "Occupancy unknown", "medium",
      "Vacant, owner-occupied, and tenant-occupied are three different deals (access, condition, eviction timeline).",
      "Street View in 🔎 Property & Records, or drive by")
  }
  if (!lead.yearBuilt) {
    gap("year", "Year built unknown", "low",
      "Age drives the rehab guess (roof, systems, lead paint pre-1978 disclosure).",
      "✨ Enrich — parcel records carry year built")
  }
  if (a.rental && lead.rentEstimate == null) {
    gap("rent", "Rent is the area median, not this house", "low",
      "Hold/BRRRR cash flow uses the market rent — this house's real rent could differ ±15%.",
      "Live Valuation (rent estimate) or 3 rental comps")
  }
  const sevRank = { high: 0, medium: 1, low: 2 }
  gaps.sort((x, y) => sevRank[x.severity] - sevRank[y.severity])

  // ── Confidence: how much of this verdict rests on verified ground ──────────
  let conf = 20
  if (a.hasValue) conf += a.valueEstimated ? 10 : 25
  if (lead.sqft) conf += 12
  if (lead.ownerName && !/unknown/i.test(lead.ownerName)) conf += 10
  if (lead.phone || lead.email) conf += 8
  if (!a.debtEstimated && (lead.totalLiens ?? 0) > 0) conf += 10
  if (lead.occupancy) conf += 7
  if (lead.yearBuilt) conf += 4
  if (fusion.count >= 2) conf += 4
  const confidence = Math.max(0, Math.min(100, conf))
  const confidenceLabel = confidence >= 70 ? "solid ground" : confidence >= 45 ? "workable — verify the high gaps" : "thin — enrich before spending time"

  // ── Plain-English explanation ───────────────────────────────────────────────
  const parts: string[] = []
  if (a.distressed) parts.push(`This is a real distressed situation (${a.distressType.toLowerCase()}${fusion.count >= 2 ? `, corroborated by ${fusion.count} independent signals` : ""}).`)
  else if (pred.predicted) parts.push(`Not in foreclosure yet — our engine forecasts a ${pred.probability}% chance it gets there ${pred.timeframe}.`)
  else parts.push("No strong distress signal — treat this as an ordinary off-market prospect.")
  if (a.hasValue) {
    parts.push(`At ${a.valueEstimated ? "a modeled" : "an estimated"} ${money(a.arv)} value with ~${a.equityPercent}% equity, the numbers say offer at most ${money(a.mao)}; ${a.headlineLabel.toLowerCase()} ≈ ${money(a.headlineProfit)}.`)
    parts.push(`Verdict: ${a.verdict.call} — ${a.verdict.reason}`)
  } else {
    parts.push("There's no usable value yet, so the verdict is Underwrite: fill the value gap first — everything else waits on it.")
  }
  if (gaps.filter((g) => g.severity === "high").length) {
    parts.push(`Before believing any of it, close the ${gaps.filter((g) => g.severity === "high").length} high-severity gap${gaps.filter((g) => g.severity === "high").length === 1 ? "" : "s"} below — they move real dollars.`)
  }
  const explanation = parts.join(" ")

  // ── Sensitivity: what would change the verdict ──────────────────────────────
  let sensitivity = ""
  if (a.hasValue) {
    const maoDown = Math.round(a.arv * 0.85 * 0.7 - a.repairCost)
    const rehabUp = Math.round(a.headlineProfit - a.repairCost * 0.5)
    sensitivity = `If the value comes in 15% lower, MAO drops to ~${money(Math.max(0, maoDown))}. If rehab runs 50% over, ${a.headlineLabel.toLowerCase()} falls to ~${money(rehabUp)}${rehabUp <= 0 ? " — the deal dies" : ""}. Negotiate with both numbers in mind.`
  } else {
    sensitivity = "No sensitivity math until a value exists — enrich first."
  }

  // ── The pre-offer checklist, tailored ───────────────────────────────────────
  const checklist: DealCheck[] = [
    { item: "Title search / O&E report", because: a.debtEstimated ? "debt is estimated — juniors and arrears are invisible until you pull title" : "confirm the recorded liens are the whole story" },
  ]
  if (lead.foreclosureStage) checklist.push({ item: "Verify foreclosure status with the trustee/county", because: "statuses go stale; a reinstated or postponed sale changes your leverage and timeline" })
  if (lead.auctionDate) checklist.push({ item: `Confirm the ${lead.auctionDate} sale date`, because: "auctions get postponed weekly — your urgency math depends on it" })
  checklist.push({ item: "Confirm occupancy in person", because: lead.occupancy ? `recorded as ${lead.occupancy} — verify it's still true` : "unknown occupancy = unknown access, condition, and eviction cost" })
  if ((lead.yearBuilt ?? 2000) < 1978) checklist.push({ item: "Lead-paint disclosure + inspection scope", because: `built ${lead.yearBuilt} — pre-1978 rules apply and systems are likely original` })
  else if ((lead.yearBuilt ?? 2000) < 1990) checklist.push({ item: "Roof / HVAC / panel age check", because: `built ${lead.yearBuilt} — big-ticket systems may be at end of life; each is a $8–15k swing` })
  if (a.bankruptcy) checklist.push({ item: "Bankruptcy docket check", because: "signals suggest a possible automatic stay — contracting during one wastes everyone's time" })
  checklist.push({ item: "Walk the property (or video walkthrough) before final numbers", because: "every rehab estimate here is from data, not eyes — the walkthrough is where deals are really priced" })

  return { explanation, confidence, confidenceLabel, knowns, gaps, checklist, sensitivity }
}
