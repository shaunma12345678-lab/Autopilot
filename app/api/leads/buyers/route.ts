// Cash Buyer Intelligence endpoint. action "search" (default): the county's
// active buyers with every detail — portfolio, activity, buy-box, values,
// mailing, score. action "dossier": one buyer's full property list. action
// "contact": discover a phone/email with our own web tracer (anti-hallucination
// — only returns contacts that appear verbatim in sources). Keyless.

export const maxDuration = 90

import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { findCashBuyersArea, buyerDossier, buyerCountySupported, buyerStateSupported, BUYER_COUNTIES } from "@/lib/buyer-finder"
import { findWebBuyers } from "@/lib/web-buyer-finder"
import { traceOwnerFromWeb } from "@/lib/own-skip-trace"

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "ap2026admin"

function isAuthorized(request: NextRequest, user: unknown): boolean {
  if (user) return true
  return request.headers.get("x-admin-password") === ADMIN_PASSWORD
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!isAuthorized(request, user)) return Response.json({ error: "Unauthorized" }, { status: 401 })

  let body: { action?: string; county?: string; state?: string; city?: string; zip?: string; limit?: number; owner?: string; ownerRaw?: string; sampleAddress?: string; sampleCity?: string }
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }) }
  const county = (body.county ?? "").trim(), state = (body.state ?? "").trim()
  const city = (body.city ?? "").trim(), zip = (body.zip ?? "").replace(/[^0-9]/g, "").slice(0, 5)
  if (!state) return Response.json({ error: "state is required" }, { status: 400 })
  if (!county && !city && !zip && (body.action ?? "search") === "search") {
    return Response.json({ error: "Enter a county, city, or ZIP" }, { status: 400 })
  }

  try {
    switch (body.action ?? "search") {
      case "dossier": {
        // ownerRaw carries the county's exact stored spelling (padding included).
        const queryOwner = (body.ownerRaw ?? body.owner ?? "").trim()
        if (!queryOwner) return Response.json({ error: "owner is required" }, { status: 400 })
        const properties = await buyerDossier(county, state, body.ownerRaw ?? queryOwner)
        return Response.json({ properties, count: properties.length })
      }

      case "contact": {
        if (!body.owner?.trim()) return Response.json({ error: "owner is required" }, { status: 400 })
        const c = await traceOwnerFromWeb({
          address: (body.sampleAddress ?? "").trim(),
          city: (body.sampleCity ?? "").trim(),
          state,
          zip: "",
          ownerName: body.owner.trim(),
        }).catch(() => null)
        return Response.json({
          phone: c?.phone ?? null,
          email: c?.email ?? null,
          phones: c?.phones ?? [],
          emails: c?.emails ?? [],
          note: c?.phone || c?.email ? null : "No verifiable contact found on the public web — mail their taxpayer address instead (it's on the card).",
        })
      }

      default: {
        const supported = county ? buyerCountySupported(county, state) : buyerStateSupported(state)
        const areaLabel = zip ? `ZIP ${zip}` : city ? `${city}, ${state}` : `${county} County, ${state}`
        // Assessor records (verified holdings) + web discovery (buyers who
        // advertise) run in parallel — every city produces real buyers.
        const webCity = city || county || ""
        const [buyers, web] = await Promise.all([
          supported ? findCashBuyersArea({ state, county: county || undefined, city: city || undefined, zip: zip || undefined }, Math.min(Math.max(body.limit ?? 40, 10), 100)) : Promise.resolve([]),
          webCity ? findWebBuyers(webCity, state).catch(() => null) : Promise.resolve(null),
        ])
        const notes: string[] = []
        if (!supported) notes.push(`No assessor connector yet for ${county ? `${county} County, ` : ""}${state} (live: ${BUYER_COUNTIES.join(" · ")}) — showing buyers who advertise there instead.`)
        else if (buyers.length === 0) notes.push(`No multi-property owners found in ${areaLabel} — try the county view or a nearby ZIP.`)
        return Response.json({
          buyers, count: buyers.length,
          webBuyers: web?.buyers ?? [],
          webAt: web?.at ?? null,
          note: notes.join(" ") || undefined,
        })
      }
    }
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Buyer search failed" }, { status: 500 })
  }
}
