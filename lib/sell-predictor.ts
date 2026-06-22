// Predictive "likely to sell" engine — scores how likely an owner is to sell in
// the near term, BEFORE they're obviously distressed, by weighing the forward
// drivers real estate data scientists use: life-event triggers (probate,
// divorce, death/inheritance), financial pressure (tax delinquency, default),
// occupancy (vacant/absentee), tenure (the typical move window), equity (you
// need it to sell and walk away), and mortgage RATE LOCK-IN (owners sitting on
// a ~3% loan rarely move). Pure & synchronous, never throws.

import type { ForeclosureLead } from "@/lib/agents/foreclosure-agent"

export interface SellPrediction {
  score:     number   // 0-100 likelihood to sell in the near term
  band:      "very high" | "high" | "moderate" | "low"
  timeframe: string
  reasons:   string[]
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

// Best estimate of the year the owner bought (for rate lock-in).
function purchaseYear(lead: ForeclosureLead): number | null {
  if (lead.purchaseDate) { const d = new Date(lead.purchaseDate); if (!Number.isNaN(d.getTime())) return d.getFullYear() }
  if (lead.yearsOwned != null && lead.yearsOwned >= 0) return new Date().getFullYear() - lead.yearsOwned
  return null
}

export function predictLikelyToSell(lead: ForeclosureLead): SellPrediction {
  const text = [lead.scoreReason, lead.distressSignals?.join(" "), lead.foreclosureType].filter(Boolean).join(" ").toLowerCase()
  const owner = (lead.ownerName || "").toLowerCase()
  const reasons: string[] = []
  let s = 0

  // Life-event triggers — the strongest sell signals.
  if (/probate|deceased|estate of|heirs?|inherit/.test(text) || /estate of|heirs?|et al/.test(owner)) { s += 26; reasons.push("Probate / inherited — heirs typically sell") }
  if (/divorce|dissolution of marriage/.test(text)) { s += 22; reasons.push("Divorce — forced sale common") }

  // Financial pressure.
  if (lead.taxDelinquent || /tax delinquen|back taxes|tax lien/.test(text)) { s += 16; reasons.push("Tax delinquent — financial pressure") }
  if (lead.foreclosureStage) { s += 14; reasons.push("In the foreclosure pipeline") }
  if (typeof lead.daysUntilAuction === "number" && lead.daysUntilAuction >= 0) { s += lead.daysUntilAuction <= 30 ? 16 : 8; reasons.push(`Auction in ${lead.daysUntilAuction}d`) }
  if ((lead.defaultAmount ?? 0) > 0) { s += 6; reasons.push("Default balance owed") }

  // Occupancy.
  if (lead.occupancy === "vacant" || /vacant|abandoned/.test(text)) { s += 16; reasons.push("Vacant — owner has moved on") }
  if (lead.isAbsentee || lead.occupancy === "absentee") { s += 12; reasons.push("Absentee / out-of-area owner") }
  if (/code violation|condemn/.test(text)) { s += 8; reasons.push("Code violations — costly to keep") }

  // Tenure — the typical move window (7–15y) and long-tenure downsizing (20y+).
  if (lead.yearsOwned != null) {
    if (lead.yearsOwned >= 7 && lead.yearsOwned <= 15) { s += 8; reasons.push(`Owned ${lead.yearsOwned}y — typical move window`) }
    else if (lead.yearsOwned > 20) { s += 10; reasons.push(`Owned ${lead.yearsOwned}y — long tenure, downsizing likely`) }
  }

  // Equity — you need it to sell and walk away with cash.
  if (lead.equityPercent != null && lead.equityPercent >= 40) { s += 10; reasons.push(`${lead.equityPercent}% equity — can sell and cash out`) }

  // Rate lock-in — owners on a ~3% loan rarely move; high-rate buyers do.
  const py = purchaseYear(lead)
  if (py) {
    if (py >= 2019 && py <= 2021) { s -= 8; reasons.push("Bought 2019–21 at ~3% — rate lock-in lowers sell odds") }
    else if (py >= 2022) { s += 6; reasons.push("Bought 2022+ at a high rate — more move-prone") }
  }

  const score = clamp(Math.round(s), 0, 100)
  const band: SellPrediction["band"] = score >= 70 ? "very high" : score >= 50 ? "high" : score >= 30 ? "moderate" : "low"
  const timeframe = score >= 70 ? "0–6 months" : score >= 50 ? "6–12 months" : "12+ months"
  return { score, band, timeframe, reasons: reasons.slice(0, 5) }
}
