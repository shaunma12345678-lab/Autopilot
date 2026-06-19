// Persistent per-area lead cache (no migration — uses the generic AgentMemory
// KV store). Free public-record scrapers are flaky from datacenter IPs: one run
// returns 1600 leads, the next is rate-limited and returns 7. Caching every lead
// we have ever found for an area and merging it into each search means the count
// never collapses — once we've surfaced leads for a place, they stay available.
//
// The cache is effectively GLOBAL per area: it resolves a real business id once
// (AgentMemory.businessId is a hard FK) and stores every area under it, keyed by
// areaKey. Foreclosure data isn't user-specific, so sharing it is correct and
// guarantees the cache works regardless of what the caller passes. Best-effort
// throughout: a cache miss or store error never fails a search.

import { prisma } from "@/lib/prisma"
import type { FreeLead } from "@/lib/free-foreclosure-scraper"

const SLUG          = "re-area-cache"
const PER_AREA_CAP  = 1500             // max leads retained per area (accumulates across searches)
const FRESH_DAYS    = 60               // ignore caches older than this

export interface AreaKeyParts {
  searchType: string
  zipCode?:   string
  city?:      string
  county?:    string
  state?:     string
}

// Stable signature for a searched area so the same place always hits the same
// cache row regardless of incidental param differences.
export function areaCacheKey(p: AreaKeyParts): string {
  const st = (p.state || "").toUpperCase().trim()
  if (p.searchType === "zip" && p.zipCode) return `zip:${p.zipCode.trim()}`
  if (p.searchType === "city" && p.city)   return `city:${p.city.toLowerCase().trim()}:${st}`
  if (p.county)                             return `county:${p.county.toLowerCase().replace(/\s+county\s*$/i, "").trim()}:${st}`
  if (p.zipCode)                            return `zip:${p.zipCode.trim()}`
  if (p.city)                               return `city:${p.city.toLowerCase().trim()}:${st}`
  return `area:${st || "unknown"}`
}

// Resolve a real business id to satisfy the AgentMemory FK. Cached per warm
// instance so we only hit the DB once. `null` ⇒ no business exists ⇒ cache off.
let resolvedBizId: string | null | undefined
async function cacheBusinessId(hint?: string): Promise<string | null> {
  if (resolvedBizId !== undefined) return resolvedBizId
  let id: string | null = null
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const biz = prisma.business as any
    // Prefer the caller's hint if it's a real row, else the first business.
    let row = hint ? await biz.findFirst({ where: { id: hint } }) : null
    if (!row) row = await biz.findFirst({ orderBy: { createdAt: "asc" } })
    id = row?.id ?? null
  } catch {
    id = null
  }
  resolvedBizId = id
  return id
}

export async function loadAreaCache(key: string, businessHint?: string): Promise<FreeLead[]> {
  try {
    const businessId = await cacheBusinessId(businessHint)
    if (!businessId) return []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mem = prisma.agentMemory as any
    const row = await mem.findFirst({ where: { businessId, agentSlug: SLUG, key } })
    if (!row?.value) return []
    const parsed = JSON.parse(row.value) as { savedAt?: string; leads?: FreeLead[] }
    if (!parsed?.leads || !Array.isArray(parsed.leads)) return []
    if (parsed.savedAt && Date.now() - new Date(parsed.savedAt).getTime() > FRESH_DAYS * 86_400_000) return []
    return parsed.leads
  } catch {
    return []
  }
}

export async function saveAreaCache(key: string, leads: FreeLead[], businessHint?: string): Promise<void> {
  if (leads.length === 0) return
  try {
    const businessId = await cacheBusinessId(businessHint)
    if (!businessId) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mem = prisma.agentMemory as any
    const value = JSON.stringify({ savedAt: new Date().toISOString(), leads: leads.slice(0, PER_AREA_CAP) })
    await mem.upsert({
      where:  { businessId, agentSlug: SLUG, key },
      create: { id: crypto.randomUUID(), businessId, agentSlug: SLUG, key, value, updatedAt: new Date().toISOString() },
      update: { value, updatedAt: new Date().toISOString() },
    })
  } catch {
    /* best-effort — never fail the search */
  }
}
