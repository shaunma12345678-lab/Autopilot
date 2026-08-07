// GET /api/markets/onchain — value paid per unit of real on-chain activity.
//
// Crypto has no EDGAR, but the ledger IS public: every transaction is recorded
// by the network rather than reported by the project. Market cap per daily
// transaction is a valuation ratio whose denominator cannot be manufactured by
// marketing or exchange wash trading.
//
// Compared only within chains built for the same job — ranking a settlement
// asset against a payments chain on throughput concludes Bitcoin is failing,
// which is a category error rather than a finding.

export const maxDuration = 120

import { NextRequest } from "next/server"
import { isMarketsAuthorized } from "@/lib/markets-auth"
import { compareOnChain } from "@/lib/onchain"

const DEFAULT_CHAINS = ["BTC", "ETH", "LTC", "DOGE", "BCH", "XLM", "DASH", "ADA", "XMR", "ZEC"]

export async function GET(request: NextRequest) {
  try {
    if (!(await isMarketsAuthorized(request))) {
      return Response.json({ error: "Unauthorized" }, { status: 401 })
    }
    const { searchParams } = new URL(request.url)
    const symbols = (searchParams.get("symbols")?.split(",").map(s => s.trim().toUpperCase()) ?? DEFAULT_CHAINS)
      .filter(Boolean)
      .slice(0, 15)

    const result = await compareOnChain(symbols)
    return Response.json({
      ...result,
      caveat: "Market value per daily transaction is comparable only between chains with the same purpose. A settlement asset processes fewer, larger transfers by design.",
    })
  } catch (err) {
    console.error("[markets/onchain GET]", err)
    return Response.json({ error: "Failed to read on-chain activity" }, { status: 500 })
  }
}
