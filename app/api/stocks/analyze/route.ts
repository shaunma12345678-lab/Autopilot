// POST /api/stocks/analyze — evaluate ANY SEC-registered ticker on demand,
// not just ones already tracked. Mirrors the app/api/leads/analyze-address
// pattern: fetch fresh, score, and upsert so the lookup permanently seeds
// the accumulated dataset (same "always find new ones" philosophy as the
// real estate search, triggered by user interest instead of a crawler).

// Raised from 30s: a single analysis now fans out to EDGAR submissions +
// companyfacts (multi-MB for large caps, behind a 120ms/req SEC throttle),
// full-text search, a quote, a full daily price history, the SPY benchmark,
// and a sector-peer query. 60s is comfortably within every Vercel plan tier.
// 300s (the Pro ceiling), not 120. This route runs the full deep analysis —
// governance, narrative, news and year-over-year risk-factor diffing — and the
// diff alone fetches two complete 10-K documents. At 120s it returned
// FUNCTION_INVOCATION_TIMEOUT and wrote nothing at all, which is the worst
// outcome: the user waits two minutes and the record is left unpopulated.
export const maxDuration = 300

import { NextRequest } from "next/server"
import { isMarketsAuthorized } from "@/lib/markets-auth"
import { analyzeAndUpsertTicker } from "@/lib/stock-pipeline"

export async function POST(request: NextRequest) {
  if (!(await isMarketsAuthorized(request))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { symbol?: string }
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }) }
  if (!body.symbol) return Response.json({ error: "symbol is required" }, { status: 400 })

  try {
    const result = await analyzeAndUpsertTicker(body.symbol, { includeNarrative: true, includeNews: true })
    if (!result.ok) return Response.json({ error: result.error }, { status: 404 })
    return Response.json({ ticker: result.ticker })
  } catch (err) {
    console.error("[stocks/analyze POST]", err)
    return Response.json({ error: err instanceof Error ? err.message : "Analysis failed" }, { status: 500 })
  }
}
