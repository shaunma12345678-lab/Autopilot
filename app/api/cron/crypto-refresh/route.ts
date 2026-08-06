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
import { nextCryptoToEnrich } from "@/lib/crypto-universe"

const CRON_SECRET = process.env.CRON_SECRET ?? ""
// Raised sharply now that the aggregator is optional. Core market data comes
// from our own regulated-exchange engine (lib/exchange-aggregator.ts), which
// has no meaningful rate ceiling — CoinGecko's throttle was the entire reason
// this was 2. Enrichment still touches GoPlus/DefiLlama/GitHub per asset, so
// 12 keeps the run inside the 300s limit while clearing the backlog roughly
// six times faster.
const BATCH_SIZE = 12

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
    // Enrichment order: assets that have never been analyzed come first
    // (the bulk universe ingest creates them with market data only), then the
    // stalest. This is what promotes a bulk row from "low confidence" into the
    // ranked lists.
    let queriesToProcess = await nextCryptoToEnrich(BATCH_SIZE)

    // Fall back to the starter watchlist only when the universe is empty.
    if (queriesToProcess.length === 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const existing = await (prisma.cryptoAsset as any).findMany({ select: { coingeckoId: true } }) as { coingeckoId: string }[]
      const have = new Set(existing.map(a => a.coingeckoId))
      queriesToProcess = STARTER_COINS.filter(id => !have.has(id)).slice(0, BATCH_SIZE)
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
