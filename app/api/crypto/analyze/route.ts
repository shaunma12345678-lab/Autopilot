// POST /api/crypto/analyze — evaluate any coin on demand by symbol or name.
// Mirrors app/api/stocks/analyze: fetch fresh, score, upsert so the lookup
// permanently seeds the accumulated dataset.

// Raised from 30s: CoinGecko's free tier is throttled to one request every 2s
// on our side, and a single analysis makes four of them (search, market data,
// price history, BTC benchmark) before DefiLlama, GoPlus, GitHub and Binance
// are even queried. 60s is comfortably within every Vercel plan tier.
export const maxDuration = 60

import { NextRequest } from "next/server"
import { isMarketsAuthorized } from "@/lib/markets-auth"
import { analyzeAndUpsertCrypto } from "@/lib/crypto-pipeline"

export async function POST(request: NextRequest) {
  if (!(await isMarketsAuthorized(request))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { query?: string }
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }) }
  if (!body.query) return Response.json({ error: "query (symbol or coin name) is required" }, { status: 400 })

  try {
    const result = await analyzeAndUpsertCrypto(body.query)
    if (!result.ok) return Response.json({ error: result.error }, { status: 404 })
    return Response.json({ asset: result.asset })
  } catch (err) {
    console.error("[crypto/analyze POST]", err)
    return Response.json({ error: err instanceof Error ? err.message : "Analysis failed" }, { status: 500 })
  }
}
