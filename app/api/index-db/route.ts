// The Property Index API. GET → live stats + verified coverage (the "own
// system" dashboard numbers). POST → query the index (city/zip, min potential)
// returning canonical records with field provenance and Potential breakdowns.

export const maxDuration = 30

import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { indexStats, queryIndex } from "@/lib/property-index"
import { PARCEL_COVERAGE } from "@/lib/parcel-enrich"
import { BUYER_COUNTIES } from "@/lib/buyer-finder"

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "ap2026admin"

function isAuthorized(request: NextRequest, user: unknown): boolean {
  if (user) return true
  return request.headers.get("x-admin-password") === ADMIN_PASSWORD
}

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!isAuthorized(request, user)) return Response.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const stats = await indexStats()
    return Response.json({
      stats,
      coverage: {
        parcels: PARCEL_COVERAGE,
        buyers: BUYER_COUNTIES,
        recorder: ["LA foreclosure registry (LAHD)", "LA vacant-building abatement", "LA code enforcement"],
      },
    })
  } catch {
    return Response.json({ stats: null, coverage: null })
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!isAuthorized(request, user)) return Response.json({ error: "Unauthorized" }, { status: 401 })

  let body: { city?: string; state?: string; zip?: string; minPotential?: number; limit?: number }
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }) }
  if (!body.city?.trim() && !body.zip?.trim()) return Response.json({ error: "city or zip is required" }, { status: 400 })

  try {
    const records = await queryIndex({
      city: body.city?.trim(),
      state: body.state?.trim(),
      zip: body.zip?.trim(),
      minPotential: typeof body.minPotential === "number" ? body.minPotential : undefined,
      limit: body.limit,
    })
    return Response.json({ records, count: records.length })
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Index query failed" }, { status: 500 })
  }
}
