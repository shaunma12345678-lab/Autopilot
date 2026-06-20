// Fixer-Upper finder — searches an area for distressed-condition houses, comps
// the ARV with our own engine, and runs the explicit fix-&-flip MAO formula on
// each. Returns the best flips ranked by deal quality. Keyless; reuses the deep
// search + comp engine.

export const maxDuration = 120

import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { deepSearch, type DeepSearchParams } from "@/lib/deep-search-engine"
import { freeLeadToForeclosureLead } from "@/lib/foreclosure-lead-adapter"
import { fillComps } from "@/lib/comp-engine"
import { analyzeFixer } from "@/lib/fixer"

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "ap2026admin"

function isAuthorized(request: NextRequest, user: unknown): boolean {
  if (user) return true
  return request.headers.get("x-admin-password") === ADMIN_PASSWORD
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!isAuthorized(request, user)) return Response.json({ error: "Unauthorized" }, { status: 401 })

  let body: { city?: string; state?: string; zip?: string; depth?: number; condition?: boolean }
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }) }

  const city = (body.city ?? "").trim()
  const state = (body.state ?? "").trim()
  const zip = (body.zip ?? "").trim()
  if (!city && !zip) return Response.json({ error: "city or zip is required" }, { status: 400 })
  const depth = Math.min(Math.max(body.depth ?? 250, 50), 1000)

  try {
    const params: DeepSearchParams = zip
      ? { searchType: "zip", zipCode: zip, city, state, maxLeads: depth }
      : { searchType: "city", city, state, maxLeads: depth }
    const ds = await deepSearch(params).catch(() => null)
    const leads = ds ? fillComps(ds.leads.map(freeLeadToForeclosureLead)) : []

    let fixers = leads
      .map((l) => analyzeFixer(l))
      .filter((f): f is NonNullable<typeof f> => f !== null)
    // Optional strict mode: only properties with explicit condition signals.
    if (body.condition) fixers = fixers.filter((f) => f.conditionSignals.length > 0)

    fixers = fixers
      .sort((a, b) => b.fixerScore - a.fixerScore || b.deal.flipProfit - a.deal.flipProfit)
      .slice(0, 40)

    return Response.json({ fixers, total: leads.length, scanned: ds?.leads.length ?? 0 })
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Fixer search failed" }, { status: 500 })
  }
}
