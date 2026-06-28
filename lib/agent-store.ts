// Persistence for the Autonomous Acquisitions Agent. Stores the user's buy-box
// config, the live feed of NEW deals the agent has found, and a seen-set so it
// never resurfaces the same property. Lives in the AgentMemory KV store (no
// migration). Best-effort throughout — never throws.

import { prisma } from "@/lib/prisma"
import { resolveLearningBusinessId } from "@/lib/learning-store"
import type { ForeclosureLead } from "@/lib/agents/foreclosure-agent"

const SLUG = "re-agent"
const KEY  = "state"
const FEED_CAP = 80
const SEEN_CAP = 4000

export interface AgentMarket { searchType: "city" | "county"; city?: string; county?: string; state: string }
export interface AgentConfig {
  enabled:  boolean
  markets:  AgentMarket[]
  minScore: number
  depth:    number
  cursor:   number
}
export interface AgentFeedItem {
  address: string; city: string; state: string; zip: string
  score:   number
  tier:    string
  reasons: string[]
  at:      string
  lead:    ForeclosureLead   // kept so the deal sheet can be opened from the feed
}
export interface AgentState { config: AgentConfig; feed: AgentFeedItem[]; seen: string[] }

export const leadSig = (l: { address?: string; city?: string }) =>
  `${(l.address ?? "").toLowerCase()}|${(l.city ?? "").toLowerCase()}`.replace(/[\s,#.-]/g, "")

const empty = (): AgentState => ({
  config: { enabled: false, markets: [], minScore: 55, depth: 300, cursor: 0 },
  feed: [], seen: [],
})

export async function loadAgent(): Promise<AgentState> {
  try {
    const businessId = await resolveLearningBusinessId()
    if (!businessId) return empty()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mem = prisma.agentMemory as any
    const row = await mem.findFirst({ where: { businessId, agentSlug: SLUG, key: KEY } })
    if (row?.value) {
      const p = JSON.parse(row.value) as Partial<AgentState>
      const e = empty()
      return {
        config: { ...e.config, ...(p.config ?? {}) },
        feed:   Array.isArray(p.feed) ? p.feed : [],
        seen:   Array.isArray(p.seen) ? p.seen : [],
      }
    }
  } catch { /* first run */ }
  return empty()
}

export async function saveAgent(state: AgentState): Promise<void> {
  try {
    const businessId = await resolveLearningBusinessId()
    if (!businessId) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mem = prisma.agentMemory as any
    const trimmed: AgentState = {
      config: state.config,
      feed:   state.feed.slice(0, FEED_CAP),
      seen:   state.seen.slice(-SEEN_CAP),
    }
    const value = JSON.stringify(trimmed)
    await mem.upsert({
      where:  { businessId, agentSlug: SLUG, key: KEY },
      create: { id: crypto.randomUUID(), businessId, agentSlug: SLUG, key: KEY, value, updatedAt: new Date().toISOString() },
      update: { value, updatedAt: new Date().toISOString() },
    })
  } catch { /* best-effort */ }
}
