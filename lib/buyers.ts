// Cash-buyer matching — store your buyers' buy-boxes once; every deal then shows
// which buyers it fits, so disposition is instant. Client-only (localStorage),
// null-safe. Matching reuses the same underwrite the rest of the app produces.

import { schedulePush } from "@/lib/workspace-sync"
import type { ForeclosureLead } from "@/lib/agents/foreclosure-agent"
import type { DealAnalysis } from "@/lib/deal-analysis"

export interface Buyer {
  id:           string
  name:         string
  contact:      string   // phone/email for dispo
  maxPrice:     number   // 0 = no cap (ARV)
  minEquityPct: number   // 0 = any
  minProfit:    number   // 0 = any (headline profit/spread)
  areas:        string[] // cities or ZIPs they buy in ([] = anywhere)
  exits:        string[] // Wholesale/Flip/BRRRR/Hold ([] = any)
}

const KEY = "ap_buyers_v1"
export const BUYERS_EVENT = "ap-buyers-changed"

export function loadBuyers(): Buyer[] {
  if (typeof window === "undefined") return []
  try { const raw = window.localStorage.getItem(KEY); const a = raw ? JSON.parse(raw) : []; return Array.isArray(a) ? a : [] } catch { return [] }
}

export function saveBuyers(buyers: Buyer[]): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(KEY, JSON.stringify(buyers))
    schedulePush("buyers")
    window.dispatchEvent(new Event(BUYERS_EVENT))
  } catch { /* quota */ }
}

function inAreas(lead: ForeclosureLead, areas: string[]): boolean {
  if (!areas.length) return true
  const city = (lead.city ?? "").toLowerCase()
  const zip = String(lead.zip ?? "")
  return areas.some((a) => {
    const t = a.trim().toLowerCase()
    return t && (city.includes(t) || zip === a.trim())
  })
}

export function matchBuyers(lead: ForeclosureLead, a: DealAnalysis, buyers: Buyer[]): Buyer[] {
  return buyers.filter((b) => {
    if (b.maxPrice && a.arv > b.maxPrice) return false
    if (b.minEquityPct && a.equityPercent < b.minEquityPct) return false
    if (b.minProfit && a.headlineProfit < b.minProfit) return false
    if (!inAreas(lead, b.areas)) return false
    if (b.exits.length) {
      const exit = a.exit.strategy.toLowerCase()
      if (!b.exits.some((e) => exit.includes(e.toLowerCase()))) return false
    }
    return true
  })
}
