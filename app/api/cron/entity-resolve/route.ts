// Recurring portfolio-entity resolution — runs on Vercel Cron. Re-scans
// accumulated RawSignal owner names and groups them into Entity/EntityProperty
// rows. Idempotent (safe to re-run — existing aliases/properties are skipped).
//
// Secured with CRON_SECRET so only Vercel's cron invoker can trigger it.

export const maxDuration = 120

import { NextRequest } from "next/server"
import { resolveEntities } from "@/lib/entity-resolution"

const CRON_SECRET = process.env.CRON_SECRET ?? ""

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const startedAt = new Date()
  try {
    const result = await resolveEntities()
    return Response.json({ ok: true, ...result, duration: Date.now() - startedAt.getTime() })
  } catch (err) {
    console.error("[cron/entity-resolve]", err)
    return Response.json({ error: err instanceof Error ? err.message : "Entity resolution failed" }, { status: 500 })
  }
}
