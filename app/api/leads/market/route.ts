// On-demand market analysis — deep search + real Census fundamentals + strategy
// ROI for one city. Powers the Markets section's click-to-analyze.

export const maxDuration = 120

import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { runMarketAnalysis } from "@/lib/market-runner"

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "ap2026admin"

function isAuthorized(request: NextRequest, user: unknown): boolean {
  if (user) return true
  return request.headers.get("x-admin-password") === ADMIN_PASSWORD
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!isAuthorized(request, user)) return Response.json({ error: "Unauthorized" }, { status: 401 })

  let body: { city?: string; state?: string; depth?: number }
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }) }
  if (!body.city?.trim()) return Response.json({ error: "city is required" }, { status: 400 })

  try {
    const result = await runMarketAnalysis(body.city.trim(), (body.state ?? "").trim(), Math.min(Math.max(body.depth ?? 300, 50), 1000))
    if (!result) return Response.json({ error: "No data for this market yet — try again or a larger city." }, { status: 200 })
    return Response.json(result)
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Market analysis failed" }, { status: 500 })
  }
}
