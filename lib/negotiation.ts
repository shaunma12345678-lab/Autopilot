// Negotiation Outcome Predictor — estimates the price a distressed seller is
// likely to accept and a smart opening offer, from their real situation
// (motivation, equity room, auction urgency, occupancy). Gives the investor a
// concrete number to anchor on instead of guessing. Heuristic estimate — pure,
// never throws.

import type { ForeclosureLead } from "@/lib/agents/foreclosure-agent"
import type { DealAnalysis } from "@/lib/deal-analysis"

export interface NegotiationRead {
  discountPct: number   // estimated discount off current value
  acceptLow:   number
  acceptMid:   number
  acceptHigh:  number
  opening:     number   // suggested opening offer (below the accept, room to rise)
  fitsMao:     boolean  // can you actually acquire at/below your max offer?
  reasons:     string[]
  note:        string | null   // short-sale caveat
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

export function predictNegotiation(lead: ForeclosureLead, deal: DealAnalysis): NegotiationRead | null {
  if (!deal.hasValue || deal.arv <= 0) return null
  const arv = deal.arv
  const reasons: string[] = []

  // Base discount grows with motivation (~6%–28%).
  let discount = 0.06 + (deal.motivation / 100) * 0.22
  if (deal.motivation >= 65) reasons.push("Highly motivated seller")

  // Auction urgency — takes less to avoid foreclosure.
  const d = lead.daysUntilAuction
  if (typeof d === "number" && d >= 0 && d <= 30) { discount += 0.05; reasons.push(`Auction in ${d}d — pressure to settle`) }

  // Occupancy — vacant/absentee owners dump faster.
  if (lead.occupancy === "vacant") { discount += 0.03; reasons.push("Vacant — wants it gone") }
  else if (lead.isAbsentee || lead.occupancy === "absentee") { discount += 0.02; reasons.push("Absentee owner") }

  // Equity gates how low they can realistically go.
  const eq = deal.equityPercent
  let note: string | null = null
  if (eq != null && eq < 15) { discount = Math.min(discount, 0.12); note = "Thin equity — likely a short sale / subject-to, not a deep cash discount" }
  else if (eq != null && eq >= 40) { discount += 0.02; reasons.push(`${eq}% equity — room to discount and still cash out`) }

  discount = clamp(discount, 0.05, 0.4)
  const acceptMid = Math.round(arv * (1 - discount))
  const acceptLow = Math.round(acceptMid * 0.95)
  const acceptHigh = Math.round(acceptMid * 1.05)

  // Does it pencil — is the likely accept at/below your max allowable offer?
  const fitsMao = deal.mao <= 0 || acceptMid <= deal.mao * 1.05
  // If it pencils, open below the accept (room to rise) but never above MAO. If
  // it doesn't, your best shot is your MAO — the seller's price is above it.
  const opening = fitsMao
    ? (deal.mao > 0 ? Math.min(Math.round(acceptMid * 0.9), deal.mao) : Math.round(acceptMid * 0.9))
    : (deal.mao > 0 ? deal.mao : Math.round(acceptMid * 0.9))

  return { discountPct: Math.round(discount * 100), acceptLow, acceptMid, acceptHigh, opening, fitsMao, reasons: reasons.slice(0, 3), note }
}
