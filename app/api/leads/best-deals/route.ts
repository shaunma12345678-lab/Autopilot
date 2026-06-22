// Best Deals on the Market — scans an area and ranks every property by the
// unified elite Best-Deal score (margin + BRRRR + equity + motivation + hidden
// gem + signal fusion + predictive). Returns the very best deals first. Keyless;
// reuses the deep search + comp engine + Census area scoping.

export const maxDuration = 120

import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { deepSearch, type DeepSearchParams } from "@/lib/deep-search-engine"
import { freeLeadToForeclosureLead } from "@/lib/foreclosure-lead-adapter"
import { fillComps } from "@/lib/comp-engine"
import { rankBestDeals, type BestDeal } from "@/lib/best-deals"
import { resolveAreas, scopeToArea } from "@/lib/area-scope"
import { fetchFundamentals } from "@/lib/market-fundamentals"

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "ap2026admin"

function isAuthorized(request: NextRequest, user: unknown): boolean {
  if (user) return true
  return request.headers.get("x-admin-password") === ADMIN_PASSWORD
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!isAuthorized(request, user)) return Response.json({ error: "Unauthorized" }, { status: 401 })

  let body: { searchType?: string; city?: string; state?: string; county?: string; zip?: string; depth?: number; minScore?: number; limit?: number }
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }) }

  const searchType: "city" | "county" | "zip" =
    body.searchType === "county" ? "county" : body.searchType === "zip" ? "zip" : "city"
  const city = (body.city ?? "").trim(), state = (body.state ?? "").trim()
  const county = (body.county ?? "").trim(), zip = (body.zip ?? "").trim()

  if (searchType === "zip" && !zip) return Response.json({ error: "ZIP is required" }, { status: 400 })
  if (searchType === "county" && !county) return Response.json({ error: "County is required" }, { status: 400 })
  if (searchType === "city" && !city) return Response.json({ error: "City is required" }, { status: 400 })
  const depth = Math.min(Math.max(body.depth ?? 300, 50), 1000)
  const minScore = Math.min(Math.max(body.minScore ?? 0, 0), 100)
  const limit = Math.min(Math.max(body.limit ?? 60, 20), 200)
  const geocodeCap = Math.min(limit + 50, 160)

  try {
    const params: DeepSearchParams =
      searchType === "zip"    ? { searchType: "zip", zipCode: zip, city, state, maxLeads: depth }
      : searchType === "county" ? { searchType: "county", county, state, maxLeads: depth }
      : { searchType: "city", city, state, maxLeads: depth }

    // Pull deals + the area's real median home value (Census ACS) in parallel —
    // the median anchors thin bare-address leads to a ballpark ARV.
    const [ds, fund] = await Promise.all([
      deepSearch(params).catch(() => null),
      fetchFundamentals(city || county, state).catch(() => null),
    ])
    const leads = ds ? fillComps(ds.leads.map(freeLeadToForeclosureLead)) : []
    const fallbackValue = fund?.medianHomeValue ?? undefined

    const scored = rankBestDeals(leads, { fallbackValue }).filter((d) => d.score >= minScore)

    const head = scored.slice(0, geocodeCap)
    const areas = await resolveAreas(head, state, 22000, 12)
    const { chosen, exactCount, fellBack } = scopeToArea<BestDeal>(head, areas, searchType, city, county)

    const deals = chosen.slice(0, limit)
    const eliteCount = deals.filter((d) => d.tier === "elite").length
    const area = searchType === "zip" ? `ZIP ${zip}` : searchType === "county" ? `${county} County${state ? `, ${state}` : ""}` : `${city}${state ? `, ${state}` : ""}`
    return Response.json({ deals, total: scored.length, scanned: ds?.leads.length ?? 0, eliteCount, area, searchType, exactCount, shown: deals.length, fellBack, medianValue: fallbackValue ?? null })
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Best-deals search failed" }, { status: 500 })
  }
}
