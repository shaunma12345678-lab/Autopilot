// GET /api/stocks/top-picks — the screener: best-scoring tracked tickers,
// confidence-gated. This is what actually answers "what companies are good
// to invest in" — a low/insufficient-confidence score never appears here
// even if its raw number happens to be high, since it isn't trustworthy yet.
//
// Confidence-gating alone isn't enough: a company can have high-confidence
// data and still be in bankruptcy distress, mid-restatement, or flagged for
// earnings manipulation — none of that lowers dataConfidence. Every row is
// also run through the same hard-fact disqualifiers the opportunity screen
// uses (lib/opportunity-screen.ts) before it can be called a "top" anything.

import { NextRequest } from "next/server"
import { isMarketsAuthorized } from "@/lib/markets-auth"
import { prisma } from "@/lib/prisma"
import { hasDisqualifyingRedFlag } from "@/lib/opportunity-screen"

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

    // Over-fetch when gating, since red-flagged rows get filtered out after
    // the query — a plain `take: limit` would silently under-fill the list
    // whenever a disqualified company would otherwise have ranked in range.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pool = await (prisma.ticker as any).findMany({
      where,
      orderBy: earlyWarningOnly ? { lastScoredAt: "desc" } : { qualityScore: "desc" },
      take: earlyWarningOnly ? limit : Math.min(limit * 6, 300),
    })

    // Early-warning is a risk feed, not a quality claim, so the gate doesn't
    // apply there — it exists specifically to surface companies with active
    // red flags.
    const tickers = earlyWarningOnly
      ? pool.slice(0, limit)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      : pool.filter((t: any) => hasDisqualifyingRedFlag(t) === null).slice(0, limit)

    return Response.json({ tickers, total: tickers.length })
  } catch (err) {
    console.error("[stocks/top-picks GET]", err)
    return Response.json({ error: "Failed to fetch top picks" }, { status: 500 })
  }
}
