// On-demand skip trace — premium (BatchData) with a free public-records fallback.
// Called from the lead row's "Skip trace" button. One owner per click.

export const maxDuration = 20

import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { skipTrace, isSkipTraceConfigured } from "@/lib/skip-trace"
import { enrichLeadsWithContact } from "@/lib/contact-enrichment"

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "ap2026admin"

function isAuthorized(request: NextRequest, user: unknown): boolean {
  if (user) return true
  return request.headers.get("x-admin-password") === ADMIN_PASSWORD
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!isAuthorized(request, user)) return Response.json({ error: "Unauthorized" }, { status: 401 })

  let body: { address?: string; city?: string; state?: string; zip?: string; ownerName?: string }
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }) }

  if (!body.address) return Response.json({ error: "address is required" }, { status: 400 })
  const p = {
    address:   body.address,
    city:      body.city  ?? "",
    state:     body.state ?? "",
    zip:       body.zip   ?? "",
    ownerName: body.ownerName ?? "",
  }

  try {
    // 1) Premium skip trace (verified cell + email + relatives) when configured.
    if (isSkipTraceConfigured()) {
      const result = await skipTrace(p)
      if (result) return Response.json({ found: true, premium: true, contact: result })
    }

    // 2) Free public-records fallback (phone only, best-effort).
    const map = await enrichLeadsWithContact([
      { address: p.address, ownerName: p.ownerName || "Owner Unknown", city: p.city, state: p.state },
    ])
    const phone = map.get((p.address + p.city).toLowerCase().replace(/[\s,#.-]/g, "")) ?? null

    if (phone) {
      return Response.json({
        found: true, premium: false,
        contact: { phone, email: null, phones: [phone], emails: [], relatives: [], confidence: "low", source: "Public records" },
      })
    }

    return Response.json({
      found: false, premium: isSkipTraceConfigured(),
      note: isSkipTraceConfigured()
        ? "No contact found for this owner."
        : "No contact found. Add BATCHDATA_API_KEY for verified cell phones, emails & relatives.",
    })
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Skip trace failed" }, { status: 500 })
  }
}
