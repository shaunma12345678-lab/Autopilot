// On-demand live valuation — RentCast AVM + comparable sales + rent for one lead.
// Called from the lead row's "Live valuation" button. Quota-safe: one call per
// click, never auto-fired across a bulk search.

export const maxDuration = 20

import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { valuateProperty, isValuationConfigured } from "@/lib/property-valuation"

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "ap2026admin"

function isAuthorized(request: NextRequest, user: unknown): boolean {
  if (user) return true
  return request.headers.get("x-admin-password") === ADMIN_PASSWORD
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!isAuthorized(request, user)) return Response.json({ error: "Unauthorized" }, { status: 401 })

  if (!isValuationConfigured()) {
    return Response.json({
      configured: false,
      note: "Live valuation is not enabled. Add RENTCAST_API_KEY (free at rentcast.io) to unlock real AVM values, comps, and rent estimates.",
    })
  }

  let body: { address?: string; city?: string; state?: string; zip?: string }
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }) }

  if (!body.address) return Response.json({ error: "address is required" }, { status: 400 })

  try {
    const valuation = await valuateProperty({
      address: body.address,
      city:    body.city  ?? "",
      state:   body.state ?? "",
      zip:     body.zip   ?? "",
    })
    if (!valuation) {
      return Response.json({ configured: true, found: false, note: "No live valuation available for this address." })
    }
    return Response.json({ configured: true, found: true, valuation })
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Valuation failed" }, { status: 500 })
  }
}
