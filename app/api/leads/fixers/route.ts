// Fixer-Upper finder — searches an area for distressed-condition houses, comps
// the ARV with our own engine, and runs the explicit fix-&-flip MAO formula on
// each. Three modes like the main deal search:
//   • city   — scoped to that exact city (won't bleed into neighbors)
//   • county — spans every place in the county
//   • zip    — a single ZIP
// Returns the best flips ranked by deal quality. Keyless; reuses deep search.

export const maxDuration = 120

import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { deepSearch, type DeepSearchParams } from "@/lib/deep-search-engine"
import { freeLeadToForeclosureLead } from "@/lib/foreclosure-lead-adapter"
import { fillComps } from "@/lib/comp-engine"
import { analyzeFixer, type FixerDeal } from "@/lib/fixer"
import { geocodeAddressComponents, type AddrComponents } from "@/lib/geocode"

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "ap2026admin"
const GEOCODE_CAP = 70   // resolve real city/zip for at most this many top candidates
const GEOCODE_BUDGET_MS = 16000

function isAuthorized(request: NextRequest, user: unknown): boolean {
  if (user) return true
  return request.headers.get("x-admin-password") === ADMIN_PASSWORD
}

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z ]/g, "").trim()
const normCounty = (s: string | null | undefined) => norm(s).replace(/\s+county\s*$/, "").trim()
// Two place names refer to the same place (exact, or one fully contains the other).
function samePlace(a: string, b: string): boolean {
  if (!a || !b) return false
  if (a === b) return true
  return a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a))
}

// Resolve each candidate's real city + ZIP + county from its bare address
// (Census), bounded by a concurrency pool and a hard time budget. Fills
// lead.city/zip and returns the resolved components per deal.
async function resolveAreas(items: FixerDeal[], state: string): Promise<Map<FixerDeal, AddrComponents>> {
  const out = new Map<FixerDeal, AddrComponents>()
  let i = 0
  const worker = async () => {
    while (i < items.length) {
      const f = items[i++]
      const comp = await geocodeAddressComponents(f.lead.address, state).catch(() => null)
      if (comp) {
        out.set(f, comp)
        if (comp.city) f.lead.city = comp.city
        if (comp.zip && !f.lead.zip) f.lead.zip = comp.zip
      }
    }
  }
  await Promise.race([
    Promise.all(Array.from({ length: 8 }, worker)),
    new Promise<void>((r) => setTimeout(r, GEOCODE_BUDGET_MS)),
  ])
  return out
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!isAuthorized(request, user)) return Response.json({ error: "Unauthorized" }, { status: 401 })

  let body: { searchType?: string; city?: string; state?: string; county?: string; zip?: string; depth?: number; condition?: boolean }
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }) }

  const searchType: "city" | "county" | "zip" =
    body.searchType === "county" ? "county" : body.searchType === "zip" ? "zip" : "city"
  const city   = (body.city ?? "").trim()
  const state  = (body.state ?? "").trim()
  const county = (body.county ?? "").trim()
  const zip    = (body.zip ?? "").trim()

  if (searchType === "zip" && !zip) return Response.json({ error: "ZIP is required" }, { status: 400 })
  if (searchType === "county" && !county) return Response.json({ error: "County is required" }, { status: 400 })
  if (searchType === "city" && !city) return Response.json({ error: "City is required" }, { status: 400 })
  const depth = Math.min(Math.max(body.depth ?? 250, 50), 1000)

  try {
    const params: DeepSearchParams =
      searchType === "zip"    ? { searchType: "zip", zipCode: zip, city, state, maxLeads: depth }
      : searchType === "county" ? { searchType: "county", county, state, maxLeads: depth }
      : { searchType: "city", city, state, maxLeads: depth }

    const ds = await deepSearch(params).catch(() => null)
    const leads = ds ? fillComps(ds.leads.map(freeLeadToForeclosureLead)) : []

    // Underwrite + rank all candidates.
    const scored = leads
      .map((l) => analyzeFixer(l))
      .filter((f): f is FixerDeal => f !== null)
      .filter((f) => (body.condition ? f.conditionSignals.length > 0 : true))
      .sort((a, b) => b.fixerScore - a.fixerScore || b.deal.flipProfit - a.deal.flipProfit)

    // Resolve real city/ZIP/county for the top candidates (CA-DOJ gives bare addresses).
    const head = scored.slice(0, GEOCODE_CAP)
    const areas = await resolveAreas(head, state)

    // Scope to the searched area — drop leads Census confirms are in a different
    // city (city mode) or a different county (county mode); keep can't-resolve
    // ones; only fall back to nearby if nothing in-area resolves.
    let chosen = head
    let exactCount = head.length
    let fellBack = false
    if (searchType === "city" && norm(city)) {
      const tCity = norm(city)
      const inArea  = head.filter((f) => samePlace(norm(areas.get(f)?.city), tCity))
      const unknown = head.filter((f) => !norm(areas.get(f)?.city))
      exactCount = inArea.length
      chosen = [...inArea, ...unknown]
      if (chosen.length === 0) { chosen = head; fellBack = true }
    } else if (searchType === "county" && normCounty(county)) {
      const tCounty = normCounty(county)
      const inArea  = head.filter((f) => samePlace(normCounty(areas.get(f)?.county), tCounty))
      const unknown = head.filter((f) => !normCounty(areas.get(f)?.county))
      exactCount = inArea.length
      chosen = [...inArea, ...unknown]
      if (chosen.length === 0) { chosen = head; fellBack = true }
    }

    const fixers = chosen.slice(0, 40)
    const area = searchType === "zip" ? `ZIP ${zip}` : searchType === "county" ? `${county} County${state ? `, ${state}` : ""}` : `${city}${state ? `, ${state}` : ""}`
    return Response.json({ fixers, total: scored.length, scanned: ds?.leads.length ?? 0, area, searchType, exactCount, shown: fixers.length, fellBack })
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Fixer search failed" }, { status: 500 })
  }
}
