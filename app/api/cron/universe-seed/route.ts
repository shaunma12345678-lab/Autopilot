// Seeds the tracked universe from SEC's registrant list, filtered to companies
// on exchanges with continuous listing standards. Creates stubs only — the
// stocks-refresh cron scores them over subsequent runs, since it orders by
// lastScoredAt ascending and unscored rows sort first.
//
// Secured with CRON_SECRET so only Vercel's cron invoker can trigger it.

export const maxDuration = 300

import { NextRequest } from "next/server"
import { seedUniverse } from "@/lib/universe-seed"

const CRON_SECRET = process.env.CRON_SECRET ?? ""

// Batched rather than all at once. Each create is a REST round trip through the
// Supabase shim, and the whole eligible set is several thousand rows.
const BATCH = 900

export async function GET(request: NextRequest) {
  if (!CRON_SECRET || request.headers.get("authorization") !== `Bearer ${CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }
  const startedAt = Date.now()
  try {
    const result = await seedUniverse(BATCH)
    return Response.json({ ok: true, ...result, duration: Date.now() - startedAt })
  } catch (err) {
    console.error("[cron/universe-seed]", err)
    return Response.json(
      { error: err instanceof Error ? err.message : "Universe seed failed" },
      { status: 500 }
    )
  }
}
