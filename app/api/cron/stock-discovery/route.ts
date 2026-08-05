// Stage 1 of discovery: scan EDGAR for signal-bearing filings across all
// ~10,400 registrants and record cheap event rows. Deliberately fast — no
// per-company analysis happens here, mirroring how the residential pipeline
// separates RawSignal capture from processSignals.
//
// Secured with CRON_SECRET so only Vercel's cron invoker can trigger it.

export const maxDuration = 300

import { NextRequest } from "next/server"
import { runDiscovery } from "@/lib/edgar-discovery"

const CRON_SECRET = process.env.CRON_SECRET ?? ""

export async function GET(request: NextRequest) {
  if (!CRON_SECRET || request.headers.get("authorization") !== `Bearer ${CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }
  const startedAt = Date.now()
  try {
    const result = await runDiscovery({ lookbackDays: 14, perFormLimit: 60 })
    return Response.json({ ok: true, ...result, duration: Date.now() - startedAt })
  } catch (err) {
    console.error("[cron/stock-discovery]", err)
    return Response.json({ error: err instanceof Error ? err.message : "Discovery failed" }, { status: 500 })
  }
}
