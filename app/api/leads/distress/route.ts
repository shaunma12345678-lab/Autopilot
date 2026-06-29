// Distress-vector endpoint — returns motivated-seller leads. Uses our own
// keyless open-data connectors (code violations, vacant registries, …) where a
// city has one, and ALWAYS falls back to the deep-search engine elsewhere so
// every search produces data. Part of the "owned index".

export const maxDuration = 120

import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { fetchDistressLeads, distressVectorsFor } from "@/lib/distress-sources"
import { deepSearch, type DeepSearchParams } from "@/lib/deep-search-engine"
import { freeLeadToForeclosureLead } from "@/lib/foreclosure-lead-adapter"
import { fillComps } from "@/lib/comp-engine"

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "ap2026admin"

function isAuthorized(request: NextRequest, user: unknown): boolean {
  if (user) return true
  return request.headers.get("x-admin-password") === ADMIN_PASSWORD
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!isAuthorized(request, user)) return Response.json({ error: "Unauthorized" }, { status: 401 })

  let body: { city?: string; state?: string; zip?: string; limit?: number }
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }) }
  const city = (body.city ?? "").trim(), state = (body.state ?? "").trim(), zip = (body.zip ?? "").trim()
  if (!state || (!city && !zip)) return Response.json({ error: "Provide a state plus a city or ZIP." }, { status: 400 })
  const limit = Math.min(Math.max(body.limit ?? 200, 50), 500)

  try {
    const vectors = distressVectorsFor(city, state, zip || undefined)

    // Dedicated open-data connector (Chicago, …) — our own index.
    if (vectors.length > 0) {
      const free = await fetchDistressLeads({ city, state, zip: zip || undefined, limit })
      const leads = fillComps(free.map(freeLeadToForeclosureLead))
      if (leads.length > 0) return Response.json({ leads, count: leads.length, vectors, source: "connector" })
    }

    // Fallback — the deep-search engine works ANYWHERE, so every search produces
    // data even where we don't have a dedicated connector yet.
    const params: DeepSearchParams = zip
      ? { searchType: "zip", zipCode: zip, state, maxLeads: limit }
      : { searchType: "city", city, state, maxLeads: limit }
    const ds = await deepSearch(params).catch(() => null)
    const leads = ds ? fillComps(ds.leads.map(freeLeadToForeclosureLead)) : []
    return Response.json({
      leads, count: leads.length,
      vectors: vectors.length > 0 ? vectors : ["Foreclosure & distress (deep search)"],
      source: "deep-search",
      note: leads.length === 0 ? `No distress data found for ${zip ? `ZIP ${zip}` : `${city}, ${state}`} right now — try a larger city or a different ZIP.` : undefined,
    })
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Distress search failed" }, { status: 500 })
  }
}
