// Public homeowner helper — answers a distressed homeowner's questions on the
// /sell pages in plain, compassionate language. Educational only (never legal
// or financial advice; always offers the free HUD counselor line) with a soft
// path to the cash-offer form. Rate-limited per IP (best-effort per instance)
// so the public endpoint can't be farmed.

export const maxDuration = 30

import { NextRequest } from "next/server"
import { runAgent } from "@/lib/claude"

const DAILY_PER_IP = 25
const ipCounts = new Map<string, { day: string; n: number }>()

function allow(ip: string): boolean {
  const day = new Date().toISOString().slice(0, 10)
  const cur = ipCounts.get(ip)
  if (!cur || cur.day !== day) { ipCounts.set(ip, { day, n: 1 }); return true }
  if (cur.n >= DAILY_PER_IP) return false
  cur.n += 1
  return true
}

const SYSTEM =
  "You are a warm, plain-spoken helper for homeowners who are behind on their mortgage or facing foreclosure. They may be stressed — be kind, clear, and honest. " +
  "Explain their real options factually: reinstating the loan, loan modification/forbearance (call the servicer's loss-mitigation department — it's free to apply), selling before the sale date to protect equity, short sale, deed in lieu, and talking to a HUD-approved housing counselor (free, 1-800-569-4287). " +
  "Rules: you are NOT a lawyer or financial advisor and must say so when the question is legal/financial ('a HUD counselor or attorney can confirm for your exact case'). Never invent deadlines for their specific case — tell them to check the dates on their recorded notices. Never pressure them to sell; if they ask about a cash offer, mention they can use the form on this page for a no-obligation offer. " +
  "Keep answers focused and readable: short paragraphs, no markdown symbols, under ~250 words."

export async function POST(request: NextRequest) {
  const ip = (request.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim()
  if (!allow(ip)) {
    return Response.json({ answer: "You've reached today's question limit — please call a HUD-approved housing counselor for free help: 1-800-569-4287." })
  }

  let body: { transcript?: string; question?: string }
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }) }
  const question = (body.transcript ?? body.question ?? "").trim().slice(0, 600)
  if (!question) return Response.json({ answer: "" })

  try {
    const out = await runAgent(SYSTEM, `The homeowner asked: "${question}"`, { model: "haiku", maxTokens: 500 })
    const answer = (typeof out === "string" ? out : "").trim()
    return Response.json({ answer: answer || "I didn't catch that — could you rephrase?" })
  } catch {
    return Response.json({ answer: "I'm having trouble answering right now. For free, immediate help call a HUD-approved housing counselor: 1-800-569-4287." })
  }
}
