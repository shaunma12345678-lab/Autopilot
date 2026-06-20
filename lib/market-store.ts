// Persistence for the 24/7 market analyzer. Stores a pre-computed report per
// market (in the AgentMemory KV store, no migration) plus a rotating cursor so
// the cron can work through all markets a few at a time. The Markets section
// reads these so the Top-20 / Upcoming lists are always fresh and rank by LIVE
// data. Best-effort throughout.

import { prisma } from "@/lib/prisma"
import { resolveLearningBusinessId } from "@/lib/learning-store"
import type { MarketReport, MarketStrategies } from "@/lib/market-analysis"
import type { Fundamentals } from "@/lib/market-fundamentals"

const SLUG = "re-markets"
const KEY  = "cache"

export interface MarketEntry {
  city: string; state: string
  report: MarketReport; strat: MarketStrategies
  fundamentals?: Fundamentals | null; fundScore?: number | null; fundReasons?: string[]
  at: string
}
export interface MarketCache { reports: Record<string, MarketEntry>; cursor: number }

export function marketKey(city: string, state: string): string {
  return `${city.toLowerCase().trim()}:${(state || "").toUpperCase().trim()}`
}

const empty = (): MarketCache => ({ reports: {}, cursor: 0 })

export async function loadMarketCache(): Promise<MarketCache> {
  try {
    const businessId = await resolveLearningBusinessId()
    if (!businessId) return empty()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mem = prisma.agentMemory as any
    const row = await mem.findFirst({ where: { businessId, agentSlug: SLUG, key: KEY } })
    if (row?.value) {
      const parsed = JSON.parse(row.value) as MarketCache
      if (parsed && parsed.reports) return { reports: parsed.reports, cursor: parsed.cursor ?? 0 }
    }
  } catch { /* first run */ }
  return empty()
}

export async function saveMarketCache(cache: MarketCache): Promise<void> {
  try {
    const businessId = await resolveLearningBusinessId()
    if (!businessId) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mem = prisma.agentMemory as any
    const value = JSON.stringify(cache)
    await mem.upsert({
      where:  { businessId, agentSlug: SLUG, key: KEY },
      create: { id: crypto.randomUUID(), businessId, agentSlug: SLUG, key: KEY, value, updatedAt: new Date().toISOString() },
      update: { value, updatedAt: new Date().toISOString() },
    })
  } catch { /* best-effort */ }
}
