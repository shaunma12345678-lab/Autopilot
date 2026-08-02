// GET /api/stocks/[symbol] — read a tracked ticker's full detail + signal
// history from the DB. Read-only; does not hit EDGAR live (use
// POST /api/stocks/analyze for a fresh on-demand pull).

import { NextRequest } from "next/server"
import { isMarketsAuthorized } from "@/lib/markets-auth"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest, { params }: { params: Promise<{ symbol: string }> }) {
  try {
    if (!(await isMarketsAuthorized(request))) {
      return Response.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { symbol } = await params

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ticker = await (prisma.ticker as any).findFirst({ where: { symbol: symbol.toUpperCase() } })
    if (!ticker) return Response.json({ error: "Not tracked yet — try POST /api/stocks/analyze first" }, { status: 404 })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const signals = await (prisma.tickerSignal as any).findMany({
      where: { tickerId: ticker.id },
      orderBy: { signalDate: "desc" },
    })

    return Response.json({ ticker, signals })
  } catch (err) {
    console.error("[stocks/[symbol] GET]", err)
    return Response.json({ error: "Failed to fetch" }, { status: 500 })
  }
}
