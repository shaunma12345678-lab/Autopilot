// Recurring crypto re-scoring — mirrors app/api/cron/stocks-refresh: onboards
// a starter watchlist so the screener isn't empty on day one, then re-scores
// the most stale tracked assets first. Rate-limited conservatively against
// CoinGecko's free tier via the throttle in lib/coingecko-client.ts.
//
// Secured with CRON_SECRET so only Vercel's cron invoker can trigger it.

export const maxDuration = 300

import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { analyzeAndUpsertCrypto } from "@/lib/crypto-pipeline"

const CRON_SECRET = process.env.CRON_SECRET ?? ""
// Small on purpose: CoinGecko's free tier is throttled to one request every 2s
// on our side and each asset makes several, before GoPlus/DefiLlama/GitHub/
// Binance enrichment. Two per run stays well inside the function timeout.
const BATCH_SIZE = 2

const STARTER_COINS = [
  "bitcoin", "ethereum", "solana", "chainlink", "uniswap",
  "aave", "polygon", "avalanche-2", "cardano", "cosmos",
]

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const startedAt = new Date()

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing = await (prisma.cryptoAsset as any).findMany({ select: { coingeckoId: true } }) as { coingeckoId: string }[]
    const existingIds = new Set(existing.map(a => a.coingeckoId))
    const missingStarters = STARTER_COINS.filter(id => !existingIds.has(id))

    let queriesToProcess: string[]
    if (missingStarters.length > 0) {
      queriesToProcess = missingStarters.slice(0, BATCH_SIZE)
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stale = await (prisma.cryptoAsset as any).findMany({
        orderBy: { lastScoredAt: "asc" },
        take: BATCH_SIZE,
        select: { coingeckoId: true },
      }) as { coingeckoId: string }[]
      queriesToProcess = stale.map(a => a.coingeckoId)
    }

    const results: Record<string, string> = {}
    for (const query of queriesToProcess) {
      try {
        const r = await analyzeAndUpsertCrypto(query)
        results[query] = r.ok ? "ok" : (r.error ?? "failed")
      } catch (err) {
        results[query] = err instanceof Error ? err.message : "failed"
      }
    }

    return Response.json({
      ok: true,
      processed: queriesToProcess.length,
      results,
      duration: Date.now() - startedAt.getTime(),
    })
  } catch (err) {
    console.error("[cron/crypto-refresh]", err)
    return Response.json(
      { error: err instanceof Error ? err.message : "Crypto refresh failed" },
      { status: 500 }
    )
  }
}
