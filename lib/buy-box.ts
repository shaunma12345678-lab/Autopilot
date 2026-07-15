// #1 Buy-box — the investor's deal criteria, saved locally. When enabled, the
// map highlights only the deals that fit. Client-only (localStorage), null-safe.

import { schedulePush } from "@/lib/workspace-sync"
import type { ForeclosureLead } from "@/lib/agents/foreclosure-agent"
import type { DealAnalysis } from "@/lib/deal-analysis"

export interface BuyBox {
  enabled:      boolean
  minScore:     number   // 0 = any
  minEquityPct: number   // 0 = any
  maxPrice:     number   // 0 = no cap (ARV)
  minProfit:    number   // 0 = any (headline profit/spread)
  absenteeOnly: boolean
  exits:        string[] // [] = any; substrings matched against the exit strategy
}

export const DEFAULT_BUYBOX: BuyBox = {
  enabled: false, minScore: 0, minEquityPct: 0, maxPrice: 0, minProfit: 0, absenteeOnly: false, exits: [],
}

const KEY = "ap_buybox_v1"

export function loadBuyBox(): BuyBox {
  if (typeof window === "undefined") return DEFAULT_BUYBOX
  try {
    const raw = window.localStorage.getItem(KEY)
    return raw ? { ...DEFAULT_BUYBOX, ...JSON.parse(raw) } : DEFAULT_BUYBOX
  } catch { return DEFAULT_BUYBOX }
}

export function saveBuyBox(b: BuyBox): void {
  if (typeof window === "undefined") return
  try { window.localStorage.setItem(KEY, JSON.stringify(b)); schedulePush("buybox") } catch { /* quota */ }
}

export function matchesBuyBox(lead: ForeclosureLead, a: DealAnalysis, box: BuyBox): boolean {
  if (!box.enabled) return true
  if (box.minScore && (lead.score ?? 0) < box.minScore) return false
  if (box.minEquityPct && a.equityPercent < box.minEquityPct) return false
  if (box.maxPrice && a.arv > box.maxPrice) return false
  if (box.minProfit && a.headlineProfit < box.minProfit) return false
  if (box.absenteeOnly && !lead.isAbsentee && lead.occupancy !== "absentee") return false
  if (box.exits.length) {
    const ex = a.exit.strategy.toLowerCase()
    if (!box.exits.some((e) => ex.includes(e.toLowerCase()))) return false
  }
  return true
}
