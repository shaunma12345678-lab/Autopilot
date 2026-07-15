// Seller Finder — searches an area for the owners MOST LIKELY TO SELL soon,
// before they're on anyone's list. Fuses the likely-to-sell engine (life
// events, financial pressure, tenure, equity, rate lock-in) with the
// pre-foreclosure forecast, ranks by sell probability, and Census-scopes the
// results to the searched area. Modes: city, county, zip.

export const maxDuration = 120

import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { requirePlanFeature } from "@/lib/plan-gate"
import { deepSearch, type DeepSearchParams } from "@/lib/deep-search-engine"
import { freeLeadToForeclosureLead } from "@/lib/foreclosure-lead-adapter"
import { fillComps } from "@/lib/comp-engine"
import { predictLikelyToSell } from "@/lib/sell-predictor"
import { predictPreForeclosure } from "@/lib/predictive"
import { resolveAreas, scopeToArea } from "@/lib/area-scope"
import type { ForeclosureLead } from "@/lib/agents/foreclosure-agent"

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? ""   // no fallback: unset env disables admin access

function isAuthorized(request: NextRequest, user: unknown): boolean {
  if (user) return true
  return ADMIN_PASSWORD.length > 0 && request.headers.get("x-admin-password") === ADMIN_PASSWORD
}

export interface SellerHit {
  lead: ForeclosureLead
  sellScore: number
  band: string
  timeframe: string
  reasons: string[]
  predictedPct: number
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!isAuthorized(request, user)) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const gate = await requirePlanFeature(request, user, "seller-finder")
  if (!gate.ok) return gate.resp

  let body: { searchType?: string; city?: string; state?: string; county?: string; zip?: string; depth?: number; limit?: number }
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }) }

  const searchType: "city" | "county" | "zip" =
    body.searchType === "county" ? "county" : body.searchType === "zip" ? "zip" : "city"
  const city = (body.city ?? "").trim(), state = (body.state ?? "").trim()
  const county = (body.county ?? "").trim(), zip = (body.zip ?? "").trim()

  if (searchType === "zip" && !zip) return Response.json({ error: "ZIP is required" }, { status: 400 })
  if (searchType === "county" && !county) return Response.json({ error: "County is required" }, { status: 400 })
  if (searchType === "city" && !city) return Response.json({ error: "City is required" }, { status: 400 })
  const depth = Math.min(Math.max(body.depth ?? 250, 50), 1000)
  const limit = Math.min(Math.max(body.limit ?? 40, 10), 120)
  const geocodeCap = Math.min(limit + 40, 140)

  try {
    const params: DeepSearchParams =
      searchType === "zip"      ? { searchType: "zip", zipCode: zip, city, state, maxLeads: depth }
      : searchType === "county" ? { searchType: "county", county, state, maxLeads: depth }
      : { searchType: "city", city, state, maxLeads: depth }

    const ds = await deepSearch(params).catch(() => null)
    const leads = ds ? fillComps(ds.leads.map(freeLeadToForeclosureLead)) : []

    const scored: SellerHit[] = leads
      .map((lead) => {
        const sell = predictLikelyToSell(lead)
        const pred = predictPreForeclosure(lead)
        return {
          lead,
          sellScore: sell.score,
          band: sell.band,
          timeframe: sell.timeframe,
          reasons: sell.reasons,
          predictedPct: pred.predicted ? pred.probability : 0,
        }
      })
      .filter((s) => s.sellScore > 0)
      .sort((a, b) => b.sellScore - a.sellScore || b.predictedPct - a.predictedPct)

    const head = scored.slice(0, geocodeCap)
    const areas = await resolveAreas(head, state, 22000, 12)
    const { chosen, exactCount, fellBack } = scopeToArea(head, areas, searchType, city, county)

    return Response.json({
      sellers: chosen.slice(0, limit),
      total: scored.length,
      exactCount,
      fellBack,
      area: searchType === "zip" ? `ZIP ${zip}` : searchType === "county" ? `${county} County, ${state}` : `${city}, ${state}`,
    })
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Seller search failed" }, { status: 500 })
  }
}
