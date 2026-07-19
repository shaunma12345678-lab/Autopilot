// On-demand risk scan for one lead: geocode → FEMA flood zone (verified,
// keyless), metro price trend + landlord/STR law (our curated + Zillow layers),
// then the deterministic risk report. One call per click, never bulk-fired.

export const maxDuration = 60

import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import type { ForeclosureLead } from "@/lib/agents/foreclosure-agent"
import { riskReport, type RiskContext } from "@/lib/deal-risk"
import { geocodeAddressComponents } from "@/lib/geocode"
import { buildRentalIntel } from "@/lib/rental-intel"

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? ""   // no fallback: unset env disables admin access

function isAuthorized(request: NextRequest, user: unknown): boolean {
  if (user) return true
  return ADMIN_PASSWORD.length > 0 && request.headers.get("x-admin-password") === ADMIN_PASSWORD
}

// FEMA National Flood Hazard Layer — public ArcGIS service, point-in-polygon.
async function femaFloodZone(lat: number, lng: number): Promise<{ zone: string; subtype: string | null } | null> {
  try {
    const url = "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query" +
      `?where=1%3D1&geometry=${lng},${lat}&geometryType=esriGeometryPoint&inSR=4326` +
      "&spatialRel=esriSpatialRelIntersects&outFields=FLD_ZONE,ZONE_SUBTY&returnGeometry=false&f=json"
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const data = (await res.json()) as { features?: Array<{ attributes?: { FLD_ZONE?: string; ZONE_SUBTY?: string } }> }
    const a = data.features?.[0]?.attributes
    if (!a?.FLD_ZONE) return null
    return { zone: a.FLD_ZONE, subtype: a.ZONE_SUBTY ?? null }
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!isAuthorized(request, user)) return Response.json({ error: "Unauthorized" }, { status: 401 })

  let body: { lead?: ForeclosureLead }
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }) }
  const lead = body.lead
  if (!lead?.address) return Response.json({ error: "lead with address is required" }, { status: 400 })

  const ctx: RiskContext = {}
  const sources: string[] = []
  try {
    const [geo, intel] = await Promise.all([
      geocodeAddressComponents([lead.address, lead.city, lead.state, lead.zip].filter(Boolean).join(", "), lead.state).catch(() => null),
      lead.city && lead.state ? buildRentalIntel(lead.city, lead.state, null).catch(() => null) : Promise.resolve(null),
    ])

    if (geo?.lat != null && geo?.lng != null) {
      const flood = await femaFloodZone(geo.lat, geo.lng)
      if (flood) {
        ctx.floodZone = flood.zone
        ctx.floodSubtype = flood.subtype
        sources.push("FEMA NFHL")
      }
    }
    if (intel) {
      ctx.priceYoY = intel.priceYoY
      ctx.landlordGrade = intel.landlord?.grade ?? null
      ctx.evictionDays = intel.landlord?.evictionDays ?? null
      ctx.rentControl = intel.landlord?.rentControl ?? null
      ctx.strStatus = intel.strRule?.status ?? null
      ctx.strNote = intel.strRule?.note ?? null
      sources.push("market + law layers")
    }

    const report = riskReport(lead, ctx)
    return Response.json({ ...report, checked: sources, floodZone: ctx.floodZone ?? null })
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Risk scan failed" }, { status: 500 })
  }
}
