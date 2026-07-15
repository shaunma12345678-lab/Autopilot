// Persistent self-building lead index. Records every lead signature we've ever
// surfaced (in our own DB via the generic AgentMemory store — no migration) so
// "new leads" is accurate forever and across devices. Returns which of the
// submitted signatures are genuinely NEW (never seen before), then records them.

export const maxDuration = 20

import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? ""   // no fallback: unset env disables admin access
const SLUG = "re-seen-index"
const KEY = "seen-leads"
const CAP = 12000

function isAuthorized(request: NextRequest, user: unknown): boolean {
  if (user) return true
  return ADMIN_PASSWORD.length > 0 && request.headers.get("x-admin-password") === ADMIN_PASSWORD
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!isAuthorized(request, user)) return Response.json({ error: "Unauthorized" }, { status: 401 })

  let body: { businessId?: string; signatures?: unknown; record?: boolean }
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }) }
  const businessId = body.businessId
  const signatures = Array.isArray(body.signatures) ? body.signatures.filter((s): s is string => typeof s === "string" && s.length > 3) : []
  if (!businessId) return Response.json({ error: "businessId required" }, { status: 400 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mem = prisma.agentMemory as any

  let seen: string[] = []
  try {
    const row = await mem.findFirst({ where: { businessId, agentSlug: SLUG, key: KEY } })
    if (row?.value) { const parsed = JSON.parse(row.value); if (Array.isArray(parsed)) seen = parsed }
  } catch { /* first run / store unavailable */ }

  const seenSet = new Set(seen)
  const fresh = signatures.filter((s) => !seenSet.has(s))

  if (body.record !== false && fresh.length) {
    const merged = [...seen, ...fresh].slice(-CAP)
    try {
      await mem.upsert({
        where:  { businessId, agentSlug: SLUG, key: KEY },
        create: { id: crypto.randomUUID(), businessId, agentSlug: SLUG, key: KEY, value: JSON.stringify(merged), updatedAt: new Date().toISOString() },
        update: { value: JSON.stringify(merged) },
      })
    } catch { /* best-effort; never fail the request */ }
  }

  return Response.json({ new: fresh, newCount: fresh.length, totalSeen: seen.length })
}
