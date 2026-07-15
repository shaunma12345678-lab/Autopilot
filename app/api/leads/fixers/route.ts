// Fixer-Upper finder — searches an area for distressed-condition houses, comps
// the ARV with our own engine, and runs the explicit fix-&-flip MAO formula on
// each. Modes: city (scoped to that exact city), county (spans its places), zip.

export const maxDuration = 120

import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { deepSearch, type DeepSearchParams } from "@/lib/deep-search-engine"
import { freeLeadToForeclosureLead } from "@/lib/foreclosure-lead-adapter"
import { fillComps } from "@/lib/comp-engine"
import { analyzeFixer, type FixerDeal } from "@/lib/fixer"
import { resolveAreas, scopeToArea } from "@/lib/area-scope"

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? ""   // no fallback: unset env disables admin access

function isAuthorized(request: NextRequest, user: unknown): boolean {
  if (user) return true
  return ADMIN_PASSWORD.length > 0 && request.headers.get("x-admin-password") === ADMIN_PASSWORD
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!isAuthorized(request, user)) return Response.json({ error: "Unauthorized" }, { status: 401 })

  let body: { searchType?: string; city?: string; state?: string; county?: string; zip?: string; depth?: number; condition?: boolean; limit?: number }
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }) }

  const searchType: "city" | "county" | "zip" =
    body.searchType === "county" ? "county" : body.searchType === "zip" ? "zip" : "city"
  const city = (body.city ?? "").trim(), state = (body.state ?? "").trim()
  const county = (body.county ?? "").trim(), zip = (body.zip ?? "").trim()

  if (searchType === "zip" && !zip) return Response.json({ error: "ZIP is required" }, { status: 400 })
  if (searchType === "county" && !county) return Response.json({ error: "County is required" }, { status: 400 })
  if (searchType === "city" && !city) return Response.json({ error: "City is required" }, { status: 400 })
  const depth = Math.min(Math.max(body.depth ?? 250, 50), 1000)
  const limit = Math.min(Math.max(body.limit ?? 60, 20), 200)
  // Geocode enough top candidates to still fill `limit` after dropping out-of-area ones.
  const geocodeCap = Math.min(limit + 50, 160)

  try {
    const params: DeepSearchParams =
      searchType === "zip"    ? { searchType: "zip", zipCode: zip, city, state, maxLeads: depth }
      : searchType === "county" ? { searchType: "county", county, state, maxLeads: depth }
      : { searchType: "city", city, state, maxLeads: depth }

    const ds = await deepSearch(params).catch(() => null)
    const leads = ds ? fillComps(ds.leads.map(freeLeadToForeclosureLead)) : []

    const scored = leads
      .map((l) => analyzeFixer(l))
      .filter((f): f is FixerDeal => f !== null)
      .filter((f) => (body.condition ? f.conditionSignals.length > 0 : true))
      .sort((a, b) => b.fixerScore - a.fixerScore || b.deal.flipProfit - a.deal.flipProfit)

    const head = scored.slice(0, geocodeCap)
    const areas = await resolveAreas(head, state, 22000, 12)
    const { chosen, exactCount, fellBack } = scopeToArea(head, areas, searchType, city, county)

    const fixers = chosen.slice(0, limit)
    const area = searchType === "zip" ? `ZIP ${zip}` : searchType === "county" ? `${county} County${state ? `, ${state}` : ""}` : `${city}${state ? `, ${state}` : ""}`
    return Response.json({ fixers, total: scored.length, scanned: ds?.leads.length ?? 0, area, searchType, exactCount, shown: fixers.length, fellBack })
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Fixer search failed" }, { status: 500 })
  }
}
