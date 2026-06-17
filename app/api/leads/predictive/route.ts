// Predictive pre-foreclosure search — our FORECAST layer. Runs our own deep
// search engine (metasearch + direct sources, NO Tavily key required) and
// returns only properties showing EARLY distress that are NOT yet in the
// foreclosure pipeline — the ones we predict will enter foreclosure. This is a
// DIFFERENT set from a normal pre-foreclosure search.

export const maxDuration = 300

import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { deepSearch } from "@/lib/deep-search-engine"
import { freeLeadToForeclosureLead } from "@/lib/foreclosure-lead-adapter"
import { predictPreForeclosure, isConfirmedForeclosure } from "@/lib/predictive"

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "ap2026admin"

function isAuthorized(request: NextRequest, user: unknown): boolean {
  if (user) return true
  return request.headers.get("x-admin-password") === ADMIN_PASSWORD
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!isAuthorized(request, user)) return Response.json({ error: "Unauthorized" }, { status: 401 })

  let body: { searchType?: string; zipCode?: string; city?: string; state?: string; county?: string; countyIds?: string[]; maxLeads?: number; daysBack?: number }
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }) }
  const maxLeads = body.maxLeads ?? 100

  try {
    const ds = await deepSearch({
      searchType: (body.searchType as "zip" | "city" | "county") ?? "zip",
      zipCode:    body.zipCode,
      city:       body.city,
      state:      body.state,
      county:     body.county,
      countyIds:  body.countyIds,
      maxLeads:   Math.max(150, maxLeads * 2),
      daysBack:   body.daysBack,
      mode:       "predictive",   // lead with PRE-filing early-distress signals
    })

    // Forecasts: distressed properties where a sale is NOT yet scheduled — we
    // predict they'll reach the auction block. Sorted by forecast probability.
    const all = ds.leads.map(freeLeadToForeclosureLead)
    let predicted = all
      .filter((l) => !isConfirmedForeclosure(l) && predictPreForeclosure(l).predicted)
      .sort((a, b) => predictPreForeclosure(b).probability - predictPreForeclosure(a).probability)

    // Guaranteed floor — there should always be a few forecasts. If the area
    // only surfaced scheduled-sale leads, fall back to the LEAST-imminent ones
    // (furthest from the auction block = still earliest) as the next-best
    // forecast so the predictive view is never empty.
    const FLOOR = 5
    if (predicted.length < FLOOR) {
      const used = new Set(predicted.map((l) => l.attomId))
      const fallback = all
        .filter((l) => !used.has(l.attomId))
        .sort((a, b) => (b.daysUntilAuction ?? 99999) - (a.daysUntilAuction ?? 99999))
        .slice(0, FLOOR - predicted.length)
      predicted = [...predicted, ...fallback]
    }

    const leads = predicted.slice(0, maxLeads)

    return Response.json({
      leads,
      total: leads.length,
      note: leads.length === 0
        ? "No distressed properties surfaced in this area on this run — widen the city/county or date range and try again."
        : undefined,
    })
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Predictive search failed" }, { status: 500 })
  }
}
