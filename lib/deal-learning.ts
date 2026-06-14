// #7 Learning loop — learns the profile of deals you actually pursue (CRM stage
// Offer/Contract/Closed) and flags new leads that match it. Pure, client-side,
// localStorage-free (derived on demand from the leads + CRM map). Null-safe.

import type { ForeclosureLead } from "@/lib/agents/foreclosure-agent"
import type { DealAnalysis } from "@/lib/deal-analysis"
import type { CrmMap } from "@/lib/crm"

const GOOD_STAGES = new Set(["offer", "contract", "closed"])
const MIN_SAMPLES = 3

export interface LearnedProfile {
  n:            number
  avgScore:     number
  avgEquity:    number
  absenteeRate: number   // 0-1
  topExit:      string | null
  topDistress:  string | null
}

function topKey(counts: Record<string, number>): string | null {
  let best: string | null = null, bestN = 0
  for (const [k, v] of Object.entries(counts)) if (v > bestN) { best = k; bestN = v }
  return best
}

export function learnProfile(leads: ForeclosureLead[], crm: CrmMap, analyze: (l: ForeclosureLead) => DealAnalysis): LearnedProfile | null {
  const good = leads.filter((l) => GOOD_STAGES.has(crm[l.attomId] ?? ""))
  if (good.length < MIN_SAMPLES) return null

  let score = 0, equity = 0, absentee = 0
  const exits: Record<string, number> = {}, distress: Record<string, number> = {}
  for (const l of good) {
    const a = analyze(l)
    score += l.score ?? 0
    equity += a.equityPercent
    if (l.isAbsentee || l.occupancy === "absentee") absentee++
    exits[a.exit.strategy] = (exits[a.exit.strategy] ?? 0) + 1
    if (a.distressType) distress[a.distressType] = (distress[a.distressType] ?? 0) + 1
  }
  const n = good.length
  return {
    n,
    avgScore:     Math.round(score / n),
    avgEquity:    Math.round(equity / n),
    absenteeRate: absentee / n,
    topExit:      topKey(exits),
    topDistress:  topKey(distress),
  }
}

// Does this lead resemble the deals you pursue? (lenient — meant as a nudge.)
export function fitsProfile(lead: ForeclosureLead, a: DealAnalysis, profile: LearnedProfile | null): boolean {
  if (!profile) return false
  let hits = 0
  if (Math.abs((lead.score ?? 0) - profile.avgScore) <= 15) hits++
  if (Math.abs(a.equityPercent - profile.avgEquity) <= 20) hits++
  if (profile.absenteeRate >= 0.5 && (lead.isAbsentee || lead.occupancy === "absentee")) hits++
  if (profile.topExit && a.exit.strategy === profile.topExit) hits++
  if (profile.topDistress && a.distressType === profile.topDistress) hits++
  return hits >= 2
}
