// Competition Radar — scores how EARLY and low-competition a lead is, i.e. how
// winnable it actually is, not just how big the spread looks. The core edge in
// pre-foreclosure: contact a seller in week 1 and you have almost no
// competition; by week 8 everyone has mailed and called them. Pure, never throws.

import type { ForeclosureLead } from "@/lib/agents/foreclosure-agent"

export type CompLevel = "fresh" | "moderate" | "saturated"
export interface CompetitionRead {
  earlyScore: number   // 0-100, higher = earlier / fewer investors circling
  level:      CompLevel
  label:      string
  reasons:    string[]
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

export function competitionRadar(lead: ForeclosureLead, predicted: boolean, gem: boolean): CompetitionRead {
  const text = [lead.scoreReason, lead.distressSignals?.join(" "), lead.foreclosureType, lead.lender].filter(Boolean).join(" ").toLowerCase()
  const stage = lead.foreclosureStage ?? ""
  const reasons: string[] = []
  let s = 50

  // Stage — earlier in the pipeline = fewer investors have seen it.
  if (predicted) { s += 24; reasons.push("Predicted — ahead of the public record") }
  if (stage === "NOTICE_OF_DEFAULT" || stage === "LIS_PENDENS") { s += 14; reasons.push("Just-filed notice — early in the process") }
  else if (stage === "NOTICE_OF_SALE" || stage === "AUCTION") { s -= 22; reasons.push("At auction stage — widely seen") }
  else if (stage === "PRE_FORECLOSURE") { s += 6 }

  // Auction runway — long runway = fresh; imminent = late and heavily worked.
  const d = lead.daysUntilAuction
  if (typeof d === "number" && d >= 0) {
    if (d >= 90) { s += 14; reasons.push(`${d}d runway — plenty of time, low competition`) }
    else if (d >= 30) { s += 4 }
    else { s -= 12; reasons.push(`Auction in ${d}d — late, heavily worked`) }
  }

  // Visibility — mass-marketed/listed = high competition; off-market = low.
  if (/auction\.com|foreclosure\.com|\breo\b|bank.?owned|\bmls\b|listed|realtor|redfin|zillow/.test(text)) {
    s -= 20; reasons.push("Listed / mass-marketed — high competition")
  }
  if (/probate|tax delinquen|code violation|vacant|absentee|inherit|divorce/.test(text) && !/auction|reo|listed/.test(text)) {
    s += 12; reasons.push("Off-market distress signal — few investors on it")
  }
  if (gem) { s += 8; reasons.push("Off-market hidden gem") }

  const earlyScore = clamp(Math.round(s), 0, 100)
  const level: CompLevel = earlyScore >= 65 ? "fresh" : earlyScore >= 42 ? "moderate" : "saturated"
  const label = level === "fresh"
    ? "Fresh — low competition, contact early"
    : level === "moderate"
      ? "Some competition — move soon"
      : "Saturated — late/listed, widely worked"
  return { earlyScore, level, label, reasons: reasons.slice(0, 3) }
}
