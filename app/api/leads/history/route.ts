// Temporal acceleration — tracks each property over time in our own DB (the
// AgentMemory store, no migration) and detects when its distress is STACKING
// FASTER (more independent signals / rising score across sightings). Properties
// that are accelerating are about to pop — predicting the TIMING, not just the
// deal. Compounds the more it runs. Guarded; never fails the request.

export const maxDuration = 20

import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? ""   // no fallback: unset env disables admin access
const SLUG = "re-history-index"
const KEY = "lead-history"
const CAP = 8000

function isAuthorized(request: NextRequest, user: unknown): boolean {
  if (user) return true
  return ADMIN_PASSWORD.length > 0 && request.headers.get("x-admin-password") === ADMIN_PASSWORD
}

// Per-property record: first/last seen, sighting count, first/latest signal
// count, first/latest score.
interface H { f: number; l: number; n: number; c0: number; c: number; s0: number; s: number }

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!isAuthorized(request, user)) return Response.json({ error: "Unauthorized" }, { status: 401 })

  let body: { businessId?: string; items?: unknown; record?: boolean }
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }) }
  const businessId = body.businessId
  if (!businessId) return Response.json({ error: "businessId required" }, { status: 400 })
  const items = Array.isArray(body.items) ? body.items as Array<{ signature?: string; signalCount?: number; score?: number }> : []
  const record = body.record !== false

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mem = prisma.agentMemory as any
  let store: Record<string, H> = {}
  try {
    const row = await mem.findFirst({ where: { businessId, agentSlug: SLUG, key: KEY } })
    if (row?.value) { const p = JSON.parse(row.value); if (p && typeof p === "object") store = p }
  } catch { /* first run */ }

  const now = Date.now()
  const results: Record<string, { firstSeen: number; days: number; sightings: number; signalDelta: number; scoreDelta: number; accelerating: boolean; velocity: number }> = {}

  for (const it of items) {
    const sig = typeof it.signature === "string" ? it.signature : ""
    if (!sig) continue
    const sc = Number(it.signalCount) || 0
    const score = Number(it.score) || 0
    let h = store[sig]
    if (h) {
      if (record) { h.l = now; h.n = (h.n || 1) + 1; h.c = sc; h.s = score }
    } else {
      h = { f: now, l: now, n: 1, c0: sc, c: sc, s0: score, s: score }
      if (record) store[sig] = h
    }
    const days = Math.max(0, Math.round((now - h.f) / 86_400_000))
    const curC = record ? h.c : sc
    const curS = record ? h.s : score
    const signalDelta = curC - h.c0
    const scoreDelta = curS - h.s0
    const sightings = h.n
    const accelerating = sightings >= 2 && (signalDelta >= 1 || scoreDelta >= 8)
    const velocity = days > 0 ? Math.round((signalDelta / days) * 30 * 10) / 10 : 0 // signals/month
    results[sig] = { firstSeen: h.f, days, sightings, signalDelta, scoreDelta, accelerating, velocity }
  }

  if (record && Object.keys(store).length) {
    let entries = Object.entries(store)
    if (entries.length > CAP) entries = entries.sort((a, b) => b[1].l - a[1].l).slice(0, CAP) // keep most recent
    const pruned = Object.fromEntries(entries)
    try {
      await mem.upsert({
        where:  { businessId, agentSlug: SLUG, key: KEY },
        create: { id: crypto.randomUUID(), businessId, agentSlug: SLUG, key: KEY, value: JSON.stringify(pruned), updatedAt: new Date().toISOString() },
        update: { value: JSON.stringify(pruned) },
      })
    } catch { /* best-effort */ }
  }

  return Response.json({ results })
}
