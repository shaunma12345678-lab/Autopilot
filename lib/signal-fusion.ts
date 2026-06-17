// Signal-fusion confidence — the cross-source corroboration moat. When the SAME
// property shows up across multiple INDEPENDENT distress vectors (a foreclosure
// filing AND tax delinquency AND vacancy…), it's a near-certain, highly
// motivated deal. We fuse those vectors into one confidence score that no
// single-list competitor can produce. Pure, synchronous, never throws.

import type { ForeclosureLead } from "@/lib/agents/foreclosure-agent"

export interface SignalFusion {
  confidence:  number        // 0-100
  categories:  string[]      // the independent distress vectors detected
  count:       number        // how many independent vectors corroborate
  corroborated: boolean      // 2+ independent vectors
  level:       "verified" | "strong" | "single" | "thin"
}

export function fuseSignals(lead: ForeclosureLead): SignalFusion {
  const text = [lead.distressSignals?.join(" "), lead.scoreReason, lead.foreclosureType].filter(Boolean).join(" ").toLowerCase()
  const cats: string[] = []
  const add = (label: string, cond: boolean) => { if (cond) cats.push(label) }

  const filing = ["NOTICE_OF_DEFAULT", "LIS_PENDENS", "NOTICE_OF_SALE", "AUCTION"].includes(lead.foreclosureStage) || (lead.defaultAmount ?? 0) > 0 || Boolean(lead.auctionDate)
  add("Foreclosure filing", filing)
  add("Tax delinquency", lead.taxDelinquent || /tax delinquen|tax default|back tax|delinquent tax/.test(text))
  add("Vacancy", lead.occupancy === "vacant" || /vacant|abandon|boarded/.test(text))
  add("Code violation", /code violation|condemn|nuisance|unsafe/.test(text))
  add("Liens / judgments", (lead.juniorLiens?.length ?? 0) > 0 || /\blien\b|judgment|heloc/.test(text))
  add("Probate / divorce", /probate|deceased|estate|inherited|obituary|divorce|marital/.test(text))
  add("Eviction", /eviction|unlawful detainer/.test(text))
  add("Absentee owner", lead.isAbsentee || lead.occupancy === "absentee")

  const count = cats.length
  let confidence = Math.min(100, count * 22 + (lead.score ?? 0) * 0.15)
  if (filing && count === 1) confidence = Math.max(confidence, 55) // a real filing alone is fairly certain
  confidence = Math.round(confidence)

  const level: SignalFusion["level"] = count >= 3 ? "verified" : count === 2 ? "strong" : count === 1 ? "single" : "thin"
  return { confidence, categories: cats, count, corroborated: count >= 2, level }
}
