// The Autonomous Acquisitions Agent's work cycle (real estate). Rotates through
// the user's buy-box markets, finds the best deals, keeps only NEW ones above
// the score threshold (deduped against the seen-set), and prepends them to the
// feed. Reused by the cron (scheduled) and the "Run now" button. Best-effort.

import { loadAgent, saveAgent, leadSig, type AgentFeedItem } from "@/lib/agent-store"
import { deepSearch, type DeepSearchParams } from "@/lib/deep-search-engine"
import { freeLeadToForeclosureLead } from "@/lib/foreclosure-lead-adapter"
import { fillComps } from "@/lib/comp-engine"
import { rankBestDeals } from "@/lib/best-deals"
import { fetchFundamentals } from "@/lib/market-fundamentals"

const BATCH = 2   // markets scanned per cycle (rotating), to stay within the time budget

export interface AgentCycleResult { ran: boolean; found: number; scanned: number; markets: string[] }

export async function runAgentCycle(force = false): Promise<AgentCycleResult> {
  const state = await loadAgent()
  if ((!state.config.enabled && !force) || state.config.markets.length === 0) {
    return { ran: false, found: 0, scanned: 0, markets: [] }
  }

  const markets = state.config.markets
  const start = state.config.cursor % markets.length
  const batch = Array.from({ length: Math.min(BATCH, markets.length) }, (_, i) => markets[(start + i) % markets.length])
  const seenSet = new Set(state.seen)
  const newItems: AgentFeedItem[] = []
  const names: string[] = []
  let scanned = 0

  for (const mk of batch) {
    names.push(mk.searchType === "county" ? `${mk.county} County, ${mk.state}` : `${mk.city}, ${mk.state}`)
    try {
      const params: DeepSearchParams = mk.searchType === "county"
        ? { searchType: "county", county: mk.county ?? "", state: mk.state, maxLeads: state.config.depth }
        : { searchType: "city", city: mk.city ?? "", state: mk.state, maxLeads: state.config.depth }
      const [ds, fund] = await Promise.all([
        deepSearch(params).catch(() => null),
        fetchFundamentals(mk.city || mk.county || "", mk.state).catch(() => null),
      ])
      const leads = ds ? fillComps(ds.leads.map(freeLeadToForeclosureLead)) : []
      scanned += leads.length
      const ranked = rankBestDeals(leads, { fallbackValue: fund?.medianHomeValue ?? undefined })
      for (const d of ranked) {
        if (d.score < state.config.minScore) continue
        const sig = leadSig(d.lead)
        if (!sig || seenSet.has(sig)) continue
        seenSet.add(sig)
        newItems.push({
          address: d.lead.address, city: d.lead.city ?? "", state: d.lead.state ?? mk.state, zip: d.lead.zip ?? "",
          score: d.score, tier: d.tier, reasons: d.reasons, at: new Date().toISOString(), lead: d.lead,
        })
      }
    } catch { /* skip this market */ }
  }

  newItems.sort((a, b) => b.score - a.score)
  state.feed = [...newItems, ...state.feed]
  state.seen = Array.from(seenSet)
  state.config.cursor = (start + batch.length) % markets.length
  await saveAgent(state)
  return { ran: true, found: newItems.length, scanned, markets: names }
}
