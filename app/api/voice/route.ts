// Voice/text assistant — interprets a spoken or typed command about the user's
// real estate business. Returns BOTH a short spoken reply and a detailed
// written answer (the user reads the full breakdown while the short version is
// read aloud). Uses Groq. Robust: returns a safe fallback, never throws.

export const maxDuration = 30

import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { runAgent } from "@/lib/claude"

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "ap2026admin"

function isAuthorized(request: NextRequest, user: unknown): boolean {
  if (user) return true
  return request.headers.get("x-admin-password") === ADMIN_PASSWORD
}

function safeParse(s: string): Record<string, unknown> | null {
  try { const m = s.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : null } catch { return null }
}

function firstSentence(text: string): string {
  return text.split(/(?<=[.!?])\s/)[0] ?? text
}

const SYSTEM =
  "You are DealPilot, the AI assistant for a real estate investor/wholesaler using the AutoPilot platform. " +
  "You answer questions about deal math (MAO, ARV, the 70% rule, BRRRR, cash-on-cash, cap rate, DSCR), negotiation, outreach, foreclosure timelines, and how to use the app's sections (Real Estate search, Best Deals, Distress Index, Cash Buyers, Pipeline, Deal Simulator, Rental Calculator, Distress Map). " +
  "Return raw JSON with exactly two keys: " +
  '{ "spoken": string, "detail": string }. ' +
  '"spoken": 1-2 conversational sentences with the headline answer — it is read aloud, so no markdown and no lists. ' +
  '"detail": the FULL detailed written answer — thorough and specific, with the actual numbers worked out step by step when math is involved, concrete word-for-word scripts when outreach or negotiation is involved, and exact section/button names when the app is involved. Use short paragraphs and simple dash lists. Plain text only (no markdown symbols like ** or #). Never invent live data about their leads — if asked about their current leads, explain where in the app to see it.'

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!isAuthorized(request, user)) return Response.json({ error: "Unauthorized" }, { status: 401 })

  let body: { transcript?: string }
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }) }
  const transcript = (body.transcript ?? "").trim()
  if (!transcript) return Response.json({ answer: "", detail: "" })

  try {
    const out = await runAgent(SYSTEM, `The investor asked: "${transcript}"`, { model: "haiku", jsonMode: true, maxTokens: 1400 })
    const obj = typeof out === "string" ? safeParse(out) : (out as Record<string, unknown>)
    const spoken = typeof obj?.spoken === "string" ? obj.spoken.trim() : ""
    const detail = typeof obj?.detail === "string" ? obj.detail.trim() : ""
    if (!spoken && !detail) {
      // Model ignored the JSON shape — use the raw text as the detailed answer.
      const raw = (typeof out === "string" ? out : JSON.stringify(out)).trim()
      return Response.json({ answer: firstSentence(raw) || "I didn't catch that — try again.", detail: raw })
    }
    return Response.json({ answer: spoken || firstSentence(detail), detail: detail || spoken })
  } catch {
    return Response.json({ answer: "The assistant is unavailable right now — try again in a moment.", detail: "" })
  }
}
