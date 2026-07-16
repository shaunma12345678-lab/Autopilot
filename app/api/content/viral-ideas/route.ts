// Viral Content Engine API — grounded, self-scored short-form content ideas
// for this business and its market. POST { city, state, situation?, fresh? }.

export const maxDuration = 90

import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { viralIdeas } from "@/lib/viral-ideas"

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? ""   // no fallback: unset env disables admin access

function isAuthorized(request: NextRequest, user: unknown): boolean {
  if (user) return true
  return ADMIN_PASSWORD.length > 0 && request.headers.get("x-admin-password") === ADMIN_PASSWORD
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!isAuthorized(request, user)) return Response.json({ error: "Unauthorized" }, { status: 401 })

  let body: { city?: string; state?: string; situation?: string; fresh?: boolean }
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }) }
  if (!body.city?.trim() || !body.state?.trim()) return Response.json({ error: "city and state are required" }, { status: 400 })

  try {
    const result = await viralIdeas({ city: body.city.trim(), state: body.state.trim(), situation: body.situation, fresh: body.fresh === true })
    if (!result) return Response.json({ error: "Couldn't generate ideas right now — try again in a moment." }, { status: 200 })
    return Response.json(result)
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Idea generation failed" }, { status: 500 })
  }
}
