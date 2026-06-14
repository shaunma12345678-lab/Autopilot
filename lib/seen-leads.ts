// #2 New-lead tracking — remembers which leads you've already seen so a "New"
// filter can highlight only fresh inventory across searches. Client-only,
// address-based signature (stable even when ids are regenerated), null-safe.

import type { ForeclosureLead } from "@/lib/agents/foreclosure-agent"

const KEY = "ap_seen_leads_v1"
const CAP = 6000 // keep the most recent N signatures

export function leadSignature(lead: { address?: string | null; zip?: string | null }): string {
  const a = (lead.address ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")
  const z = String(lead.zip ?? "").slice(0, 5)
  return `${a}|${z}`
}

export function loadSeen(): Set<string> {
  if (typeof window === "undefined") return new Set()
  try {
    const raw = window.localStorage.getItem(KEY)
    const arr = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(arr) ? arr : [])
  } catch { return new Set() }
}

// Merge new signatures in, capped to the most recent CAP entries.
export function addSeen(signatures: string[]): void {
  if (typeof window === "undefined" || !signatures.length) return
  try {
    const existing: string[] = (() => { const r = window.localStorage.getItem(KEY); const a = r ? JSON.parse(r) : []; return Array.isArray(a) ? a : [] })()
    const merged = existing.filter((s) => !signatures.includes(s)).concat(signatures)
    const capped = merged.length > CAP ? merged.slice(merged.length - CAP) : merged
    window.localStorage.setItem(KEY, JSON.stringify(capped))
  } catch { /* quota */ }
}

// attomIds of leads whose signature has NOT been seen before.
export function newLeadIds(leads: ForeclosureLead[], seen: Set<string>): Set<number> {
  const out = new Set<number>()
  for (const l of leads) if (!seen.has(leadSignature(l))) out.add(l.attomId)
  return out
}
