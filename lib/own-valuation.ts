// Our OWN valuation + comps engine — no paid AVM key. Uses the free web-search +
// Groq pipeline to estimate ARV and pull comparable sales from public listing
// pages (Zillow/Redfin/Realtor). Returns the same ValuationResult shape as the
// RentCast path so callers are drop-in. Best-effort, guarded, never throws.

import { webSearchAny } from "@/lib/search"
import { runAgent } from "@/lib/claude"
import type { ValuationResult, Comp } from "@/lib/property-valuation"

function num(v: unknown): number | null {
  if (v == null) return null
  const n = typeof v === "number" ? v : Number(String(v).replace(/[$,]/g, ""))
  return Number.isFinite(n) && n > 0 ? n : null
}
function str(v: unknown): string | null {
  if (typeof v !== "string") return null
  const s = v.trim()
  return s && s.toLowerCase() !== "null" ? s : null
}
function safeParse(s: string): Record<string, unknown> | null {
  try { const m = s.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : null } catch { return null }
}

const SYSTEM =
  "You are a real-estate appraiser. From web snippets, estimate the subject property's current market value (ARV) and list nearby comparable sales. Use ONLY figures present in the text; never fabricate. If you cannot find a value, return null. Output raw JSON only."

export async function estimateValueFromWeb(
  p: { address: string; city: string; state: string; zip: string },
): Promise<ValuationResult | null> {
  const full = [p.address, p.city, p.state, p.zip].filter(Boolean).join(", ")
  if (!p.address?.trim()) return null

  const queries = [
    `${full} home value estimate zestimate redfin estimate`,
    `recently sold homes near ${full} comparable sales price`,
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
      if (context.length > 4800) break
    }
  } catch { return null }
  if (context.trim().length < 40) return null

  const user =
    `Subject property: ${full}\n\nWeb snippets:\n${context.slice(0, 5500)}\n\n` +
    `Return JSON: { "value": number|null, "valueLow": number|null, "valueHigh": number|null, ` +
    `"rentEstimate": number|null, "comps": [ { "address": string, "price": number, "sqft": number|null, "soldDate": "YYYY-MM-DD"|null } ] }. ` +
    `Only include figures explicitly stated in the snippets.`

  let out: string | Record<string, unknown>
  try { out = await runAgent(SYSTEM, user, { jsonMode: true, model: "haiku", maxTokens: 700 }) }
  catch { return null }

  const obj = typeof out === "string" ? safeParse(out) : (out as Record<string, unknown>)
  if (!obj) return null

  const value = num(obj.value)
  if (value == null) return null
  const low = num(obj.valueLow)
  const high = num(obj.valueHigh)

  // Only keep comps whose price actually appears in the gathered text.
  const digits = context.replace(/[^0-9]/g, "")
  const rawComps = Array.isArray(obj.comps) ? (obj.comps as Record<string, unknown>[]) : []
  const comps: Comp[] = rawComps
    .map((c) => ({ address: str(c.address) ?? "Comparable sale", price: num(c.price) ?? 0, sqft: num(c.sqft), soldDate: str(c.soldDate) }))
    .filter((c) => c.price > 0 && digits.includes(String(Math.round(c.price))))
    .slice(0, 6)

  const rentEstimate = num(obj.rentEstimate)
  // Web estimates are inherently less certain than a true AVM.
  const confidence = low != null && high != null && high > low ? Math.max(40, Math.min(70, Math.round(70 - ((high - low) / value) * 100))) : 50

  return {
    value,
    rangeLow: low,
    rangeHigh: high,
    confidence,
    rentEstimate,
    rentToValue: rentEstimate ? Math.round(((rentEstimate * 12) / value) * 1000) / 10 : null,
    comps,
    source: "AI market estimate (web)",
  }
}
