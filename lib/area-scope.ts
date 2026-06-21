// Shared area-scoping for the deal finders. The CA-DOJ registry returns bare
// street addresses with no city/zip/county, so a city/county search can bleed
// into neighbors. We resolve each candidate's real city + ZIP + county via the
// Census geocoder and scope results to exactly what was searched. Keyless.

import { geocodeAddressComponents, type AddrComponents } from "@/lib/geocode"
import type { ForeclosureLead } from "@/lib/agents/foreclosure-agent"

export const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z ]/g, "").trim()
export const normCounty = (s: string | null | undefined) => norm(s).replace(/\s+county\s*$/, "").trim()

// Two place names refer to the same place (exact, or one fully contains the other).
export function samePlace(a: string, b: string): boolean {
  if (!a || !b) return false
  if (a === b) return true
  return a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a))
}

export interface HasLead { lead: ForeclosureLead }

// Resolve real city/ZIP/county for the items' leads (Census), bounded by a
// concurrency pool and a time budget. Fills lead.city/zip; returns components.
export async function resolveAreas<T extends HasLead>(items: T[], state: string, budgetMs = 16000): Promise<Map<T, AddrComponents>> {
  const out = new Map<T, AddrComponents>()
  let i = 0
  const worker = async () => {
    while (i < items.length) {
      const it = items[i++]
      const comp = await geocodeAddressComponents(it.lead.address, state).catch(() => null)
      if (comp) {
        out.set(it, comp)
        if (comp.city) it.lead.city = comp.city
        if (comp.zip && !it.lead.zip) it.lead.zip = comp.zip
      }
    }
  }
  await Promise.race([
    Promise.all(Array.from({ length: 8 }, worker)),
    new Promise<void>((r) => setTimeout(r, budgetMs)),
  ])
  return out
}

// Scope scored items (each with a `.lead`) to the searched city or county,
// dropping confirmed-wrong places and keeping unresolved ones. Returns the
// chosen list + how many were confirmed in-area + whether we fell back.
export function scopeToArea<T extends HasLead>(
  items: T[],
  areas: Map<T, AddrComponents>,
  searchType: "city" | "county" | "zip",
  city: string,
  county: string,
): { chosen: T[]; exactCount: number; fellBack: boolean } {
  if (searchType === "city" && norm(city)) {
    const t = norm(city)
    const inArea  = items.filter((it) => samePlace(norm(areas.get(it)?.city), t))
    const unknown = items.filter((it) => !norm(areas.get(it)?.city))
    const chosen = [...inArea, ...unknown]
    return chosen.length ? { chosen, exactCount: inArea.length, fellBack: false } : { chosen: items, exactCount: 0, fellBack: true }
  }
  if (searchType === "county" && normCounty(county)) {
    const t = normCounty(county)
    const inArea  = items.filter((it) => samePlace(normCounty(areas.get(it)?.county), t))
    const unknown = items.filter((it) => !normCounty(areas.get(it)?.county))
    const chosen = [...inArea, ...unknown]
    return chosen.length ? { chosen, exactCount: inArea.length, fellBack: false } : { chosen: items, exactCount: 0, fellBack: true }
  }
  return { chosen: items, exactCount: items.length, fellBack: false }
}
