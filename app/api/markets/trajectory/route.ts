// GET /api/markets/trajectory?kind=stock&symbol=AAPL
//
// Historical score trajectory — the honest alternative to a projected price
// line. Shows what HAS happened to fundamentals, risk and forward indicators
// over time, which answers "is this getting better or worse" from accumulated
// data rather than guessing at a future price.

import { NextRequest } from "next/server"
import { isMarketsAuthorized } from "@/lib/markets-auth"
import { getTrajectory } from "@/lib/score-history"

export async function GET(request: NextRequest) {
  try {
    if (!(await isMarketsAuthorized(request))) {
      return Response.json({ error: "Unauthorized" }, { status: 401 })
    }
    const { searchParams } = new URL(request.url)
    const kind = searchParams.get("kind") === "crypto" ? "crypto" : "stock"
    const symbol = (searchParams.get("symbol") ?? "").toUpperCase()
    if (!symbol) return Response.json({ error: "symbol is required" }, { status: 400 })

    const points = await getTrajectory(kind, symbol, 60)
    return Response.json({ kind, symbol, points, total: points.length })
  } catch (err) {
    console.error("[markets/trajectory GET]", err)
    return Response.json({ error: "Failed to load trajectory" }, { status: 500 })
  }
}
