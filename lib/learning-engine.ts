// Self-Learning Adaptive Engine — the system's brain that gets better the more
// you use it. It keeps a running tally of the traits/areas of leads you SEE vs.
// the ones you PURSUE (save / skip-trace / advance), computes the statistical
// LIFT of each trait (how much more likely you are to pursue a lead that has
// it), and re-ranks future searches by resemblance to your winners. With no
// data it stays out of the way (falls back to the base score); the more
// outcomes it sees, the sharper it gets — it adapts on its own.
//
// Pure + null-safe. The persistent store is a compact running tally (counts),
// not an event log, so it never balloons. Lives in the AgentMemory KV store.

import type { ForeclosureLead } from "@/lib/agents/foreclosure-agent"
import { predictPreForeclosure } from "@/lib/predictive"

// ── Feature extraction — bucket a lead into discrete, learnable traits ────────
export function featurize(lead: ForeclosureLead): string[] {
  const f: string[] = []
  f.push(`stage:${lead.foreclosureStage || "unknown"}`)
  f.push(`pred:${predictPreForeclosure(lead).predicted ? "y" : "n"}`)
  f.push(`absentee:${lead.isAbsentee || lead.occupancy === "absentee" ? "y" : "n"}`)
  f.push(`vacant:${lead.occupancy === "vacant" ? "y" : "n"}`)
  f.push(`tax:${lead.taxDelinquent ? "y" : "n"}`)
  f.push(`liens:${(lead.juniorLiens?.length ?? 0) > 0 ? "y" : "n"}`)

  const eq = lead.equityPercent
  if (eq != null) f.push(`equity:${eq < 15 ? "lo" : eq < 35 ? "mid" : "hi"}`)

  const sc = lead.score ?? 0
  f.push(`score:${sc < 45 ? "lo" : sc < 70 ? "mid" : "hi"}`)

  const v = lead.avmValue ?? lead.estimatedValue ?? 0
  if (v > 0) f.push(`value:${v < 200_000 ? "u200k" : v < 400_000 ? "200_400k" : v < 700_000 ? "400_700k" : "o700k"}`)

  if (lead.propertyType) f.push(`type:${String(lead.propertyType).toLowerCase().replace(/[^a-z ]/g, "").trim().slice(0, 16)}`)
  return f
}

export function leadArea(lead: ForeclosureLead): string {
  return (lead.zip && String(lead.zip).slice(0, 5)) || (lead.city ? `${lead.city}, ${lead.state}`.toLowerCase() : "unknown")
}

// ── Persistent tally (compact running counts) ─────────────────────────────────
export interface Tally {
  nSeen:        number
  nPursued:     number
  seen:         Record<string, number>
  pursued:      Record<string, number>
  areaSeen:     Record<string, number>
  areaPursued:  Record<string, number>
  updatedAt?:   string
}

export function emptyTally(): Tally {
  return { nSeen: 0, nPursued: 0, seen: {}, pursued: {}, areaSeen: {}, areaPursued: {} }
}

const FEATURE_CAP = 400   // distinct feature keys to retain
const AREA_CAP    = 800

function bump(map: Record<string, number>, key: string, by = 1, cap = FEATURE_CAP): void {
  if (map[key] === undefined && Object.keys(map).length >= cap) return
  map[key] = (map[key] ?? 0) + by
}

// Record a batch of SEEN leads (the search result set — the baseline).
export function applySeen(t: Tally, featureLists: string[][], areas: string[]): Tally {
  t.nSeen += featureLists.length
  for (const fs of featureLists) for (const f of fs) bump(t.seen, f)
  for (const a of areas) bump(t.areaSeen, a, 1, AREA_CAP)
  t.updatedAt = new Date().toISOString()
  return t
}

// Record a PURSUED lead (saved / skip-traced / advanced — a positive signal).
export function applyPursued(t: Tally, features: string[], area?: string): Tally {
  t.nPursued += 1
  for (const f of features) bump(t.pursued, f)
  if (area) bump(t.areaPursued, area, 1, AREA_CAP)
  t.updatedAt = new Date().toISOString()
  return t
}

// ── Learned model — lift per trait + readable insights ────────────────────────
export interface LearnedModel {
  nSeen:     number
  nPursued:  number
  lift:      Record<string, number>      // P(trait|pursued) / P(trait|seen), Laplace-smoothed
  insights:  string[]
  topAreas:  Array<{ area: string; rate: number; n: number }>
  ready:     boolean                     // enough data to influence ranking
}

const READY_MIN = 5

const LABELS: Record<string, (v: string) => string> = {
  stage:    (v) => `${v.replace(/_/g, " ").toLowerCase()} stage`,
  pred:     (v) => (v === "y" ? "predicted (pre-filing) leads" : "already-filed leads"),
  absentee: (v) => (v === "y" ? "absentee / out-of-area owners" : "owner-occupied"),
  vacant:   (v) => (v === "y" ? "vacant properties" : "occupied properties"),
  tax:      (v) => (v === "y" ? "tax-delinquent owners" : "tax-current owners"),
  liens:    (v) => (v === "y" ? "properties with junior liens" : "lien-free properties"),
  equity:   (v) => (v === "hi" ? "high equity (35%+)" : v === "mid" ? "mid equity (15–35%)" : "thin equity (<15%)"),
  score:    (v) => (v === "hi" ? "high-score (70+) leads" : v === "mid" ? "mid-score (45–70) leads" : "low-score leads"),
  value:    (v) => ({ u200k: "homes under $200k", "200_400k": "$200–400k homes", "400_700k": "$400–700k homes", o700k: "$700k+ homes" }[v] ?? v),
  type:     (v) => `${v} properties`,
}

function readable(feature: string): string {
  const [k, ...rest] = feature.split(":")
  const v = rest.join(":")
  return LABELS[k] ? LABELS[k](v) : feature
}

export function computeModel(t: Tally): LearnedModel {
  const lift: Record<string, number> = {}
  for (const f of Object.keys(t.pursued)) {
    const pPur  = (t.pursued[f] + 1) / (t.nPursued + 2)
    const pSeen = ((t.seen[f] ?? 0) + 1) / (t.nSeen + 2)
    lift[f] = pPur / pSeen
  }

  // Insights: traits you pursue notably more than baseline, with real support.
  const insights = Object.entries(lift)
    .filter(([f, l]) => l >= 1.3 && (t.pursued[f] ?? 0) >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([f, l]) => `${readable(f)} → ${l.toFixed(1)}× more likely you pursue`)

  const topAreas = Object.keys(t.areaPursued)
    .map((area) => ({ area, n: t.areaPursued[area], rate: t.areaPursued[area] / Math.max(1, t.areaSeen[area] ?? t.areaPursued[area]) }))
    .filter((a) => a.n >= 2)
    .sort((a, b) => b.rate - a.rate || b.n - a.n)
    .slice(0, 5)

  return { nSeen: t.nSeen, nPursued: t.nPursued, lift, insights, topAreas, ready: t.nPursued >= READY_MIN }
}

// Learned fit, 0–100. Blends the trait lifts (geometric mean via mean log-lift)
// into a score; until there's enough data it defers to the lead's base score so
// it never hurts ranking on day one.
export function adaptiveScore(lead: ForeclosureLead, model: LearnedModel | null): number {
  const base = lead.score ?? 0
  if (!model || !model.ready) return base

  const fs = featurize(lead)
  let sum = 0, k = 0
  for (const f of fs) { const l = model.lift[f]; if (l && l > 0) { sum += Math.log(l); k++ } }
  const meanLogLift = k ? sum / k : 0
  const learned = 50 + meanLogLift * 32            // lift 2× ≈ +22, lift 0.5× ≈ −22
  const blended = 0.65 * learned + 0.35 * base     // keep the base score grounded
  return Math.max(0, Math.min(100, Math.round(blended)))
}
