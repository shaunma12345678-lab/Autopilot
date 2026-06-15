// Our OWN contact-tracing engine — no paid skip-trace key. Uses the free
// web-search + Groq pipeline to find an owner's phone/email/relatives from
// public pages. Returns the same SkipTraceResult shape as the BatchData path.
//
// ANTI-HALLUCINATION: every phone/email the AI returns is kept ONLY if it
// actually appears in the gathered source text — so we never surface a made-up
// number. Best-effort, guarded, never throws.

import { webSearchAny } from "@/lib/search"
import { runAgent } from "@/lib/claude"
import type { SkipTraceResult } from "@/lib/skip-trace"

function digitsOf(s: string): string { return s.replace(/[^0-9]/g, "") }

function formatPhone(raw: string): string | null {
  const d = digitsOf(raw).replace(/^1(?=\d{10}$)/, "")
  if (d.length !== 10) return null
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}

function uniq(arr: string[]): string[] { return Array.from(new Set(arr)) }

function safeParse(s: string): Record<string, unknown> | null {
  try { const m = s.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : null } catch { return null }
}

const SYSTEM =
  "You extract a property owner's contact details from web snippets. Use ONLY phone numbers, emails, and names that appear verbatim in the text. Never invent or guess contact info. Output raw JSON only."

export async function traceOwnerFromWeb(
  p: { address: string; city: string; state: string; zip: string; ownerName?: string },
): Promise<SkipTraceResult | null> {
  const owner = (p.ownerName ?? "").trim()
  const hasOwner = owner && !/owner unknown|unknown/i.test(owner)
  const place = [p.city, p.state].filter(Boolean).join(", ")

  const queries = hasOwner
    ? [`${owner} ${place} phone number contact`, `"${owner}" ${p.address} phone OR email`]
    : [`${p.address} ${place} owner phone contact public record`, `who owns ${p.address} ${place} contact`]

  const seen = new Set<string>()
  let context = ""
  try {
    for (const q of queries) {
      const r = await webSearchAny(q, 5).catch(() => null)
      for (const res of r?.results ?? []) {
        if (!res?.url || seen.has(res.url)) continue
        seen.add(res.url)
        context += `\n[${res.title ?? ""}] ${(res.content ?? "").slice(0, 1200)}`
      }
      if (context.length > 4800) break
    }
  } catch { return null }
  if (context.trim().length < 40) return null

  const user =
    `Owner: ${hasOwner ? owner : "(unknown — infer from records)"}\nProperty: ${[p.address, place, p.zip].filter(Boolean).join(", ")}\n\n` +
    `Web snippets:\n${context.slice(0, 5500)}\n\n` +
    `Return JSON: { "phones": string[], "emails": string[], "relatives": string[] }. ` +
    `Only include phones/emails that appear verbatim in the snippets and plausibly belong to this owner.`

  let out: string | Record<string, unknown>
  try { out = await runAgent(SYSTEM, user, { jsonMode: true, model: "haiku", maxTokens: 500 }) }
  catch { return null }

  const obj = typeof out === "string" ? safeParse(out) : (out as Record<string, unknown>)
  if (!obj) return null

  const ctxDigits = digitsOf(context)
  const rawPhones = Array.isArray(obj.phones) ? (obj.phones as unknown[]).map(String) : []
  const rawEmails = Array.isArray(obj.emails) ? (obj.emails as unknown[]).map(String) : []
  const rawRel    = Array.isArray(obj.relatives) ? (obj.relatives as unknown[]).map(String) : []

  // Keep only contacts that genuinely appear in the source text.
  const phones = uniq(
    rawPhones.map(formatPhone).filter((x): x is string => Boolean(x))
      .filter((ph) => ctxDigits.includes(digitsOf(ph))),
  )
  const emails = uniq(
    rawEmails.filter((e) => /\S+@\S+\.\S+/.test(e)).map((e) => e.toLowerCase().trim())
      .filter((e) => context.toLowerCase().includes(e)),
  )
  const relatives = uniq(rawRel.map((r) => r.trim())).filter((n) => n.length > 3 && n.toLowerCase() !== owner.toLowerCase()).slice(0, 5)

  if (!phones.length && !emails.length && !relatives.length) return null

  return {
    phone: phones[0] ?? null,
    email: emails[0] ?? null,
    phones,
    emails,
    relatives,
    confidence: phones.length || emails.length ? "medium" : "low",
    source: "Public web (AI-extracted)",
  }
}
