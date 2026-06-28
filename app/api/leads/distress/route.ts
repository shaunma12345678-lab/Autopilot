// Distress-vector connector endpoint — returns motivated-seller leads pulled
// straight from county/city open data (code violations, vacant registries, …)
// for a city, beyond foreclosure. Keyless. Part of the "owned index".

export const maxDuration = 60

import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { fetchDistressLeads, distressVectorsFor } from "@/lib/distress-sources"

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "ap2026admin"

function isAuthorized(request: NextRequest, user: unknown): boolean {
  if (user) return true
  return request.headers.get("x-admin-password") === ADMIN_PASSWORD
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!isAuthorized(request, user)) return Response.json({ error: "Unauthorized" }, { status: 401 })

  let body: { city?: string; state?: string; limit?: number }
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }) }
  const city = (body.city ?? "").trim(), state = (body.state ?? "").trim()
  if (!city || !state) return Response.json({ error: "city and state are required" }, { status: 400 })

  const vectors = distressVectorsFor(city, state)
  if (vectors.length === 0) {
    return Response.json({ leads: [], vectors: [], note: `No distress-data connector yet for ${city}, ${state}. (We add counties/cities one at a time.)` })
  }
  try {
    const leads = await fetchDistressLeads(city, state, Math.min(Math.max(body.limit ?? 200, 50), 500))
    return Response.json({ leads, count: leads.length, vectors })
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Distress fetch failed" }, { status: 500 })
  }
}
