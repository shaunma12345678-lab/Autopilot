// GET /api/crypto/top-picks — confidence-gated screener, same rule as stocks:
// low/insufficient-confidence assets never appear here even with a high raw
// score, since that score isn't trustworthy yet. ?sort=marketCap gives the
// plain markets view (by rank) instead of the quality ranking.

import { NextRequest } from "next/server"
import { isMarketsAuthorized } from "@/lib/markets-auth"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  try {
    if (!(await isMarketsAuthorized(request))) {
      return Response.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const limit = Math.min(Number(searchParams.get("limit") ?? 25), 50)
    const sortByMarketCap = searchParams.get("sort") === "marketCap"
    // Optional ?signal=buy|hold|pass to screen by the action signal.
    const signalParam = searchParams.get("signal")
    const signal = ["buy", "hold", "pass"].includes(signalParam ?? "") ? signalParam : null

    const where = sortByMarketCap
      ? { marketCapRank: { not: null } }
      : {
          dataConfidence: { in: ["medium", "high"] },
          qualityScore: { not: null },
          ...(signal ? { actionSignal: signal } : {}),
        }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const assets = await (prisma.cryptoAsset as any).findMany({
      where,
      orderBy: sortByMarketCap ? { marketCapRank: "asc" } : { qualityScore: "desc" },
      take: limit,
    })

    return Response.json({ assets, total: assets.length })
  } catch (err) {
    console.error("[crypto/top-picks GET]", err)
    return Response.json({ error: "Failed to fetch top picks" }, { status: 500 })
  }
}
