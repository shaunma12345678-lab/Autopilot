// Viral Content Engine API — grounded, self-scored short-form content ideas
// for this business and its market. POST { city, state, situation?, fresh? }
// generates ideas; action:"script" turns one idea into a WORD-FOR-WORD script
// (spoken lines + b-roll directions) built on the same real grounded numbers —
// the beats are the sketch, the script is the shoot-ready deliverable.

export const maxDuration = 90

import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { viralIdeas } from "@/lib/viral-ideas"
import { runAgent } from "@/lib/claude"

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? ""   // no fallback: unset env disables admin access

function isAuthorized(request: NextRequest, user: unknown): boolean {
  if (user) return true
  return ADMIN_PASSWORD.length > 0 && request.headers.get("x-admin-password") === ADMIN_PASSWORD
}

const SCRIPT_SYSTEM =
  "You write WORD-FOR-WORD short-form video scripts a creator reads on camera. Every spoken line written out in full — no placeholders, no 'explain X here'. " +
  "Structure: HOOK (the exact given hook, first 1.5s) → escalation → the receipts (use the GROUNDED FACTS verbatim — real numbers on screen and in speech; never invent numbers) → the turn/payoff → one natural CTA fitting the situation. " +
  "Include [b-roll / on-screen text] directions between lines. 45-75 seconds of speech. Conversational, punchy, creator voice — sentences a human actually says out loud. Plain text only."

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!isAuthorized(request, user)) return Response.json({ error: "Unauthorized" }, { status: 401 })

  let body: {
    city?: string; state?: string; situation?: string; fresh?: boolean
    action?: string
    idea?: { hook?: string; format?: string; platform?: string; beats?: string[]; caption?: string; tendencies?: string }
    facts?: string[]
  }
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }) }
  if (!body.city?.trim() || !body.state?.trim()) return Response.json({ error: "city and state are required" }, { status: 400 })

  try {
    // Level 2: the full word-for-word script for one chosen idea.
    if (body.action === "script" && body.idea?.hook) {
      const facts = (Array.isArray(body.facts) ? body.facts : []).filter((f): f is string => typeof f === "string").slice(0, 12)
      const prompt = [
        `MARKET: ${body.city.trim()}, ${body.state.trim().toUpperCase()}`,
        body.situation?.trim() ? `THE CREATOR/BUSINESS: ${body.situation.trim().slice(0, 400)}` : "",
        facts.length ? `GROUNDED FACTS (use these exact numbers):\n- ${facts.join("\n- ")}` : "",
        `HOOK (open with this, verbatim): "${String(body.idea.hook).slice(0, 160)}"`,
        `FORMAT: ${body.idea.format ?? "DATA-DROP"} for ${body.idea.platform ?? "TikTok/Reels"}`,
        body.idea.beats?.length ? `BEAT SKETCH TO EXPAND:\n${body.idea.beats.slice(0, 8).map((b, i) => `${i + 1}. ${String(b).slice(0, 160)}`).join("\n")}` : "",
      ].filter(Boolean).join("\n\n")
      const out = await runAgent(SCRIPT_SYSTEM, prompt, { maxTokens: 1600 })
      const script = (typeof out === "string" ? out : JSON.stringify(out)).trim().slice(0, 8000)
      if (script.length < 100) return Response.json({ error: "Script came back thin — try again." }, { status: 200 })
      return Response.json({ script })
    }

    const result = await viralIdeas({ city: body.city.trim(), state: body.state.trim(), situation: body.situation, fresh: body.fresh === true })
    if (!result) return Response.json({ error: "Couldn't generate ideas right now — try again in a moment." }, { status: 200 })
    return Response.json(result)
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Idea generation failed" }, { status: 500 })
  }
}
