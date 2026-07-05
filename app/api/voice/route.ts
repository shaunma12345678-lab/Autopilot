// Voice assistant — interprets a spoken command about the user's real estate
// business and answers concisely (spoken back in the browser). Uses Groq.
// Robust: returns a safe fallback, never throws.

export const maxDuration = 20

import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { runAgent } from "@/lib/claude"

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "ap2026admin"

function isAuthorized(request: NextRequest, user: unknown): boolean {
  if (user) return true
  return request.headers.get("x-admin-password") === ADMIN_PASSWORD
}

const SYSTEM =
  "You are DealPilot, a spoken AI assistant for a real estate investor/wholesaler. Answer the investor's spoken command briefly and conversationally — 1-3 sentences, no markdown, since your reply is read aloud. " +
  "You can explain deal math (MAO, ARV, BRRRR, cash-on-cash, the 70% rule), coach outreach/negotiation, and describe how to use the app's sections (Best Deals, Distress Index, Cash Buyers, Fixer-Uppers, Pipeline, Rental Calculator, the autonomous Agent). " +
  "If asked to DO something the app supports (find deals, run a search, mail owners), tell them which section to open and what to click. Be warm, sharp, and practical."

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!isAuthorized(request, user)) return Response.json({ error: "Unauthorized" }, { status: 401 })

  let body: { transcript?: string }
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }) }
  const transcript = (body.transcript ?? "").trim()
  if (!transcript) return Response.json({ answer: "" })

  try {
    const out = await runAgent(SYSTEM, `The investor said: "${transcript}"`, { model: "haiku", maxTokens: 220 })
    const answer = typeof out === "string" ? out.trim() : String(out)
    return Response.json({ answer: answer || "I didn't catch that — try again." })
  } catch {
    return Response.json({ answer: "The assistant is unavailable right now — try again in a moment." })
  }
}
