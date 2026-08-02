// Recurring backtest — checks matured stock underwrite calls (90 days old)
// against real price history and records whether the call was correct.
//
// Secured with CRON_SECRET so only Vercel's cron invoker can trigger it.

export const maxDuration = 60

import { NextRequest } from "next/server"
import { backtestMaturedStockCalls } from "@/lib/underwrite-tracker"

const CRON_SECRET = process.env.CRON_SECRET ?? ""

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const result = await backtestMaturedStockCalls()
    return Response.json({ ok: true, ...result })
  } catch (err) {
    console.error("[cron/underwrite-backtest]", err)
    return Response.json({ error: err instanceof Error ? err.message : "Backtest failed" }, { status: 500 })
  }
}
