// Owner-portfolio detection — everyone else hunts property-by-property; we hunt
// owner-by-owner. Owners with MULTIPLE distressed properties are motivated bulk
// sellers: skip-trace once, land several deals. Computed from the current
// results, no external data. Pure, null-safe.

import type { ForeclosureLead } from "@/lib/agents/foreclosure-agent"

export interface Portfolio {
  owner:       string
  count:       number
  leads:       ForeclosureLead[]
  totalValue:  number
  totalEquity: number
}

export function normOwner(name: string | null | undefined): string {
  const n = (name ?? "").trim().toLowerCase()
  if (!n || n.length < 4 || /owner unknown|unknown|^n\/a$|^—$|^na$/.test(n)) return ""
  return n.replace(/\s+/g, " ")
}

export function detectPortfolios(leads: ForeclosureLead[], min = 2): Portfolio[] {
  const groups = new Map<string, ForeclosureLead[]>()
  for (const l of leads) {
    const key = normOwner(l.ownerName)
    if (!key) continue
    const arr = groups.get(key) ?? []
    arr.push(l); groups.set(key, arr)
  }
  const out: Portfolio[] = []
  for (const ls of groups.values()) {
    if (ls.length < min) continue
    out.push({
      owner:       ls[0].ownerName,
      count:       ls.length,
      leads:       ls,
      totalValue:  ls.reduce((s, l) => s + (l.avmValue ?? l.estimatedValue ?? 0), 0),
      totalEquity: ls.reduce((s, l) => s + (l.estimatedEquity ?? 0), 0),
    })
  }
  return out.sort((a, b) => b.count - a.count)
}

// Set of normalized owner keys that hold a portfolio — for fast per-lead badges.
export function portfolioOwners(leads: ForeclosureLead[], min = 2): Set<string> {
  const counts = new Map<string, number>()
  for (const l of leads) { const k = normOwner(l.ownerName); if (k) counts.set(k, (counts.get(k) ?? 0) + 1) }
  const set = new Set<string>()
  for (const [k, c] of counts) if (c >= min) set.add(k)
  return set
}
