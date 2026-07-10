// Public forecast-accuracy stats — AGGREGATES ONLY (no addresses, no lead
// data). Powers the /proof page: verified hits, measured lead time, coverage,
// and calibration, straight from the outcome ledger. Cached briefly so the
// public page can't hammer the store.

export const maxDuration = 15

import { resolveLearningBusinessId } from "@/lib/learning-store"
import { computeForecastStats, loadForecastLedger } from "@/lib/forecast-ledger"

let cache: { at: number; body: Record<string, unknown> } | null = null
const TTL_MS = 5 * 60 * 1000

export async function GET() {
  if (cache && Date.now() - cache.at < TTL_MS) return Response.json(cache.body)
  try {
    const bizId = await resolveLearningBusinessId()
    if (!bizId) return Response.json({ stats: null })
    const s = computeForecastStats(await loadForecastLedger(bizId))
    const body = {
      stats: {
        since: s.since,
        verified: s.verified,
        pending: s.pending,
        watched: s.watched,
        coveragePct: s.coveragePct,
        avgLeadDays: s.avgLeadDays,
        medianLeadDays: s.medianLeadDays,
        bands: s.bands,
      },
    }
    cache = { at: Date.now(), body }
    return Response.json(body)
  } catch {
    return Response.json({ stats: null })
  }
}
