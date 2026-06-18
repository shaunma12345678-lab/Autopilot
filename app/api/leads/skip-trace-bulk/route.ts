// Bulk skip trace — find owner names + phones/emails for MANY leads at once so a
// whole area can be personalized for outreach (named mail, callable/textable
// owners). Same proven chain as the single-lead route (owner-name discovery →
// premium skip trace if configured → our own web+AI tracer), run with bounded
// concurrency and per-lead timeouts. Best-effort: returns whatever it resolves
// in the time budget, never throws.

export const maxDuration = 300

import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { skipTrace, isSkipTraceConfigured } from "@/lib/skip-trace"
import { traceOwnerFromWeb } from "@/lib/own-skip-trace"
import { enrichPropertyFromWeb } from "@/lib/property-enrichment"
import { withConcurrency } from "@/lib/geo-tiles"

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "ap2026admin"
const MAX_LEADS  = 40   // per request — keeps us inside the serverless budget
const PER_LEAD_MS = 24_000

function isAuthorized(request: NextRequest, user: unknown): boolean {
  if (user) return true
  return request.headers.get("x-admin-password") === ADMIN_PASSWORD
}

interface InLead { attomId: number; address: string; city?: string; state?: string; zip?: string; ownerName?: string }

const withTimeout = <T,>(p: Promise<T>, ms: number, fallback: T): Promise<T> =>
  Promise.race([p, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))])

async function traceOne(p: InLead): Promise<{ attomId: number; patch: Record<string, unknown> } | null> {
  const patch: Record<string, unknown> = {}
  try {
    const base = { address: p.address, city: p.city ?? "", state: p.state ?? "", zip: p.zip ?? "" }
    let ownerName = p.ownerName ?? ""

    // 1) Resolve the owner's name first — tracing a named person hits far more
    //    often than tracing a bare address.
    if (!ownerName || /owner unknown|unknown/i.test(ownerName)) {
      const facts = await enrichPropertyFromWeb(base).catch(() => null)
      if (facts?.ownerName) { ownerName = facts.ownerName; patch.ownerName = facts.ownerName }
    }

    // 2) Contacts — premium if configured, else our own web+AI tracer (only
    //    keeps phones/emails that actually appear in the source text).
    const traceInput = { ...base, ownerName }
    let contact = isSkipTraceConfigured() ? await skipTrace(traceInput).catch(() => null) : null
    if (!contact) contact = await traceOwnerFromWeb(traceInput).catch(() => null)

    if (contact) {
      if (contact.phone)            patch.phone = contact.phone
      if (contact.email)            patch.email = contact.email
      if (contact.phones?.length)   patch.phones = contact.phones
      if (contact.emails?.length)   patch.emails = contact.emails
      if (contact.relatives?.length) patch.relatives = contact.relatives
      if (contact.confidence)       patch.contactConfidence = contact.confidence
    }
  } catch {
    /* best-effort per lead */
  }
  return Object.keys(patch).length ? { attomId: p.attomId, patch } : null
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!isAuthorized(request, user)) return Response.json({ error: "Unauthorized" }, { status: 401 })

  let body: { leads?: InLead[] }
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }) }

  const leads = (body.leads ?? [])
    .filter((l) => l && typeof l.attomId === "number" && typeof l.address === "string" && l.address.trim())
    .slice(0, MAX_LEADS)
  if (leads.length === 0) return Response.json({ results: [], traced: 0 })

  try {
    const settled = await withConcurrency(
      leads.map((l) => () => withTimeout(traceOne(l), PER_LEAD_MS, null)),
      6,
    )
    const results = settled.filter((r): r is { attomId: number; patch: Record<string, unknown> } => r !== null)
    return Response.json({ results, traced: results.length, requested: leads.length })
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Bulk skip trace failed" }, { status: 500 })
  }
}
