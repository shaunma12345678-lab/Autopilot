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
import { analyzeFixer } from "@/lib/fixer"
import type { ForeclosureLead } from "@/lib/agents/foreclosure-agent"

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "ap2026admin"
const CITY_FLOOR = 6   // below this many exact-city flips, backfill with nearby

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
    const allLeads = ds ? fillComps(ds.leads.map(freeLeadToForeclosureLead)) : []

    // Area scoping — for a CITY search keep results in that city (the engine's
    // ZIP-3 region can include neighbors, e.g. Temple City ↔ El Monte). Backfill
    // with nearby only if the city itself is thin, and tag what's in-area.
    let leads: ForeclosureLead[] = allLeads
    const tCity = norm(city)
    let exactCount = allLeads.length
    let nearbyIncluded = false
    if (searchType === "city" && tCity) {
      const exact = allLeads.filter((l) => sameCity(norm(l.city), tCity))
      exactCount = exact.length
      if (exact.length >= CITY_FLOOR) {
        leads = exact
      } else {
        nearbyIncluded = allLeads.length > exact.length
        leads = [...exact, ...allLeads.filter((l) => !sameCity(norm(l.city), tCity))]
      }
    }

    const fixers = leads
      .map((l) => analyzeFixer(l))
      .filter((f): f is NonNullable<typeof f> => f !== null)
      .filter((f) => (body.condition ? f.conditionSignals.length > 0 : true))
      .sort((a, b) => b.fixerScore - a.fixerScore || b.deal.flipProfit - a.deal.flipProfit)
      .slice(0, 40)

    const area = searchType === "zip" ? `ZIP ${zip}` : searchType === "county" ? `${county} County${state ? `, ${state}` : ""}` : `${city}${state ? `, ${state}` : ""}`
    return Response.json({ fixers, total: leads.length, scanned: ds?.leads.length ?? 0, area, searchType, exactCount, nearbyIncluded })
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Fixer search failed" }, { status: 500 })
  }
}
