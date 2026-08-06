// GET /api/markets/health — verifies every upstream data source still returns
// USABLE data, not merely a 200. See lib/data-health.ts for why each assertion
// exists; all three past silent breakages would have been caught here.

export const maxDuration = 120

import { NextRequest } from "next/server"
import { isMarketsAuthorized } from "@/lib/markets-auth"
import { runHealthChecks } from "@/lib/data-health"

export async function GET(request: NextRequest) {
  const isCron = process.env.CRON_SECRET
    && request.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`
  if (!isCron && !(await isMarketsAuthorized(request))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }
  const report = await runHealthChecks()
  return Response.json(report, { status: report.healthy ? 200 : 503 })
}
