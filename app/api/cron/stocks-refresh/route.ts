// Recurring stock re-scoring — runs on Vercel Cron. Two jobs in one:
// 1. Onboard a starter watchlist so Top Picks isn't empty before any user
//    has looked anything up.
// 2. Steady-state: re-score the most stale tracked tickers first
//    (lastScoredAt ASC — self-balancing, no manual cursor to maintain).
// Small batch size on purpose — companyfacts payloads can run several MB and
// SEC caps requests at 10/sec.
//
// Secured with CRON_SECRET so only Vercel's cron invoker can trigger it.

export const maxDuration = 300

import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { analyzeAndUpsertTicker } from "@/lib/stock-pipeline"

const CRON_SECRET = process.env.CRON_SECRET ?? ""
// Sized against measured throughput, not guesswork. After the benchmark-cache
// and Form 4 fixes, a full analysis runs a verified ~12s median (p90 13.2s,
// max 14.0s across 80 companies). SEC's ceiling is 10 req/sec and we're far
// under it, so the binding constraint is the 300s function limit on Pro.
// 18 x ~13s leaves comfortable headroom, and cycles a 200-company universe
// roughly every 4 hours instead of every 22.
const BATCH_SIZE = 18

// A diversified starter set so the screener has something to rank from day
// one — real usage (on-demand lookups) grows the dataset from here.
const STARTER_TICKERS = [
  "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "JPM", "JNJ",
  "PG", "KO", "XOM", "WMT", "DIS", "V", "MA", "HD",
]

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const startedAt = new Date()

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing = await (prisma.ticker as any).findMany({ select: { symbol: true } }) as { symbol: string }[]
    const existingSymbols = new Set(existing.map(t => t.symbol))
    const missingStarters = STARTER_TICKERS.filter(s => !existingSymbols.has(s))

    let symbolsToProcess: string[]
    if (missingStarters.length > 0) {
      symbolsToProcess = missingStarters.slice(0, BATCH_SIZE)
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stale = await (prisma.ticker as any).findMany({
        orderBy: { lastScoredAt: "asc" },
        take: BATCH_SIZE,
        select: { symbol: true },
      }) as { symbol: string }[]
      symbolsToProcess = stale.map(t => t.symbol)
    }

    const results: Record<string, string> = {}
    for (const symbol of symbolsToProcess) {
      try {
        const r = await analyzeAndUpsertTicker(symbol)
        results[symbol] = r.ok ? "ok" : (r.error ?? "failed")
      } catch (err) {
        results[symbol] = err instanceof Error ? err.message : "failed"
      }
    }

    return Response.json({
      ok: true,
      processed: symbolsToProcess.length,
      results,
      duration: Date.now() - startedAt.getTime(),
    })
  } catch (err) {
    console.error("[cron/stocks-refresh]", err)
    return Response.json(
      { error: err instanceof Error ? err.message : "Stocks refresh failed" },
      { status: 500 }
    )
  }
}
