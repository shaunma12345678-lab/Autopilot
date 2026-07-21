// The whole finance picture in one GET: briefing, cash, burn, months,
// categories, anomalies, subscriptions, accounts.

export const maxDuration = 60

import { NextRequest } from "next/server"
import { financeAuth } from "../_shared"
import { bizId, buildSummary } from "@/lib/finance/store"

export async function GET(request: NextRequest) {
  if (!(await financeAuth(request))) return Response.json({ error: "Unauthorized" }, { status: 401 })
  try {
    const businessId = await bizId()
    if (!businessId) return Response.json({ error: "No business context" }, { status: 500 })
    return Response.json(await buildSummary(businessId))
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Summary failed" }, { status: 500 })
  }
}
