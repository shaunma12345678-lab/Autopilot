// GET /api/markets/discovery — the discovery feed: companies surfaced by
// event rather than by hand.
//
// Ranked by DECAYED priority, not by date. Ordering on recency alone let a
// routine material agreement filed today outrank a restatement from last week,
// which inverts the thing the feed exists to surface. Decay combines severity
// and freshness into one number, so a serious event stays on top until it has
// genuinely aged out.

import { NextRequest } from "next/server"
import { isMarketsAuthorized } from "@/lib/markets-auth"
import { prisma } from "@/lib/prisma"
import { decayedPriority, isStale, freshnessLabel, freshnessTone, decayProfileFor } from "@/lib/lead-decay"

export async function GET(request: NextRequest) {
  try {
    if (!(await isMarketsAuthorized(request))) {
      return Response.json({ error: "Unauthorized" }, { status: 401 })
    }
    const { searchParams } = new URL(request.url)
    const limit = Math.min(Number(searchParams.get("limit") ?? 40), 100)
    const eventType = searchParams.get("eventType")
    // Stale leads stay queryable — a company that restated two years ago is
    // still worth knowing about when you look at that company — but they are
    // not part of the current feed unless explicitly asked for.
    const includeStale = searchParams.get("includeStale") === "1"

    const where: Record<string, unknown> = {}
    if (eventType) where.eventType = eventType

    // Over-fetch, then rank on decay. The stored decayedPriority can lag the
    // last refresh, so ordering is recomputed here against real elapsed time.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await (prisma.discoveryEvent as any).findMany({
      where,
      orderBy: { eventDate: "desc" },
      take: Math.min(limit * 6, 400),
    }) as Array<{ symbol: string | null; priority: number; eventDate: string; eventType: string }>

    const now = new Date()
    const events = raw
      .map(e => {
        const decayed = decayedPriority(e.priority, e.eventDate, e.eventType, now)
        return {
          ...e,
          decayedPriority: decayed,
          freshness: freshnessLabel(e.eventDate, now),
          freshnessTone: freshnessTone(decayed, e.priority),
          halfLifeDays: decayProfileFor(e.eventType).halfLifeDays,
          stale: isStale(decayed),
        }
      })
      .filter(e => includeStale || !e.stale)
      .sort((a, b) => b.decayedPriority - a.decayedPriority)
      .slice(0, limit)

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
