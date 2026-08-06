// GET /api/markets/opportunities — the opportunity screen.
//
// Ranked on valuation among companies that clear every soundness gate. This is
// deliberately NOT the quality ranking: see lib/opportunity-screen.ts for why
// ranking on quality reproduces a mega-cap list with no measured edge.

export const maxDuration = 60

import { NextRequest } from "next/server"
import { isMarketsAuthorized } from "@/lib/markets-auth"
import { runOpportunityScreen } from "@/lib/opportunity-screen"

export async function GET(request: NextRequest) {
  try {
    if (!(await isMarketsAuthorized(request))) {
      return Response.json({ error: "Unauthorized" }, { status: 401 })
    }
    const { searchParams } = new URL(request.url)
    const limit = Math.min(Number(searchParams.get("limit") ?? 25), 50)
    const result = await runOpportunityScreen(limit)
    return Response.json(result)
  } catch (err) {
    console.error("[markets/opportunities GET]", err)
    return Response.json({ error: "Failed to run opportunity screen" }, { status: 500 })
  }
}
