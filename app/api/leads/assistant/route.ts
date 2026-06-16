// AI Deal Assistant — converts a plain-English request ("sub-300k with 30%+
// equity, absentee owners in Phoenix") into a structured filter the client
// applies to the live deal list, plus a one-line answer. Uses Groq; no extra
// key. Robust: returns an empty filter on any failure, never throws.

export const maxDuration = 20

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

const SYSTEM =
  "You are a real-estate deal assistant. Convert the investor's request into (a) a JSON filter over their current deal list and (b) — if the request names a place to search — a search target. Give a one-sentence answer. " +
  "Filter keys (include ONLY the ones implied): minPrice, maxPrice (property value), minEquityPct (0-100), minScore, maxScore (0-100), " +
  "priority ('HOT'|'WARM'|'COLD'), absentee (true), vacant (true), taxDelinquent (true), city, zip, minProfit, exit ('Wholesale'|'Flip'|'BRRRR'|'Subject-to'). " +
  "search: if the request mentions a city/ZIP/county to look in, return { type:'zip'|'city'|'county', zip, city, state (2-letter), county }, else omit. " +
  "Return raw JSON: { \"filter\": {...}, \"search\": {...}|null, \"sort\": string|null, \"answer\": string }. Never invent deals."

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!isAuthorized(request, user)) return Response.json({ error: "Unauthorized" }, { status: 401 })

  let body: { question?: string; count?: number }
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }) }
  const question = (body.question ?? "").trim()
  if (!question) return Response.json({ error: "question is required" }, { status: 400 })

  try {
    const userPrompt = `Investor request: "${question}"\nThey are looking at ${body.count ?? 0} deals. Build the filter + answer.`
    const out = await runAgent(SYSTEM, userPrompt, { jsonMode: true, model: "haiku", maxTokens: 400 })
    const obj = typeof out === "string" ? safeParse(out) : (out as Record<string, unknown>)
    if (!obj) return Response.json({ filter: {}, sort: null, answer: "I couldn't parse that — try rephrasing." })
    return Response.json({
      filter: (obj.filter && typeof obj.filter === "object") ? obj.filter : {},
      search: (obj.search && typeof obj.search === "object") ? obj.search : null,
      sort: typeof obj.sort === "string" ? obj.sort : null,
      answer: typeof obj.answer === "string" ? obj.answer : "Here are the matching deals.",
    })
  } catch (err) {
    return Response.json({ filter: {}, sort: null, answer: "Assistant is unavailable right now.", error: err instanceof Error ? err.message : "failed" }, { status: 200 })
  }
}
