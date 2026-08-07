// GET /api/markets/cash-generators — companies converting profit into cash.
//
// Ranks on CONVERSION, not cash size: a large company generating large cash is
// not interesting; converting a high share of stated profit into cash is. Same
// rotation and one-per-sector discipline as hidden gems.

export const maxDuration = 120

import { NextRequest } from "next/server"
import { isMarketsAuthorized } from "@/lib/markets-auth"
import { findCashGenerators } from "@/lib/cash-generators"

export async function GET(request: NextRequest) {
  try {
    if (!(await isMarketsAuthorized(request))) {
      return Response.json({ error: "Unauthorized" }, { status: 401 })
    }
    const limit = Math.min(Number(new URL(request.url).searchParams.get("limit") ?? 10), 25)
    const result = await findCashGenerators(limit)
    return Response.json({
      ...result,
      note: "Ranked on how much stated profit becomes cash, not on cash size. Names shown in the last 21 days are suppressed so the list rotates.",
    })
  } catch (err) {
    console.error("[markets/cash-generators GET]", err)
    return Response.json({ error: "Failed to find cash generators" }, { status: 500 })
  }
}
