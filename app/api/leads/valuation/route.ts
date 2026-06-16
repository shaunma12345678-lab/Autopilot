// On-demand live valuation. RentCast AVM when configured (most accurate), else
// our OWN free web+AI market estimate + comps — so the button always returns a
// value. One call per click; never auto-fired across a bulk search.

export const maxDuration = 30

import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { valuateProperty, isValuationConfigured } from "@/lib/property-valuation"
import { estimateValueFromWeb, modelValuation } from "@/lib/own-valuation"

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "ap2026admin"

function isAuthorized(request: NextRequest, user: unknown): boolean {
  if (user) return true
  return request.headers.get("x-admin-password") === ADMIN_PASSWORD
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!isAuthorized(request, user)) return Response.json({ error: "Unauthorized" }, { status: 401 })

  let body: { address?: string; city?: string; state?: string; zip?: string; estimatedValue?: number; sqft?: number }
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }) }
  if (!body.address) return Response.json({ error: "address is required" }, { status: 400 })

  const p = { address: body.address, city: body.city ?? "", state: body.state ?? "", zip: body.zip ?? "" }

  try {
    // 1) RentCast AVM when configured (most accurate).
    let valuation = isValuationConfigured() ? await valuateProperty(p).catch(() => null) : null
    const premium = Boolean(valuation)
    // 2) Our own free web+AI estimate + comps.
    if (!valuation) valuation = await estimateValueFromWeb(p).catch(() => null)
    // 3) Last resort: a model estimate from the value we already have, so the
    //    button always returns something (clearly labeled low-confidence).
    if (!valuation && (body.estimatedValue || body.sqft)) {
      valuation = modelValuation(body.estimatedValue ?? 0, body.sqft ?? null)
    }

    if (!valuation) {
      return Response.json({ configured: true, found: false, note: "Couldn't estimate a value — this lead has no address detail to work from yet. Try Enrich first, or add a TAVILY_API_KEY (free) for live web valuation." })
    }
    return Response.json({ configured: true, found: true, premium, valuation })
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Valuation failed" }, { status: 500 })
  }
}
