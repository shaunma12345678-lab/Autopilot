// GET /api/markets/hidden-gems — sound, cheap companies nobody is looking at.
//
// Distinct from the opportunity screen: obscurity is a REQUIREMENT here, not a
// side effect. Companies already held by concentrated institutional managers
// are excluded — if Baupost has found it, it is not hidden and the edge is
// priced. Surfaced names are recorded and suppressed for 21 days so the list
// rotates instead of becoming static.

export const maxDuration = 300

import { NextRequest } from "next/server"
import { isMarketsAuthorized } from "@/lib/markets-auth"
import { findHiddenGems } from "@/lib/hidden-gems"

export async function GET(request: NextRequest) {
  try {
    if (!(await isMarketsAuthorized(request))) {
      return Response.json({ error: "Unauthorized" }, { status: 401 })
    }
    const limit = Math.min(Number(new URL(request.url).searchParams.get("limit") ?? 10), 25)
    const result = await findHiddenGems(limit)
    return Response.json({
      ...result,
      note: "Ranked on obscurity x cheapness, one per sector, with names shown in the last 21 days suppressed. This is deliberately NOT the highest-scoring list available — it is the highest-scoring among companies still unexamined.",
    })
  } catch (err) {
    console.error("[markets/hidden-gems GET]", err)
    return Response.json({ error: "Failed to find hidden gems" }, { status: 500 })
  }
}
