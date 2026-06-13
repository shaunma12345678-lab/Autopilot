// Shared utilities for all county scrapers.
// Uses Tavily (if key present) → DuckDuckGo fallback for all web searches.

import { runAgent } from "@/lib/claude"

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"

export interface RawSignalInput {
  apn?: string
  address: string
  county: string
  signalType: string
  signalDate: string
  rawData: Record<string, unknown>
  source: string
}

export async function webSearchSnippets(query: string): Promise<string[]> {
  if (process.env.TAVILY_API_KEY) {
    try {
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: process.env.TAVILY_API_KEY,
          query,
          search_depth: "basic",
          max_results: 10,
        }),
        signal: AbortSignal.timeout(12000),
      })
      if (res.ok) {
        const data = await res.json()
        return (data.results ?? []).map((r: { content?: string; snippet?: string; url?: string }) =>
          `${r.url ?? ""}\n${r.content ?? r.snippet ?? ""}`.slice(0, 800)
        )
      }
    } catch {
      // fall through to DDG
    }
  }

  // DuckDuckGo HTML fallback
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return []
    const html = await res.text()
    const snippets: string[] = []
    const re = /class="result__(?:snippet|a|url)"[^>]*>([\s\S]*?)<\/(?:a|span)>/gi
    let m: RegExpExecArray | null
    while ((m = re.exec(html)) !== null) {
      const t = m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
      if (t.length > 15 && t.length < 800) snippets.push(t)
    }
    return snippets.slice(0, 25)
  } catch {
    return []
  }
}

export async function multiSearchSnippets(queries: string[], maxMs = 25000): Promise<string> {
  const deadline = Date.now() + maxMs
  const results: string[] = []
  for (const q of queries.slice(0, 3)) {
    if (Date.now() > deadline) break
    const snippets = await webSearchSnippets(q)
    results.push(...snippets)
    if (results.length >= 25) break
  }
  return results.join("\n---\n").slice(0, 10000)
}

export async function extractSignalsWithAI(
  content: string,
  county: string,
  signalTypes: string[],
  systemPrompt: string
): Promise<RawSignalInput[]> {
  if (!content.trim()) return []
  try {
    const raw = await runAgent(
      systemPrompt,
      `Extract ALL property distress signals from the following web search results for ${county} County, CA.
Signal types to look for: ${signalTypes.join(", ")}.

SEARCH RESULTS:
${content}

Return a JSON array (and only JSON, no markdown). Each item:
{
  "address": "full street address",
  "apn": "assessor parcel number if found, else null",
  "signalType": "one of: ${signalTypes.join("|")}",
  "signalDate": "YYYY-MM-DD (use today if unknown: ${new Date().toISOString().split("T")[0]})",
  "rawData": { "ownerName": "...", "amount": null, "lender": null, "notes": "..." }
}

Rules:
- Only include entries with a real street address.
- signalDate must be a valid ISO date string.
- If multiple signals exist for same address, include each separately.
- Return [] if no valid signals found.`,
      { maxTokens: 2000 }
    )
    const rawStr = typeof raw === "string" ? raw : JSON.stringify(raw)
    const jsonMatch = rawStr.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return []
    const parsed: Array<{
      address?: string
      apn?: string
      signalType?: string
      signalDate?: string
      rawData?: Record<string, unknown>
    }> = JSON.parse(jsonMatch[0])
    return parsed
      .filter(s => s.address && s.signalType && signalTypes.includes(s.signalType))
      .map(s => ({
        address: s.address!,
        apn: s.apn ?? undefined,
        county,
        signalType: s.signalType!,
        signalDate: s.signalDate ?? new Date().toISOString().split("T")[0],
        rawData: s.rawData ?? {},
        source: `ai-web-search-${county.toLowerCase().replace(/ /g, "-")}`,
      }))
  } catch {
    return []
  }
}

export const EXTRACTOR_SYSTEM = `You are a real estate public records extraction specialist.
Extract distressed property records from web search results.
Return valid JSON arrays only — no markdown fences, no explanation outside JSON.
Be conservative — only include entries with a real recognizable street address.
Never fabricate addresses. If no valid records found, return [].`
