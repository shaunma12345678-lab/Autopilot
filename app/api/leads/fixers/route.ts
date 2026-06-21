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
import { geocodeAddressComponents } from "@/lib/geocode"

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "ap2026admin"
const GEOCODE_CAP = 70   // resolve real city/zip for at most this many top candidates
const GEOCODE_BUDGET_MS = 16000

function isAuthorized(request: NextRequest, user: unknown): boolean {
  if (user) return true
  return request.headers.get("x-admin-password") === ADMIN_PASSWORD
}

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z ]/g, "").trim()
// Two place names refer to the same city (exact, or one fully contains the other).
function sameCity(a: string, b: string): boolean {
  if (!a || !b) return false
  if (a === b) return true
  return a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a))
}

// Resolve each candidate's real city + ZIP from its bare address (Census),
// bounded by a concurrency pool and a hard time budget. Fills lead.city/zip.
async function resolveCities(items: FixerDeal[], state: string): Promise<void> {
  let i = 0
  const worker = async () => {
    while (i < items.length) {
      const f = items[i++]
      if (f.lead.city) continue
      const comp = await geocodeAddressComponents(f.lead.address, state).catch(() => null)
      if (comp?.city) f.lead.city = comp.city
      if (comp?.zip && !f.lead.zip) f.lead.zip = comp.zip
    }
  }
  await Promise.race([
    Promise.all(Array.from({ length: 8 }, worker)),
    new Promise<void>((r) => setTimeout(r, GEOCODE_BUDGET_MS)),
  ])
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

    // Resolve real city/ZIP for the top candidates (CA-DOJ gives bare addresses).
    const head = scored.slice(0, GEOCODE_CAP)
    await resolveCities(head, state)

    // City mode — be specific to the searched city. Show confirmed-in-city plus
    // addresses we couldn't resolve (which may be in-city); DROP confirmed-wrong
    // neighbors (El Monte/Rosemead for Temple City). Only if nothing in-city
    // resolves do we fall back to nearby so the page isn't empty.
    let chosen = head
    const tCity = norm(city)
    let exactCount = head.length
    let fellBack = false
    if (searchType === "city" && tCity) {
      const inCity  = head.filter((f) => sameCity(norm(f.lead.city), tCity))
      const unknown = head.filter((f) => !norm(f.lead.city))
      exactCount = inCity.length
      chosen = [...inCity, ...unknown]
      if (chosen.length === 0) { chosen = head; fellBack = true }  // nothing in-city — show nearby
    }

    const fixers = chosen.slice(0, 40)
    const area = searchType === "zip" ? `ZIP ${zip}` : searchType === "county" ? `${county} County${state ? `, ${state}` : ""}` : `${city}${state ? `, ${state}` : ""}`
    return Response.json({ fixers, total: scored.length, scanned: ds?.leads.length ?? 0, area, searchType, exactCount, shown: fixers.length, fellBack })
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Fixer search failed" }, { status: 500 })
  }
}
