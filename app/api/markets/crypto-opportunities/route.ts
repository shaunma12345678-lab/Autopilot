// GET /api/markets/crypto-opportunities — the crypto opportunity screen.
//
// Same relationship to /api/markets/top-ranked?kind=crypto as the stock
// opportunity screen has to its own top-ranked: quality/risk/security are
// gates, and survivors are ranked by price percentile vs. their own 1-year
// range rather than by raw quality score. See lib/crypto-opportunity-screen.ts
// for why this does NOT claim a validated edge the way the stock screen does.

export const maxDuration = 60

import { NextRequest } from "next/server"
import { isMarketsAuthorized } from "@/lib/markets-auth"
import { runCryptoOpportunityScreen } from "@/lib/crypto-opportunity-screen"

export async function GET(request: NextRequest) {
  try {
    if (!(await isMarketsAuthorized(request))) {
      return Response.json({ error: "Unauthorized" }, { status: 401 })
    }
    const { searchParams } = new URL(request.url)
    const limit = Math.min(Number(searchParams.get("limit") ?? 25), 50)
    const result = await runCryptoOpportunityScreen(limit)
    return Response.json(result)
  } catch (err) {
    console.error("[markets/crypto-opportunities GET]", err)
    return Response.json({ error: "Failed to run crypto opportunity screen" }, { status: 500 })
  }
}
