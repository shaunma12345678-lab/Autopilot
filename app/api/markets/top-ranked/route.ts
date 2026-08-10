// GET /api/markets/top-ranked?kind=stock|crypto
//
// The definitive ranked list: best-scoring assets with the full reasoning
// attached, rather than a bare number. Confidence-gated — an asset that hasn't
// cleared the data bar never appears, however good its raw score looks.
//
// Both kinds are additionally run through the same hard-fact disqualifiers as
// their respective opportunity screens (lib/opportunity-screen.ts,
// lib/crypto-opportunity-screen.ts) — high-confidence data does not mean
// clean data, and a company mid-restatement (or a token flagged as a
// honeypot) should never rank as "top" regardless of its raw quality score.

import { NextRequest } from "next/server"
import { isMarketsAuthorized } from "@/lib/markets-auth"
import { prisma } from "@/lib/prisma"
import { hasDisqualifyingRedFlag } from "@/lib/opportunity-screen"
import { hasCryptoDisqualifyingRedFlag } from "@/lib/crypto-opportunity-screen"

export async function GET(request: NextRequest) {
  try {
    if (!(await isMarketsAuthorized(request))) {
      return Response.json({ error: "Unauthorized" }, { status: 401 })
    }
    const { searchParams } = new URL(request.url)
    const kind = searchParams.get("kind") === "crypto" ? "crypto" : "stock"
    const limit = Math.min(Number(searchParams.get("limit") ?? 15), 50)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const model = kind === "stock" ? (prisma.ticker as any) : (prisma.cryptoAsset as any)
    const pool = await model.findMany({
      where: { dataConfidence: { in: ["medium", "high"] }, qualityScore: { not: null } },
      orderBy: { qualityScore: "desc" },
      take: Math.min(limit * 6, 300),
    })

    const rows = kind === "stock"
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? pool.filter((t: any) => hasDisqualifyingRedFlag(t) === null).slice(0, limit)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      : pool.filter((t: any) => hasCryptoDisqualifyingRedFlag(t) === null).slice(0, limit)

    return Response.json({ kind, rows, total: rows.length })
  } catch (err) {
    console.error("[markets/top-ranked GET]", err)
    return Response.json({ error: "Failed to fetch rankings" }, { status: 500 })
  }
}
