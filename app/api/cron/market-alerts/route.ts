// Emails material changes on companies the user was actually shown.
//
// The bar is deliberately high: an alert must describe something that changes a
// decision. Routine filings stay in the feed. See lib/market-alerts.ts for why
// alert fatigue, not coverage, is the constraint that governs this.
//
// Secured with CRON_SECRET so only Vercel's cron invoker can trigger it.

export const maxDuration = 120

import { NextRequest } from "next/server"
import { runAlertScan } from "@/lib/market-alerts"

const CRON_SECRET = process.env.CRON_SECRET ?? ""

export async function GET(request: NextRequest) {
  if (!CRON_SECRET || request.headers.get("authorization") !== `Bearer ${CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }
  const startedAt = Date.now()
  try {
    const to = process.env.ALERT_EMAIL ?? process.env.FROM_EMAIL ?? ""
    if (!to) {
      return Response.json({ ok: false, error: "No ALERT_EMAIL or FROM_EMAIL configured" }, { status: 200 })
    }
    const result = await runAlertScan(to)
    return Response.json({ ok: true, ...result, duration: Date.now() - startedAt })
  } catch (err) {
    console.error("[cron/market-alerts]", err)
    return Response.json({ error: err instanceof Error ? err.message : "Alert scan failed" }, { status: 500 })
  }
}
