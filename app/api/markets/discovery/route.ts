// GET /api/markets/discovery — the discovery feed: companies surfaced by
// event rather than by hand, newest and highest-priority first.

import { NextRequest } from "next/server"
import { isMarketsAuthorized } from "@/lib/markets-auth"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  try {
    if (!(await isMarketsAuthorized(request))) {
      return Response.json({ error: "Unauthorized" }, { status: 401 })
    }
    const { searchParams } = new URL(request.url)
    const limit = Math.min(Number(searchParams.get("limit") ?? 40), 100)
    const eventType = searchParams.get("eventType")

    const where: Record<string, unknown> = {}
    if (eventType) where.eventType = eventType

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const events = await (prisma.discoveryEvent as any).findMany({
      where,
      orderBy: { eventDate: "desc" },
      take: limit,
    }) as Array<{ symbol: string | null }>

    // Attach whatever analysis exists so the feed can show scores inline.
    const symbols = [...new Set(events.map(e => e.symbol).filter(Boolean))] as string[]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tickers = symbols.length > 0
      ? await (prisma.ticker as any).findMany({ where: { symbol: { in: symbols } } }) as Array<Record<string, unknown>>
      : []
    const bySymbol = new Map(tickers.map(t => [t.symbol as string, t]))

    const enriched = events.map(e => ({ ...e, analysis: e.symbol ? bySymbol.get(e.symbol) ?? null : null }))
    return Response.json({ events: enriched, total: enriched.length })
  } catch (err) {
    console.error("[markets/discovery GET]", err)
    return Response.json({ error: "Failed to fetch discovery feed" }, { status: 500 })
  }
}
