// Cash Buyer Finder endpoint — finds the active investors/cash buyers in a
// county from public assessor data (owners of many properties), with mailing
// addresses. Keyless. Powers instant disposition — reach real buyers for a deal.

export const maxDuration = 60

import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { findCashBuyers, buyerCountySupported } from "@/lib/buyer-finder"

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "ap2026admin"

function isAuthorized(request: NextRequest, user: unknown): boolean {
  if (user) return true
  return request.headers.get("x-admin-password") === ADMIN_PASSWORD
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!isAuthorized(request, user)) return Response.json({ error: "Unauthorized" }, { status: 401 })

  let body: { county?: string; state?: string; limit?: number }
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }) }
  const county = (body.county ?? "").trim(), state = (body.state ?? "").trim()
  if (!county || !state) return Response.json({ error: "county and state are required" }, { status: 400 })

  if (!buyerCountySupported(county, state)) {
    return Response.json({ buyers: [], note: `No buyer-data connector yet for ${county} County, ${state}. (We add counties one at a time — Wayne County, MI is live.)` })
  }
  try {
    const buyers = await findCashBuyers(county, state, Math.min(Math.max(body.limit ?? 40, 10), 100))
    return Response.json({ buyers, count: buyers.length })
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Buyer search failed" }, { status: 500 })
  }
}
