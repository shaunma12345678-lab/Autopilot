// Opportunity-zone ranking — "where's the money right now?" Groups the current
// results by ZIP (or city) and ranks each area by deal quality: A/B-grade
// density × median profit × score, plus how many are predicted (off-market).
// Pure, computed from our own data — no external API.

import type { ForeclosureLead } from "@/lib/agents/foreclosure-agent"
import { analyzeDeal } from "@/lib/deal-analysis"
import { predictPreForeclosure } from "@/lib/predictive"

export interface ZoneStat {
  key:          string   // zip or city
  label:        string
  state:        string
  count:        number
  topGrade:     number   // A/B-grade deals
  medianProfit: number
  avgScore:     number
  predicted:    number   // off-market forecasts
  score:        number   // composite ranking score
}

function median(ns: number[]): number {
  const a = ns.filter((n) => Number.isFinite(n)).sort((x, y) => x - y)
  if (!a.length) return 0
  const m = Math.floor(a.length / 2)
  return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2)
}

export function rankZones(leads: ForeclosureLead[], min = 2): ZoneStat[] {
  const groups = new Map<string, ForeclosureLead[]>()
  for (const l of leads) {
    const key = String(l.zip || "").trim() || (l.city || "").trim()
    if (!key) continue
    const arr = groups.get(key) ?? []
    arr.push(l); groups.set(key, arr)
  }

  const zones: ZoneStat[] = []
  for (const [key, ls] of groups) {
    if (ls.length < min) continue
    const analyses = ls.map((l) => analyzeDeal(l))
    const topGrade = analyses.filter((a) => a.grade === "A" || a.grade === "B").length
    const medianProfit = median(analyses.map((a) => a.headlineProfit))
    const avgScore = Math.round(ls.reduce((s, l) => s + (l.score ?? 0), 0) / ls.length)
    const predicted = ls.filter((l) => predictPreForeclosure(l).predicted).length
    const density = topGrade / ls.length
    // Composite: reward A/B density + real profit + score + off-market upside.
    const score = Math.round(density * 100 + medianProfit / 1000 + avgScore + predicted * 3)
    zones.push({
      key, label: ls[0].zip ? `${key} · ${ls[0].city ?? ""}`.trim() : key, state: ls[0].state ?? "",
      count: ls.length, topGrade, medianProfit, avgScore, predicted, score,
    })
  }

  return zones.sort((a, b) => b.score - a.score)
}
