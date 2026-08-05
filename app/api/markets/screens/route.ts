// GET /api/markets/screens?kind=stock|crypto           -> list available screens
// GET /api/markets/screens?kind=stock&id=future-growth -> run one screen
//
// Screens are defined in lib/market-screens.ts so the criteria text shown in
// the UI and the query that produces the rows can never drift apart.

import { NextRequest } from "next/server"
import { isMarketsAuthorized } from "@/lib/markets-auth"
import { prisma } from "@/lib/prisma"
import {
  STOCK_SCREENS, CRYPTO_SCREENS, findScreen,
  stockScreenWhere, stockScreenOrderBy,
  cryptoScreenWhere, cryptoScreenOrderBy,
} from "@/lib/market-screens"

export async function GET(request: NextRequest) {
  try {
    if (!(await isMarketsAuthorized(request))) {
      return Response.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const kind = searchParams.get("kind") === "crypto" ? "crypto" : "stock"
    const id = searchParams.get("id")
    const limit = Math.min(Number(searchParams.get("limit") ?? 25), 50)

    // No id: return the catalog so the UI can render the screen picker.
    if (!id) {
      return Response.json({ screens: kind === "stock" ? STOCK_SCREENS : CRYPTO_SCREENS })
    }

    const screen = findScreen(kind, id)
    if (!screen) return Response.json({ error: `Unknown screen "${id}"` }, { status: 404 })

    const where = kind === "stock" ? stockScreenWhere(id) : cryptoScreenWhere(id)
    if (!where) return Response.json({ error: `Screen "${id}" has no criteria defined` }, { status: 400 })

    const orderBy = kind === "stock" ? stockScreenOrderBy(id) : cryptoScreenOrderBy(id)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const model = kind === "stock" ? (prisma.ticker as any) : (prisma.cryptoAsset as any)
    const rows = await model.findMany({ where, orderBy, take: limit })

    return Response.json({ screen, rows, total: rows.length })
  } catch (err) {
    console.error("[markets/screens GET]", err)
    return Response.json({ error: "Failed to run screen" }, { status: 500 })
  }
}
