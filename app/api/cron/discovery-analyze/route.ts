// Stage 2 of discovery: take the highest-priority unprocessed discoveries and
// actually analyze those companies, pulling them into the tracked universe.
//
// Split from stage 1 because analysis is slow (multi-MB companyfacts fetch,
// price history, Form 4 parsing) while scanning is fast. Same two-stage shape
// the residential engine uses.
//
// Secured with CRON_SECRET so only Vercel's cron invoker can trigger it.

export const maxDuration = 300

import { NextRequest } from "next/server"
import { nextDiscoveriesToAnalyze, markDiscoveryProcessed } from "@/lib/edgar-discovery"
import { analyzeAndUpsertTicker } from "@/lib/stock-pipeline"

const CRON_SECRET = process.env.CRON_SECRET ?? ""
// Each company costs ~10s. Eight keeps the run well inside the timeout.
const BATCH_SIZE = 8

export async function GET(request: NextRequest) {
  if (!CRON_SECRET || request.headers.get("authorization") !== `Bearer ${CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }
  const startedAt = Date.now()
  try {
    const queue = await nextDiscoveriesToAnalyze(BATCH_SIZE)
    const results: Record<string, string> = {}

    for (const item of queue) {
      try {
        const r = await analyzeAndUpsertTicker(item.symbol)
        results[item.symbol] = r.ok ? "analyzed" : (r.error ?? "failed")
      } catch (err) {
        results[item.symbol] = err instanceof Error ? err.message : "error"
      }
      // Mark processed either way so a permanently unresolvable ticker can't
      // block the queue forever.
      await markDiscoveryProcessed(item.id)
    }

    return Response.json({ ok: true, processed: queue.length, results, duration: Date.now() - startedAt })
  } catch (err) {
    console.error("[cron/discovery-analyze]", err)
    return Response.json({ error: err instanceof Error ? err.message : "Analysis failed" }, { status: 500 })
  }
}
