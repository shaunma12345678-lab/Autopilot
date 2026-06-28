// Autonomous Acquisitions Agent — config + feed API for the console.
//   GET            → { config, feed }
//   POST {action:"config", config}  → save buy-box / on-off
//   POST {action:"run"}             → run a cycle now (forced)
//   POST {action:"clear"}           → clear the feed (keeps seen-set)

export const maxDuration = 300

import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { loadAgent, saveAgent, type AgentConfig, type Autonomy } from "@/lib/agent-store"
import { runAgentCycle } from "@/lib/re-agent-runner"

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "ap2026admin"

function isAuthorized(request: NextRequest, user: unknown): boolean {
  if (user) return true
  return request.headers.get("x-admin-password") === ADMIN_PASSWORD
}

function sanitizeConfig(input: unknown, current: AgentConfig): AgentConfig {
  const c = (input ?? {}) as Partial<AgentConfig>
  const markets = Array.isArray(c.markets)
    ? c.markets.filter((m) => m && (m.searchType === "city" || m.searchType === "county") && typeof m.state === "string" && m.state.trim())
        .slice(0, 12)
        .map((m) => ({ searchType: m.searchType, city: (m.city ?? "").trim(), county: (m.county ?? "").trim(), state: m.state.trim().toUpperCase().slice(0, 2) }))
    : current.markets
  const autonomyVals: Autonomy[] = ["find", "suggest", "approve", "supervised", "auto"]
  return {
    enabled:  typeof c.enabled === "boolean" ? c.enabled : current.enabled,
    markets,
    minScore: typeof c.minScore === "number" ? Math.min(Math.max(Math.round(c.minScore), 30), 95) : current.minScore,
    depth:    typeof c.depth === "number" ? Math.min(Math.max(Math.round(c.depth), 100), 1000) : current.depth,
    autonomy: typeof c.autonomy === "string" && autonomyVals.includes(c.autonomy as Autonomy) ? c.autonomy as Autonomy : current.autonomy,
    cursor:   current.cursor,
  }
}

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!isAuthorized(request, user)) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const state = await loadAgent()
  return Response.json({ config: state.config, feed: state.feed })
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!isAuthorized(request, user)) return Response.json({ error: "Unauthorized" }, { status: 401 })

  let body: { action?: string; config?: unknown }
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }) }

  if (body.action === "config") {
    const state = await loadAgent()
    state.config = sanitizeConfig(body.config, state.config)
    await saveAgent(state)
    return Response.json({ ok: true, config: state.config })
  }
  if (body.action === "run") {
    const result = await runAgentCycle(true)
    const state = await loadAgent()
    return Response.json({ ok: true, ...result, config: state.config, feed: state.feed })
  }
  if (body.action === "clear") {
    const state = await loadAgent()
    state.feed = []
    await saveAgent(state)
    return Response.json({ ok: true, feed: [] })
  }
  return Response.json({ error: "Unknown action" }, { status: 400 })
}
