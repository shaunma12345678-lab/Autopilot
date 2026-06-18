// Persistent per-area lead cache (no migration — uses the generic AgentMemory
// KV store). Free public-record scrapers are flaky from datacenter IPs: one run
// returns 1600 leads, the next is blocked and returns 7. Caching every lead we
// have ever found for an area and merging it into each search means the count
// never collapses — once we've surfaced leads for a place, they stay available.
//
// Keyed by (businessId, areaKey) so it's scoped per account and per searched
// area. Best-effort throughout: a cache miss or store error never fails search.

import { prisma } from "@/lib/prisma"
import type { FreeLead } from "@/lib/free-foreclosure-scraper"

const SLUG          = "re-area-cache"
const PER_AREA_CAP  = 600              // max leads retained per area
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

export async function loadAreaCache(businessId: string, key: string): Promise<FreeLead[]> {
  if (!businessId) return []
  try {
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

export async function saveAreaCache(businessId: string, key: string, leads: FreeLead[]): Promise<void> {
  if (!businessId || leads.length === 0) return
  try {
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
