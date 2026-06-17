// AI source discovery — the system finds and works NEW data sources over time,
// so our coverage widens automatically instead of being locked to a fixed list.
// The AI proposes targeted queries (county recorder, tax-collector delinquent
// lists, code-enforcement registries, probate dockets, sheriff sales, land
// banks, legal-notice publishers); we hunt them with our OWN metasearch +
// extractor. Fully self-reliant, guarded, never throws.

import { runAgent } from "@/lib/claude"
import { webSearchMeta, extractPageContentFree } from "@/lib/search"
import { extractAddressesFromContent } from "@/lib/address-extractor"
import type { FreeLead } from "@/lib/free-foreclosure-scraper"

const SYSTEM =
  "You are a real-estate data-sourcing expert. Propose highly targeted web search queries that would surface DISTRESSED or off-market property leads WITH street addresses for a given area. Think: county recorder, tax-collector delinquent lists, code-enforcement/vacant registries, probate dockets, sheriff sales, land banks, HOA/judgment liens, legal-notice publishers. Output a raw JSON array of query strings only."

function toQueries(out: string | Record<string, unknown>): string[] {
  let arr: unknown = out
  if (typeof out === "string") { const m = out.match(/\[[\s\S]*\]/); arr = m ? JSON.parse(m[0]) : null }
  else if (!Array.isArray(out)) arr = (out as Record<string, unknown>).queries ?? Object.values(out)[0]
  return Array.isArray(arr) ? arr.filter((q): q is string => typeof q === "string" && q.length > 6) : []
}

export async function discoverSourceQueries(place: string, count = 5): Promise<string[]> {
  if (!place?.trim()) return []
  try {
    const out = await runAgent(SYSTEM, `Area: ${place}. Year: ${new Date().getFullYear()}. Return ${count} targeted queries as a JSON array of strings.`, { jsonMode: true, model: "haiku", maxTokens: 400 })
    return toQueries(out).slice(0, count)
  } catch { return [] }
}

// Hunt the AI-discovered sources with our own metasearch + page extractor and
// return any distressed leads found. Bounded so it never blows a cron budget.
export async function huntDiscoveredSources(place: string, maxLeads = 25): Promise<FreeLead[]> {
  const queries = await discoverSourceQueries(place, 5)
  if (!queries.length) return []

  const found: FreeLead[] = []
  const seen = new Set<string>()
  for (const q of queries) {
    if (found.length >= maxLeads) break
    const r = await webSearchMeta(q, 5).catch(() => null)
    const urls = (r?.results ?? []).slice(0, 3).map((x) => x.url).filter(Boolean)
    const pages = urls.length ? await extractPageContentFree(urls).catch(() => []) : []
    const blobs = [...(r?.results ?? []).map((x) => ({ content: `${x.title} ${x.content}`, url: x.url })), ...pages]
    for (const b of blobs) {
      if (found.length >= maxLeads) break
      let extracted: ReturnType<typeof extractAddressesFromContent> = []
      try { extracted = extractAddressesFromContent(b.content, b.url) } catch { /* skip */ }
      for (const e of extracted) {
        const key = e.lead.address.toLowerCase().replace(/[^a-z0-9]/g, "")
        if (key.length < 6 || seen.has(key)) continue
        seen.add(key); found.push(e.lead)
        if (found.length >= maxLeads) break
      }
    }
  }
  return found
}
