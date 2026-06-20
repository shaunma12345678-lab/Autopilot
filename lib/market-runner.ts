// Shared market-analysis orchestration (server-only). Runs the deep search +
// pulls real, keyless fundamentals (Wikidata population/growth + BLS
// unemployment), then scores. Used by the on-demand endpoint and the 24/7 cron
// so they stay identical.

import { deepSearch } from "@/lib/deep-search-engine"
import { freeLeadToForeclosureLead } from "@/lib/foreclosure-lead-adapter"
import { fillComps } from "@/lib/comp-engine"
import { analyzeMarket, scoreStrategies, type MarketReport, type MarketStrategies } from "@/lib/market-analysis"
import { fetchFundamentals, fundamentalsScore, upsidePotential, isFundamentalsConfigured, type Fundamentals } from "@/lib/market-fundamentals"
import { opportunityScore } from "@/lib/opportunity"
import type { ForeclosureLead } from "@/lib/agents/foreclosure-agent"

export interface MarketAnalysisResult {
  report:      MarketReport
  strat:       MarketStrategies
  fundamentals: Fundamentals | null
  fundScore:   number | null
  fundReasons: string[]
  upside:      number | null    // appreciation / "how much it can go up" potential (0-100)
  upsideReasons: string[]
  fundConfigured: boolean
  leads:       ForeclosureLead[]   // top leads in the market (for the find-leads list)
  total:       number
}

export async function runMarketAnalysis(city: string, state: string, depth = 250): Promise<MarketAnalysisResult | null> {
  const [ds, fundamentals] = await Promise.all([
    deepSearch({ searchType: "city", city, state, maxLeads: depth }).catch(() => null),
    fetchFundamentals(city, state).catch(() => null),
  ])
  const allLeads = ds ? fillComps(ds.leads.map(freeLeadToForeclosureLead)) : []
  if (!allLeads.length && !fundamentals) return null

  // Override the distressed-sample value/rent with authoritative ACS numbers.
  const report = analyzeMarket(allLeads, { value: fundamentals?.medianHomeValue ?? null, rent: fundamentals?.medianRent ?? null })
  const strat  = scoreStrategies(report)
  const fs     = fundamentalsScore(fundamentals)
  const up     = upsidePotential(fundamentals)
  // Return only the top leads by opportunity to keep the payload small.
  const leads  = [...allLeads].sort((a, b) => opportunityScore(b).score - opportunityScore(a).score).slice(0, 40)
  return { report, strat, fundamentals: fundamentals ?? null, fundScore: fs?.score ?? null, fundReasons: fs?.reasons ?? [], upside: up?.score ?? null, upsideReasons: up?.reasons ?? [], fundConfigured: isFundamentalsConfigured(), leads, total: allLeads.length }
}
