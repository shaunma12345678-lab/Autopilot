// Distress-vector connector endpoint — returns motivated-seller leads pulled
// straight from county/city open data (code violations, vacant registries, …)
// for a city, beyond foreclosure. Keyless. Part of the "owned index".

export const maxDuration = 60

import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { fetchDistressLeads, distressVectorsFor } from "@/lib/distress-sources"
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

  const vectors = distressVectorsFor(city, state, zip || undefined)
  const where = zip ? `ZIP ${zip}` : `${city}, ${state}`
  if (vectors.length === 0) {
    return Response.json({ leads: [], vectors: [], note: `No distress-data connector yet for ${where}. (We add cities/counties one at a time — Chicago, IL is live.)` })
  }
  try {
    const free = await fetchDistressLeads({ city, state, zip: zip || undefined, limit: Math.min(Math.max(body.limit ?? 200, 50), 500) })
    const leads = fillComps(free.map(freeLeadToForeclosureLead))
    return Response.json({ leads, count: leads.length, vectors })
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Distress fetch failed" }, { status: 500 })
  }
}
