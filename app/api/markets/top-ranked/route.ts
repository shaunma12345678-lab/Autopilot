// GET /api/markets/top-ranked?kind=stock|crypto
//
// The definitive ranked list: best-scoring assets with the full reasoning
// attached, rather than a bare number. Confidence-gated — an asset that hasn't
// cleared the data bar never appears, however good its raw score looks.

import { NextRequest } from "next/server"
import { isMarketsAuthorized } from "@/lib/markets-auth"
import { prisma } from "@/lib/prisma"

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
    const rows = await model.findMany({
      where: { dataConfidence: { in: ["medium", "high"] }, qualityScore: { not: null } },
      orderBy: { qualityScore: "desc" },
      take: limit,
    })

    return Response.json({ kind, rows, total: rows.length })
  } catch (err) {
    console.error("[markets/top-ranked GET]", err)
    return Response.json({ error: "Failed to fetch rankings" }, { status: 500 })
  }
}
