// GET /api/stocks/top-picks — the screener: best-scoring tracked tickers,
// confidence-gated. This is what actually answers "what companies are good
// to invest in" — a low/insufficient-confidence score never appears here
// even if its raw number happens to be high, since it isn't trustworthy yet.

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
    const earlyWarningOnly = searchParams.get("earlyWarningOnly") === "true"
    // Optional ?signal=buy|hold|pass to screen by the action signal.
    const signalParam = searchParams.get("signal")
    const signal = ["buy", "hold", "pass"].includes(signalParam ?? "") ? signalParam : null

    const where = earlyWarningOnly
      ? { earlyWarning: true }
      : {
          dataConfidence: { in: ["medium", "high"] },
          qualityScore: { not: null },
          ...(signal ? { actionSignal: signal } : {}),
        }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tickers = await (prisma.ticker as any).findMany({
      where,
      orderBy: earlyWarningOnly ? { lastScoredAt: "desc" } : { qualityScore: "desc" },
      take: limit,
    })

    return Response.json({ tickers, total: tickers.length })
  } catch (err) {
    console.error("[stocks/top-picks GET]", err)
    return Response.json({ error: "Failed to fetch top picks" }, { status: 500 })
  }
}
