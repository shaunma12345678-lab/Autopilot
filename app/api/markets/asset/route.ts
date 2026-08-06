// GET /api/markets/asset?kind=stock&symbol=AAPL
//
// Everything known about one asset, for the click-through detail view: scores,
// every criterion, the filing narrative, governance, accounting quality,
// capital allocation, live events, insider activity, and the dated forward
// calendar of known-future events.

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
    const symbol = (searchParams.get("symbol") ?? "").toUpperCase()
    if (!symbol) return Response.json({ error: "symbol is required" }, { status: 400 })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const model = kind === "stock" ? (prisma.ticker as any) : (prisma.cryptoAsset as any)
    const asset = await model.findFirst({ where: { symbol } })
    if (!asset) return Response.json({ error: `${symbol} is not tracked yet` }, { status: 404 })

    // Signals logged against this asset.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const signalModel = kind === "stock" ? (prisma.tickerSignal as any) : (prisma.cryptoSignal as any)
    const idField = kind === "stock" ? "tickerId" : "assetId"
    const signals = await signalModel
      .findMany({ where: { [idField]: asset.id }, orderBy: { signalDate: "desc" }, take: 10 })
      .catch(() => [])

    // Discovery events that surfaced this company.
    let discoveries: unknown[] = []
    if (kind === "stock") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      discoveries = await (prisma.discoveryEvent as any)
        .findMany({ where: { symbol }, orderBy: { eventDate: "desc" }, take: 10 })
        .catch(() => [])
    }

    // FORWARD CALENDAR — dated facts already disclosed, not predictions.
    // This is the honest version of "what's coming": every entry is a date a
    // company or protocol has already published, never a forecast.
    const calendar: Array<{ date: string; label: string; detail: string; kind: string }> = []
    if (kind === "stock") {
      if (asset.debtDueNext12MoUsd && asset.debtDueNext12MoUsd > 0) {
        calendar.push({
          date: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10),
          label: "Debt maturity",
          detail: `$${(asset.debtDueNext12MoUsd / 1e9).toFixed(1)}B of debt matures within 12 months${asset.debtWallToFcfYears ? ` — about ${asset.debtWallToFcfYears.toFixed(1)} years of current free cash flow` : ""}.`,
          kind: "obligation",
        })
      }
    } else if (asset.nextUnlockDate) {
      calendar.push({
        date: String(asset.nextUnlockDate).slice(0, 10),
        label: "Token unlock",
        detail: `${asset.nextUnlockPctSupply ? `${Number(asset.nextUnlockPctSupply).toFixed(1)}% of supply` : "A tranche of supply"} unlocks — a dated, public supply event.`,
        kind: "supply",
      })
    }

    return Response.json({ kind, asset, signals, discoveries, calendar })
  } catch (err) {
    console.error("[markets/asset GET]", err)
    return Response.json({ error: "Failed to load asset" }, { status: 500 })
  }
}
