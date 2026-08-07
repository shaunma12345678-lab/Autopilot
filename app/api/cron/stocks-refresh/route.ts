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
// Raised and parallelised. Sequential 18-at-~13s already sat near the 300s
// ceiling, and the pipeline has since gained federal-contract, short-interest
// and market-percentile lookups, which pushed it over.
//
// Concurrency helps here specifically because SEC is NOT the bottleneck: the
// EDGAR client enforces a global 120ms floor, so parallel SEC calls simply
// queue on that shared throttle and stay inside the 10 req/sec limit. What runs
// concurrently is everything else — price history, USAspending, FINRA, frames —
// which is where most of the per-company wall time actually goes.
const BATCH_SIZE = 60
const CONCURRENCY = 4

// Hard stop before Vercel's 300s limit. Returning partial results that are
// already persisted beats a function kill that reports nothing — the same
// failure the deep-research cron hit at 290s.
const WALL_CLOCK_BUDGET_MS = 250_000

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
    // Query ONLY the starters, never the whole table. PostgREST caps an
    // unbounded select at 1,000 rows and returns the truncation silently, so
    // fetching every symbol to test 16 of them meant any starter outside that
    // arbitrary 1,000-row window looked missing.
    //
    // The consequence was severe and invisible: with 5,829 tickers stored, this
    // re-scored PG every 20 minutes and never once reached the 5,561 unscored
    // companies. Coverage sat at 268 while the cron reported success on every run.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing = await (prisma.ticker as any).findMany({
      where: { symbol: { in: STARTER_TICKERS } },
      select: { symbol: true },
      take: STARTER_TICKERS.length,
    }) as { symbol: string }[]
    const existingSymbols = new Set(existing.map(t => t.symbol))
    const missingStarters = STARTER_TICKERS.filter(s => !existingSymbols.has(s))

    let symbolsToProcess: string[]
    if (missingStarters.length > 0) {
      symbolsToProcess = missingStarters.slice(0, BATCH_SIZE)
    } else {
      // NEVER-SCORED COMPANIES FIRST, as an explicit query rather than by
      // ordering on nulls.
      //
      // `orderBy: { lastScoredAt: "asc" }` looks like it prioritises unscored
      // rows, and does the exact opposite: PostgREST follows Postgres and sorts
      // NULLS LAST on ascending, so the 5,556 never-scored companies sorted to
      // the very end and a batch of 60 never reached them. The cron re-scored
      // the same 273 companies indefinitely while reporting success on every
      // run, and coverage sat frozen at 4.7% of the universe.
      //
      // Asking for `lastScoredAt: null` directly cannot be misread and does not
      // depend on null-ordering semantics that differ between layers.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const unscored = await (prisma.ticker as any).findMany({
        where: { lastScoredAt: null },
        take: BATCH_SIZE,
        select: { symbol: true },
      }) as { symbol: string }[]

      symbolsToProcess = unscored.map(t => t.symbol)

      // Only once the whole universe has been scored once does this fall back
      // to refreshing the stalest rows, which is the correct steady state.
      if (symbolsToProcess.length < BATCH_SIZE) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const stale = await (prisma.ticker as any).findMany({
          where: { lastScoredAt: { not: null } },
          orderBy: { lastScoredAt: "asc" },
          take: BATCH_SIZE - symbolsToProcess.length,
          select: { symbol: true },
        }) as { symbol: string }[]
        symbolsToProcess = [...symbolsToProcess, ...stale.map(t => t.symbol)]
      }
    }

    const results: Record<string, string> = {}
    const queue = [...symbolsToProcess]
    let budgetExhausted = false

    // Fixed-size worker pool. Each worker pulls the next symbol, so a slow
    // company delays only its own worker rather than stalling a whole batch.
    const worker = async () => {
      for (;;) {
        if (Date.now() - startedAt.getTime() > WALL_CLOCK_BUDGET_MS) {
          budgetExhausted = true
          return
        }
        const symbol = queue.shift()
        if (!symbol) return
        try {
          const r = await analyzeAndUpsertTicker(symbol)
          results[symbol] = r.ok ? "ok" : (r.error ?? "failed")
        } catch (err) {
          results[symbol] = err instanceof Error ? err.message : "failed"
        }
      }
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, worker))

    return Response.json({
      ok: true,
      processed: Object.keys(results).length,
      deferred: queue.length,
      budgetExhausted,
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
