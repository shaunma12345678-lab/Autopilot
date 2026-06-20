// Persistent per-area lead cache (no migration — uses the generic AgentMemory
// KV store). Free public-record scrapers are flaky from datacenter IPs: one run
// returns 1600 leads, the next is rate-limited and returns 7. Caching every lead
// we've found for an area and merging it into each search means the count never
// collapses — and it ACCUMULATES across searches so the pool grows over time.
//
// Per-lead freshness keeps that accumulation honest: each lead carries a
// "last seen" timestamp; a lead not seen again within FRESH_DAYS is dropped, so
// stale deals (sold / cured / redeemed) age out instead of piling up. Bounded by
// PER_AREA_CAP, keeping the MOST-RECENTLY-seen leads. Best-effort throughout.

import { prisma } from "@/lib/prisma"
import type { FreeLead } from "@/lib/free-foreclosure-scraper"

const SLUG          = "re-area-cache"
const PER_AREA_CAP  = 1500             // max leads retained per area
const FRESH_DAYS    = 45               // drop a lead not re-seen within this window

export interface AreaKeyParts {
  searchType: string
  zipCode?:   string
  city?:      string
  county?:    string
  state?:     string
}

export function areaCacheKey(p: AreaKeyParts): string {
  const st = (p.state || "").toUpperCase().trim()
  if (p.searchType === "zip" && p.zipCode) return `zip:${p.zipCode.trim()}`
  if (p.searchType === "city" && p.city)   return `city:${p.city.toLowerCase().trim()}:${st}`
  if (p.county)                             return `county:${p.county.toLowerCase().replace(/\s+county\s*$/i, "").trim()}:${st}`
  if (p.zipCode)                            return `zip:${p.zipCode.trim()}`
  if (p.city)                               return `city:${p.city.toLowerCase().trim()}:${st}`
  return `area:${st || "unknown"}`
}

// Stable per-lead key (matches the engine's dedup key).
export function leadKey(l: { address?: string; city?: string }): string {
  return ((l.address ?? "") + (l.city ?? "")).toLowerCase().replace(/[\s,#.-]/g, "")
}

interface CacheShape { savedAt?: string; leads?: FreeLead[]; seenAt?: Record<string, string> }

let resolvedBizId: string | null | undefined
async function cacheBusinessId(hint?: string): Promise<string | null> {
  if (resolvedBizId) return resolvedBizId   // only memoize a REAL id — re-query while null
  let id: string | null = null
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const biz = prisma.business as any
    let row = hint ? await biz.findFirst({ where: { id: hint } }) : null
    if (!row) row = await biz.findFirst({ orderBy: { createdAt: "asc" } })
    id = row?.id ?? null
  } catch { id = null }
  if (id) resolvedBizId = id
  return id
}

async function loadRaw(businessId: string, key: string): Promise<CacheShape | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mem = prisma.agentMemory as any
    const row = await mem.findFirst({ where: { businessId, agentSlug: SLUG, key } })
    if (!row?.value) return null
    return JSON.parse(row.value) as CacheShape
  } catch {
    return null
  }
}

// Returns only leads still FRESH (re-seen within the window). Stale ones are
// excluded here, so they won't be re-saved and naturally expire.
export async function loadAreaCache(key: string, businessHint?: string): Promise<FreeLead[]> {
  try {
    const businessId = await cacheBusinessId(businessHint)
    if (!businessId) return []
    const parsed = await loadRaw(businessId, key)
    if (!parsed?.leads || !Array.isArray(parsed.leads)) return []
    const cutoff = Date.now() - FRESH_DAYS * 86_400_000
    const seenAt = parsed.seenAt ?? {}
    const fallback = parsed.savedAt ?? new Date().toISOString()
    return parsed.leads.filter((l) => {
      const ts = seenAt[leadKey(l)] ?? fallback
      return new Date(ts).getTime() >= cutoff
    })
  } catch {
    return []
  }
}

// Persist the merged pool with per-lead freshness. `freshKeys` are the leads
// seen on THIS run (their last-seen resets to now); everything else keeps its
// prior last-seen so it can age out. Keeps the most-recently-seen up to the cap.
export async function saveAreaCache(key: string, leads: FreeLead[], freshKeys: Set<string>, businessHint?: string): Promise<void> {
  if (leads.length === 0) return
  try {
    const businessId = await cacheBusinessId(businessHint)
    if (!businessId) return
    const prev = await loadRaw(businessId, key)
    const prevSeen = prev?.seenAt ?? {}
    const now = new Date().toISOString()

    const seenAt: Record<string, string> = {}
    const withTs = leads.map((l) => {
      const k = leadKey(l)
      const ts = freshKeys.has(k) ? now : (prevSeen[k] ?? now)
      seenAt[k] = ts
      return { l, ts }
    })
    // Keep the most-recently-seen leads up to the cap.
    withTs.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
    const kept = withTs.slice(0, PER_AREA_CAP)
    const keptSeenAt: Record<string, string> = {}
    for (const { l } of kept) keptSeenAt[leadKey(l)] = seenAt[leadKey(l)]

    const value = JSON.stringify({ savedAt: now, leads: kept.map((x) => x.l), seenAt: keptSeenAt })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mem = prisma.agentMemory as any
    await mem.upsert({
      where:  { businessId, agentSlug: SLUG, key },
      create: { id: crypto.randomUUID(), businessId, agentSlug: SLUG, key, value, updatedAt: now },
      update: { value, updatedAt: now },
    })
  } catch {
    /* best-effort — never fail the search */
  }
}
