// Our OWN property enrichment — no paid per-property API required. Uses the same
// free web-search + Groq AI-extraction pipeline that powers Deep Search to pull
// a property's facts (beds/baths/sqft/year/owner/last sale/value) from public
// listing & record pages. RentCast (when configured) is layered on top for
// accuracy, but this path works with zero extra keys.
//
// Strictly best-effort & guarded: only extracts facts present in the text,
// returns null on any failure, and NEVER throws.

import { webSearchAny } from "@/lib/search"
import { runAgent } from "@/lib/claude"

export interface EnrichedFacts {
  beds:          number | null
  baths:         number | null
  sqft:          number | null
  yearBuilt:     number | null
  lotSize:       number | null
  propertyType:  string | null
  lastSalePrice: number | null
  lastSaleDate:  string | null
  ownerName:     string | null
  estimatedValue: number | null
  source:        string
}

function num(v: unknown): number | null {
  if (v == null) return null
  const n = typeof v === "number" ? v : Number(String(v).replace(/[$,]/g, ""))
  return Number.isFinite(n) && n > 0 ? n : null
}
function str(v: unknown): string | null {
  if (typeof v !== "string") return null
  const s = v.trim()
  return s && s.toLowerCase() !== "null" && s.toLowerCase() !== "unknown" ? s : null
}
function safeParse(s: string): Record<string, unknown> | null {
  try {
    const m = s.match(/\{[\s\S]*\}/)
    return m ? JSON.parse(m[0]) : null
  } catch { return null }
}

const SYSTEM =
  "You extract structured real-estate facts from web search snippets. Use ONLY facts explicitly stated in the text for the EXACT address given. Never guess or invent numbers — return null for anything not clearly stated. Output raw JSON only."

/**
 * Enrich a property from the public web. Returns null when nothing usable is
 * found or the AI/search is unavailable.
 */
export async function enrichPropertyFromWeb(p: {
  address: string; city: string; state: string; zip: string
}): Promise<EnrichedFacts | null> {
  const full = [p.address, p.city, p.state, p.zip].filter(Boolean).join(", ")
  if (!p.address?.trim()) return null

  // Gather snippets from a few targeted queries (free DDG/Bing fallback).
  const queries = [
    `${full} bedrooms bathrooms square feet year built`,
    `${full} zillow redfin realtor home value last sold price`,
  ]
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
      if (context.length > 4500) break
    }
  } catch { return null }

  if (context.trim().length < 40) return null

  const user =
    `Property address: ${full}\n\nWeb snippets:\n${context.slice(0, 5500)}\n\n` +
    `Return JSON with these keys (use null when not clearly stated for THIS address): ` +
    `{ "beds": number|null, "baths": number|null, "sqft": number|null, "yearBuilt": number|null, ` +
    `"lotSize": number|null, "propertyType": string|null, "lastSalePrice": number|null, ` +
    `"lastSaleDate": "YYYY-MM-DD"|null, "ownerName": string|null, "estimatedValue": number|null }`

  let out: string | Record<string, unknown>
  try {
    out = await runAgent(SYSTEM, user, { jsonMode: true, model: "haiku", maxTokens: 600 })
  } catch { return null }

  const obj = typeof out === "string" ? safeParse(out) : (out as Record<string, unknown>)
  if (!obj || typeof obj !== "object") return null

  const facts: EnrichedFacts = {
    beds:           num(obj.beds),
    baths:          num(obj.baths),
    sqft:           num(obj.sqft),
    yearBuilt:      num(obj.yearBuilt),
    lotSize:        num(obj.lotSize),
    propertyType:   str(obj.propertyType),
    lastSalePrice:  num(obj.lastSalePrice),
    lastSaleDate:   str(obj.lastSaleDate),
    ownerName:      str(obj.ownerName),
    estimatedValue: num(obj.estimatedValue),
    source:         "Public web records (AI-extracted)",
  }

  // Only return if we actually found something useful.
  const hasAny = facts.beds || facts.baths || facts.sqft || facts.yearBuilt || facts.lastSalePrice || facts.estimatedValue || facts.ownerName
  return hasAny ? facts : null
}
