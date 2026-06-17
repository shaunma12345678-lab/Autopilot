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
    })

    // Forecasts only: early distress, NOT already in the foreclosure pipeline.
    const leads = ds.leads
      .map(freeLeadToForeclosureLead)
      .filter((l) => !isConfirmedForeclosure(l) && predictPreForeclosure(l).predicted)
      .sort((a, b) => predictPreForeclosure(b).probability - predictPreForeclosure(a).probability)
      .slice(0, maxLeads)

    return Response.json({
      leads,
      total: leads.length,
      note: leads.length === 0
        ? "No predictive (pre-pipeline) leads in this area right now — these surface when properties show early distress (tax delinquency, probate, vacancy, code violations) before any foreclosure is filed. A free TAVILY_API_KEY widens the sources, but it isn't required."
        : undefined,
    })
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Predictive search failed" }, { status: 500 })
  }
}
