// Autonomous Acquisitions Agent — scheduled cycle. When the agent is enabled it
// scans the next rotating batch of the user's buy-box markets and adds new deals
// to the feed. Runs only when enabled; a no-op otherwise.
//
// Auth: Vercel cron Bearer CRON_SECRET, or x-admin-password for a manual run.

export const maxDuration = 300

import { NextRequest } from "next/server"
import { runAgentCycle } from "@/lib/re-agent-runner"

const CRON_SECRET    = process.env.CRON_SECRET ?? ""
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "ap2026admin"

function authorized(request: NextRequest): boolean {
  const bearer = request.headers.get("authorization")
  if (CRON_SECRET && bearer === `Bearer ${CRON_SECRET}`) return true
  return request.headers.get("x-admin-password") === ADMIN_PASSWORD
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const result = await runAgentCycle(false)
  return Response.json({ ok: true, ...result })
}
