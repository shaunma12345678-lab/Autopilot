// Self-learning personalization — learns an investor's taste from the deals they
// SAVE (price band, markets, equity appetite, flip-vs-hold lean) and scores how
// well any new deal fits that taste. Blended into the Best-Deals ranking so the
// list adapts to each user the more they use it. Pure & synchronous, never throws.

import type { BestDeal } from "@/lib/best-deals"

export interface Prefs {
  n:         number
  priceMin:  number
  priceMax:  number
  states:    Record<string, number>
  cities:    Record<string, number>
  avgEquity: number
  flipShare: number   // 0-1 — how often saved deals leaned flip/fix vs hold
}

const isFlip = (d: BestDeal): boolean => /flip|fix/.test((d.deal.exit?.strategy || "").toLowerCase())

export function learnPreferences(saved: BestDeal[]): Prefs | null {
  if (saved.length < 2) return null   // need a couple of saves to learn anything
  const arvs = saved.map((d) => d.deal.arv).filter((v) => v > 0).sort((a, b) => a - b)
  const states: Record<string, number> = {}, cities: Record<string, number> = {}
  let equitySum = 0, equityN = 0, flips = 0
  for (const d of saved) {
    const st = (d.lead.state || "").toUpperCase(); if (st) states[st] = (states[st] || 0) + 1
    const c = (d.lead.city || "").toLowerCase().trim(); if (c) cities[c] = (cities[c] || 0) + 1
    if (d.deal.equityPercent != null) { equitySum += d.deal.equityPercent; equityN++ }
    if (isFlip(d)) flips++
  }
  const lo = arvs.length ? arvs[Math.floor(arvs.length * 0.1)] : 0
  const hi = arvs.length ? arvs[Math.floor(arvs.length * 0.9)] : 0
  return {
    n: saved.length,
    priceMin: Math.round(lo * 0.75),
    priceMax: hi > 0 ? Math.round(hi * 1.25) : Number.MAX_SAFE_INTEGER,
    states, cities,
    avgEquity: equityN ? Math.round(equitySum / equityN) : 0,
    flipShare: saved.length ? flips / saved.length : 0.5,
  }
}

// How well a deal matches the learned taste (0-100) + the human reasons.
export function fitScore(deal: BestDeal, p: Prefs): { score: number; reasons: string[] } {
  const reasons: string[] = []
  let s = 0
  const arv = deal.deal.arv
  if (arv > 0 && arv >= p.priceMin && arv <= p.priceMax) { s += 35; reasons.push("in your price range") }
  const st = (deal.lead.state || "").toUpperCase()
  if (st && p.states[st]) { s += 25; reasons.push(`${st} — a market you save`) }
  const c = (deal.lead.city || "").toLowerCase().trim()
  if (c && p.cities[c]) { s += 20; reasons.push(`${deal.lead.city} — your area`) }
  if (deal.deal.equityPercent != null && p.avgEquity > 0 && deal.deal.equityPercent >= p.avgEquity - 10) { s += 10; reasons.push("equity like your saved deals") }
  if (p.flipShare >= 0.6 && isFlip(deal)) { s += 10; reasons.push("flip — your style") }
  else if (p.flipShare <= 0.4 && !isFlip(deal)) { s += 10; reasons.push("buy-&-hold — your style") }
  return { score: Math.min(100, s), reasons: reasons.slice(0, 3) }
}
