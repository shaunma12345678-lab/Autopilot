// AI Negotiator — drafts empathetic, effective seller messages for an investor:
// the opening outreach, and a best-next-reply given whatever the homeowner said.
// Generation only (the investor reviews + sends); never auto-contacts anyone.
// Uses Groq via runAgent. Robust: returns a safe fallback, never throws.

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
  "You are an experienced, deeply empathetic real estate investor messaging a homeowner who may be facing foreclosure or financial hardship. " +
  "RULES: lead with empathy, never pressure, never judge, never make legal or financial promises. Sound like a real person, not a script. " +
  "GOAL: build trust and gently set up a short call or visit to discuss options (a fair cash offer, fast close, avoiding foreclosure, protecting their credit). " +
  "Keep text/SMS replies under 320 characters. If the homeowner is hostile or says stop, de-escalate and offer to leave them alone. " +
  'Return raw JSON only: { "reply": string, "tips": string[] }  where reply is the message to send and tips are 1-2 short coaching notes for the investor.'

function safeParse(s: string): Record<string, unknown> | null {
  try { const m = s.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : null } catch { return null }
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!isAuthorized(request, user)) return Response.json({ error: "Unauthorized" }, { status: 401 })

  let body: { address?: string; city?: string; state?: string; ownerName?: string; sellerMessage?: string; history?: string; channel?: string }
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }) }

  const owner = (body.ownerName || "").trim()
  const ctx = `Property: ${body.address ?? "(unknown)"}${body.city ? `, ${body.city}` : ""}${body.state ? `, ${body.state}` : ""}. Homeowner: ${owner || "name unknown"}. Channel: ${body.channel || "text"}.`
  const task = body.sellerMessage?.trim()
    ? `${ctx}\nConversation so far: ${body.history || "(first contact)"}\nThe homeowner just said: "${body.sellerMessage.trim()}"\nWrite the best next message to send.`
    : `${ctx}\nWrite the opening message to send this homeowner (warm first contact).`

  try {
    const out = await runAgent(SYSTEM, task, { jsonMode: true, model: "haiku", maxTokens: 350 })
    const obj = typeof out === "string" ? safeParse(out) : (out as Record<string, unknown>)
    const reply = obj && typeof obj.reply === "string" ? obj.reply : (typeof out === "string" ? out : "")
    const tips = obj && Array.isArray(obj.tips) ? (obj.tips as unknown[]).filter((t): t is string => typeof t === "string").slice(0, 2) : []
    if (!reply) return Response.json({ reply: "Hi, I'm a local home buyer and wanted to reach out — no pressure at all. If it'd help to talk through your options, I'm here.", tips: [] })
    return Response.json({ reply, tips })
  } catch (err) {
    return Response.json({ reply: "", tips: [], error: err instanceof Error ? err.message : "failed" }, { status: 200 })
  }
}
