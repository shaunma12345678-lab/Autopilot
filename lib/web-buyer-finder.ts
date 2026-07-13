// Web buyer discovery — real, contactable cash buyers for ANY city. Cash
// buyers reveal themselves two ways: by buying (assessor layers, where we have
// them) and by ADVERTISING — "we buy houses" operators, cash-for-homes
// companies, and active investors market themselves publicly in every metro.
// We metasearch those footprints and AI-extract ONLY what appears verbatim in
// the results (names, phones, sites, what they say they buy — their stated
// tendencies). Cached per city for 7 days. Server-only, never throws.

import { prisma } from "@/lib/prisma"
import { resolveLearningBusinessId } from "@/lib/learning-store"
import { webSearchMeta } from "@/lib/search"
import { runAgent } from "@/lib/claude"

const SLUG = "re-web-buyers"
const TTL_MS = 7 * 24 * 60 * 60 * 1000

export interface WebBuyer {
  name: string
  phone: string | null
  website: string | null
  kind: "we-buy-houses" | "investor" | "ibuyer" | "buyer-agent"
  tendencies: string        // what they SAY they buy — as-is, any condition, price band, areas
}

export interface WebBuyers { buyers: WebBuyer[]; at: string; sources: number }

async function loadCached(bizId: string, key: string): Promise<WebBuyers | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mem = prisma.agentMemory as any
    const row = await mem.findFirst({ where: { businessId: bizId, agentSlug: SLUG, key } })
    if (row?.value) {
      const parsed = JSON.parse(row.value) as WebBuyers
      if (parsed?.at && Date.now() - Date.parse(parsed.at) < TTL_MS && parsed.buyers?.length) return parsed
    }
  } catch { /* first run */ }
  return null
}

async function saveCached(bizId: string, key: string, data: WebBuyers): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mem = prisma.agentMemory as any
    const value = JSON.stringify(data)
    await mem.upsert({
      where:  { businessId: bizId, agentSlug: SLUG, key },
      create: { id: crypto.randomUUID(), businessId: bizId, agentSlug: SLUG, key, value, updatedAt: new Date().toISOString() },
      update: { value, updatedAt: new Date().toISOString() },
    })
  } catch { /* best-effort */ }
}

const SYSTEM =
  "You extract ACTIVE CASH BUYERS of houses from web-search snippets about a city. Return raw JSON: " +
  '{ "buyers": [{ "name": string, "phone": string|null, "website": string|null, "kind": "we-buy-houses"|"investor"|"ibuyer"|"buyer-agent", "tendencies": string }] }. ' +
  "Include: local we-buy-houses / cash-home-buyer companies, investment firms stating they buy properties, iBuyers operating there. " +
  "EXCLUDE: lead-gen directories ABOUT selling (articles, 'top 10 companies' lists as entities themselves), realtors selling services to buyers, national portals (Zillow/Redfin/Opendoor listings pages — but Opendoor/Offerpad AS buyers in the city are fine). " +
  "STRICT: name must appear verbatim in the snippets. phone ONLY if those exact digits appear in the text (else null). website ONLY if that domain appears (else null). tendencies = a short quote/paraphrase of what THEY say they buy (as-is, any condition, price range, areas, close speed) — from the text only. Max 12. Never invent."

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "")

export async function findWebBuyers(city: string, state: string): Promise<WebBuyers | null> {
  const c = city.trim(), st = state.trim().toUpperCase()
  if (!c) return null
  const key = `${c.toLowerCase()}:${st}`

  const bizId = await resolveLearningBusinessId().catch(() => null)
  if (bizId) {
    const cached = await loadCached(bizId, key)
    if (cached) return cached
  }

  try {
    const place = [c, st].filter(Boolean).join(" ")
    const queries = [
      `"we buy houses" ${place} cash`,
      `cash home buyers ${place} any condition`,
      `${place} real estate investors buying houses fast close`,
    ]
    const chunks: string[] = []
    let sources = 0
    for (const q of queries) {
      const r = await webSearchMeta(q, 6).catch(() => null)
      for (const res of r?.results ?? []) {
        if (!res.content) continue
        chunks.push(`[${res.title}](${res.url}) ${res.content}`.slice(0, 600))
        sources++
      }
    }
    if (!chunks.length) return null
    const corpus = chunks.slice(0, 20).join("\n---\n")

    const out = await runAgent(SYSTEM, `City: ${place}\n\nSearch snippets:\n${corpus}`, { jsonMode: true, maxTokens: 1200 })
    const obj = typeof out === "string" ? (() => { try { const m = out.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : null } catch { return null } })() : (out as Record<string, unknown>)
    const rawList = Array.isArray((obj as Record<string, unknown>)?.buyers) ? ((obj as Record<string, unknown>).buyers as unknown[]) : []

    // Anti-hallucination enforcement: keep phones/domains only when literally present.
    const corpusDigits = corpus.replace(/[^0-9]/g, "")
    const corpusNorm = norm(corpus)
    const seen = new Set<string>()
    const buyers: WebBuyer[] = []
    for (const raw of rawList) {
      if (!raw || typeof raw !== "object") continue
      const r = raw as Record<string, unknown>
      const name = typeof r.name === "string" ? r.name.trim().slice(0, 80) : ""
      if (name.length < 3 || !corpusNorm.includes(norm(name).slice(0, 24))) continue
      const dk = norm(name)
      if (seen.has(dk)) continue
      seen.add(dk)
      let phone: string | null = null
      if (typeof r.phone === "string") {
        const digits = r.phone.replace(/[^0-9]/g, "")
        if (digits.length >= 10 && corpusDigits.includes(digits)) phone = r.phone.trim().slice(0, 24)
      }
      let website: string | null = null
      if (typeof r.website === "string") {
        const dom = r.website.replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase()
        if (dom.includes(".") && corpus.toLowerCase().includes(dom)) website = dom.slice(0, 80)
      }
      const kinds = ["we-buy-houses", "investor", "ibuyer", "buyer-agent"] as const
      const kind = kinds.find((k) => k === r.kind) ?? "investor"
      buyers.push({
        name, phone, website, kind,
        tendencies: typeof r.tendencies === "string" ? r.tendencies.trim().slice(0, 160) : "",
      })
      if (buyers.length >= 12) break
    }
    if (!buyers.length) return null

    const data: WebBuyers = { buyers, at: new Date().toISOString(), sources }
    if (bizId) await saveCached(bizId, key, data)
    return data
  } catch {
    return null
  }
}
