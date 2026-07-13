// Voice/text assistant — conversational AND agentic. Every request carries the
// conversation history plus the user's saved focus instruction, so follow-ups
// build on what came before ("now just the vacant ones"). When the user asks to
// FIND deals, the reply includes a structured search action the client executes
// against the real deep-search engine — the assistant doesn't describe the app,
// it drives it. Returns BOTH a short spoken reply and a detailed written answer.
// Uses Groq. Robust: returns a safe fallback, never throws.

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

export interface VoiceSearchAction {
  searchType: "city" | "zip" | "county"
  city?: string
  state?: string
  zip?: string
  county?: string
  leadType?: string
  maxLeads?: number
}

const LEAD_TYPES = "foreclosure, predicted, probate, taxdelq, vacant, absentee, liens, code, divorce, eviction, bankruptcy, highequity, motivated"

const SYSTEM =
  "You are DealPilot, the AI assistant for a real estate investor/wholesaler using the AutoPilot platform. You hold a CONVERSATION (the transcript is provided — build on it, remember what was searched and refine when asked) and you can ACT. " +
  "You answer deal math (MAO, ARV, the 70% rule, BRRRR, cap rate), negotiation, outreach, foreclosure timelines, and platform questions. " +
  "ACTIONS: when the investor asks to FIND/SEARCH/GET deals or leads anywhere (e.g. 'find me vacant houses in Riverside', 'now show probate ones', 'search 92501'), include a search action. For refinements, reuse the previous area unless they name a new one. " +
  `leadType must be one of: ${LEAD_TYPES} — or omit for all deal types. ` +
  "Return raw JSON with exactly these keys: " +
  '{ "spoken": string, "detail": string, "action": { "search": { "searchType": "city"|"zip"|"county", "city"?: string, "state"?: string (2-letter), "zip"?: string, "county"?: string, "leadType"?: string, "maxLeads"?: number } } | null }. ' +
  '"spoken": 1-2 conversational sentences (read aloud — no markdown, no lists). When searching, say what you\'re doing ("On it — pulling vacant properties in Riverside now."). ' +
  '"detail": the FULL detailed written answer — numbers worked step by step, word-for-word scripts, exact section names. Plain text, short paragraphs, simple dash lists. Never invent live data; search results are shown by the app after your action runs.'

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!isAuthorized(request, user)) return Response.json({ error: "Unauthorized" }, { status: 401 })

  let body: {
    transcript?: string
    history?: Array<{ you?: string; ai?: string }>
    custom?: string
    lastSearch?: { area?: string; count?: number; summary?: string }
  }
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }) }
  const transcript = (body.transcript ?? "").trim().slice(0, 800)
  if (!transcript) return Response.json({ answer: "", detail: "", action: null })

  const custom = typeof body.custom === "string" ? body.custom.trim().slice(0, 600) : ""
  const history = (Array.isArray(body.history) ? body.history : [])
    .slice(-8)
    .map((t) => `Investor: ${String(t.you ?? "").slice(0, 300)}\nYou: ${String(t.ai ?? "").slice(0, 300)}`)
    .join("\n")
  const last = body.lastSearch?.area
    ? `\nMost recent search: ${body.lastSearch.area} — ${body.lastSearch.count ?? 0} results.${body.lastSearch.summary ? ` ${String(body.lastSearch.summary).slice(0, 300)}` : ""}`
    : ""

  const userPrompt =
    (custom ? `The investor's saved focus (always respect this): "${custom}"\n\n` : "") +
    (history ? `Conversation so far:\n${history}\n` : "") +
    last +
    `\nInvestor just said: "${transcript}"`

  try {
    const out = await runAgent(SYSTEM, userPrompt, { model: "haiku", jsonMode: true, maxTokens: 1400 })
    const obj = typeof out === "string" ? safeParse(out) : (out as Record<string, unknown>)
    const spoken = typeof obj?.spoken === "string" ? obj.spoken.trim() : ""
    const detail = typeof obj?.detail === "string" ? obj.detail.trim() : ""

    // Validate the action so the client only ever executes a well-formed search.
    let action: { search: VoiceSearchAction } | null = null
    const rawSearch = (obj?.action as Record<string, unknown> | null)?.search as Record<string, unknown> | undefined
    if (rawSearch && typeof rawSearch === "object") {
      const st = String(rawSearch.searchType ?? "")
      const searchType = st === "zip" ? "zip" : st === "county" ? "county" : "city"
      const s: VoiceSearchAction = {
        searchType,
        city: typeof rawSearch.city === "string" ? rawSearch.city.trim().slice(0, 60) : undefined,
        state: typeof rawSearch.state === "string" ? rawSearch.state.trim().toUpperCase().slice(0, 2) : undefined,
        zip: typeof rawSearch.zip === "string" ? rawSearch.zip.replace(/[^0-9]/g, "").slice(0, 5) : undefined,
        county: typeof rawSearch.county === "string" ? rawSearch.county.trim().slice(0, 60) : undefined,
        leadType: typeof rawSearch.leadType === "string" && rawSearch.leadType.trim() ? rawSearch.leadType.trim().toLowerCase() : undefined,
        maxLeads: typeof rawSearch.maxLeads === "number" ? Math.min(Math.max(Math.round(rawSearch.maxLeads), 25), 300) : 100,
      }
      const valid = (s.searchType === "zip" && s.zip) || (s.searchType === "county" && s.county) || (s.searchType === "city" && s.city)
      if (valid) action = { search: s }
    }

    if (!spoken && !detail) {
      const raw = (typeof out === "string" ? out : JSON.stringify(out)).trim()
      return Response.json({ answer: firstSentence(raw) || "I didn't catch that — try again.", detail: raw, action })
    }
    return Response.json({ answer: spoken || firstSentence(detail), detail: detail || spoken, action })
  } catch {
    return Response.json({ answer: "The assistant is unavailable right now — try again in a moment.", detail: "", action: null })
  }
}
