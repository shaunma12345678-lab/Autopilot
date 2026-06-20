// 24/7 Market Analyzer — keeps every Top-20 / Upcoming market analyzed on a
// rotating schedule so the Markets section is always fresh and ranks by LIVE
// data. Each run deep-searches a few markets, scores them, and stores the
// reports. GET ?read=1 returns the cached reports for the client (no work).
//
// Auth: Vercel cron Bearer CRON_SECRET, or x-admin-password for a manual run.

export const maxDuration = 300

import { NextRequest } from "next/server"
import { runMarketAnalysis } from "@/lib/market-runner"
import { TOP_MARKETS, UPCOMING_MARKETS } from "@/lib/markets-data"
import { loadMarketCache, saveMarketCache, marketKey, type MarketEntry } from "@/lib/market-store"

const CRON_SECRET    = process.env.CRON_SECRET ?? ""
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "ap2026admin"
const BATCH = 4   // markets analyzed per run (rotating)

function authorized(request: NextRequest): boolean {
  const bearer = request.headers.get("authorization")
  if (CRON_SECRET && bearer === `Bearer ${CRON_SECRET}`) return true
  return request.headers.get("x-admin-password") === ADMIN_PASSWORD
}

const ALL = [...TOP_MARKETS, ...UPCOMING_MARKETS]

export async function GET(request: NextRequest) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const cache = await loadMarketCache()

  // Read mode — return what we have (for the client list).
  if (new URL(request.url).searchParams.get("read") === "1") {
    return Response.json({ reports: cache.reports, count: Object.keys(cache.reports).length })
  }

  // Work mode — analyze the next rotating batch.
  const start = cache.cursor % ALL.length
  const batch = Array.from({ length: Math.min(BATCH, ALL.length) }, (_, i) => ALL[(start + i) % ALL.length])
  let analyzed = 0

  for (const m of batch) {
    try {
      const r = await runMarketAnalysis(m.city, m.state, 250)
      if (r) {
        const entry: MarketEntry = { city: m.city, state: m.state, report: r.report, strat: r.strat, fundamentals: r.fundamentals, fundScore: r.fundScore, fundReasons: r.fundReasons, at: new Date().toISOString() }
        cache.reports[marketKey(m.city, m.state)] = entry
        analyzed++
      }
    } catch { /* skip this market */ }
  }

  cache.cursor = (start + batch.length) % ALL.length
  await saveMarketCache(cache)

  return Response.json({ ok: true, analyzed, nextCursor: cache.cursor, totalCached: Object.keys(cache.reports).length })
}
