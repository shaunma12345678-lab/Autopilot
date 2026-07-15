// On-demand skip trace — premium (BatchData) with a free public-records fallback.
// Called from the lead row's "Skip trace" button. One owner per click.

export const maxDuration = 30

import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { skipTrace, isSkipTraceConfigured } from "@/lib/skip-trace"
import { traceOwnerFromWeb } from "@/lib/own-skip-trace"
import { enrichPropertyFromWeb } from "@/lib/property-enrichment"
import { enrichLeadsWithContact } from "@/lib/contact-enrichment"

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? ""   // no fallback: unset env disables admin access

function isAuthorized(request: NextRequest, user: unknown): boolean {
  if (user) return true
  return ADMIN_PASSWORD.length > 0 && request.headers.get("x-admin-password") === ADMIN_PASSWORD
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
    // 0) If we don't know the owner, find the name first — tracing a named
    //    person hits far more often than tracing a bare address.
    let discoveredOwner: string | null = null
    if (!p.ownerName || /owner unknown|unknown/i.test(p.ownerName)) {
      const facts = await enrichPropertyFromWeb(p).catch(() => null)
      if (facts?.ownerName) { p.ownerName = facts.ownerName; discoveredOwner = facts.ownerName }
    }

    // 1) Premium skip trace (verified cell + email + relatives) when configured.
    if (isSkipTraceConfigured()) {
      const result = await skipTrace(p)
      if (result) return Response.json({ found: true, premium: true, contact: result, ownerName: discoveredOwner })
    }

    // 2) Our OWN web+AI tracer — finds phone/email/relatives from public pages
    //    (only contacts that actually appear in the source text). No key needed.
    const web = await traceOwnerFromWeb(p).catch(() => null)
    if (web) return Response.json({ found: true, premium: false, contact: web, ownerName: discoveredOwner })

    // 3) Free public-records phone fallback (best-effort).
    const map = await enrichLeadsWithContact([
      { address: p.address, ownerName: p.ownerName || "Owner Unknown", city: p.city, state: p.state },
    ])
    const phone = map.get((p.address + p.city).toLowerCase().replace(/[\s,#.-]/g, "")) ?? null
    if (phone) {
      return Response.json({
        found: true, premium: false, ownerName: discoveredOwner,
        contact: { phone, email: null, phones: [phone], emails: [], relatives: [], confidence: "low", source: "Public records" },
      })
    }

    return Response.json({
      found: false, premium: isSkipTraceConfigured(), ownerName: discoveredOwner,
      note: discoveredOwner
        ? `Found owner "${discoveredOwner}" but no contact in public sources.`
        : isSkipTraceConfigured()
        ? "No contact found for this owner."
        : "No contact found in public sources. Add BATCHDATA_API_KEY for verified cell phones & emails.",
    })
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Skip trace failed" }, { status: 500 })
  }
}
