// Outcome-Verified Predictions API. POST folds a batch of search results into
// the forecast ledger (predicted vs confirmed, hits measured with lead time).
// GET returns the verified accuracy stats. Uses the shared server-resolved
// business id (single-operator pattern, same as the learning engine) so the
// ledger compounds globally across devices and the daily cron.

export const maxDuration = 20

import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { resolveLearningBusinessId } from "@/lib/learning-store"
import { applyOutcomes, computeForecastStats, loadForecastLedger, saveForecastLedger, type OutcomeItem } from "@/lib/forecast-ledger"

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
    const bizId = await resolveLearningBusinessId()
    if (!bizId) return Response.json({ stats: null, note: "No business account yet." })
    const ledger = await loadForecastLedger(bizId)
    return Response.json({ stats: computeForecastStats(ledger) })
  } catch {
    return Response.json({ stats: null, note: "Ledger unavailable right now." })
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!isAuthorized(request, user)) return Response.json({ error: "Unauthorized" }, { status: 401 })

  let body: { items?: unknown }
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }) }
  const items: OutcomeItem[] = (Array.isArray(body.items) ? body.items : [])
    .filter((it): it is Record<string, unknown> => !!it && typeof it === "object")
    .map((it) => ({
      sig: typeof it.sig === "string" ? it.sig : "",
      addr: typeof it.addr === "string" ? it.addr.slice(0, 120) : "",
      predicted: it.predicted === true,
      probability: typeof it.probability === "number" ? Math.max(0, Math.min(100, it.probability)) : 0,
      confirmed: it.confirmed === true,
    }))
    .filter((it) => it.sig.length > 3)
    .slice(0, 1200)
  if (!items.length) return Response.json({ ok: true, recorded: 0 })

  try {
    const bizId = await resolveLearningBusinessId()
    if (!bizId) return Response.json({ ok: false, recorded: 0, note: "No business account yet." })
    const ledger = applyOutcomes(await loadForecastLedger(bizId), items)
    await saveForecastLedger(bizId, ledger)
    return Response.json({ ok: true, recorded: items.length, stats: computeForecastStats(ledger) })
  } catch {
    return Response.json({ ok: false, recorded: 0 }, { status: 200 })
  }
}
