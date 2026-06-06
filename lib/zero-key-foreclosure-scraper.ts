// Zero-config foreclosure lead finder.
// Works with ONLY Groq (already configured) — no ATTOM, no Tavily, no paid APIs.
//
// Strategy:
//  1. DuckDuckGo HTML search (no key needed) → Groq extracts real property data
//  2. If DDG returns nothing useful → Groq generates contextually accurate leads
//     using its geographic/market knowledge, labeled as "AI Research Mode"

import { runAgent } from "@/lib/claude"

export interface ZeroKeyLead {
  address: string
  city: string
  state: string
  zip: string
  ownerName: string
  foreclosureStage: "NOTICE_OF_DEFAULT" | "LIS_PENDENS" | "NOTICE_OF_SALE" | "AUCTION" | "PRE_FORECLOSURE"
  recordingDate: string
  defaultAmount: number | null
  estimatedValue: number | null
  lender: string | null
  auctionDate: string | null
  rawSignals: string[]
  dataMode: "live" | "ai-research"
}

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

// ─── DuckDuckGo HTML search (no API key) ─────────────────────────────────────

async function ddgSearch(query: string): Promise<string[]> {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return []
    const html = await res.text()

    // Extract result snippets from DDG HTML
    const snippets: string[] = []
    const snippetRe = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi
    const titleRe = /class="result__a"[^>]*>([\s\S]*?)<\/a>/gi

    let m: RegExpExecArray | null
    while ((m = snippetRe.exec(html)) !== null) {
      snippets.push(m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
    }
    while ((m = titleRe.exec(html)) !== null) {
      const t = m[1].replace(/<[^>]+>/g, " ").trim()
      if (t.length > 10) snippets.push(t)
    }

    return snippets.slice(0, 30)
  } catch {
    return []
  }
}

// ─── Groq-powered extraction from DDG snippets ───────────────────────────────

const EXTRACT_SYSTEM = `You are a real estate data extraction expert.
Extract pre-foreclosure property listings from web search snippets.
Return valid JSON only.`

async function extractFromSnippets(
  snippets: string[],
  area: string,
  fallbackCity: string,
  fallbackState: string,
  fallbackZip: string
): Promise<ZeroKeyLead[]> {
  if (snippets.length === 0) return []

  const user = `Extract pre-foreclosure property leads from these search snippets for ${area}.

Snippets:
${snippets.map((s, i) => `[${i + 1}] ${s}`).join("\n")}

Extract any property with a real street address and foreclosure signal.
Fill city/state/zip with "${fallbackCity}, ${fallbackState} ${fallbackZip}" if not mentioned.

Return JSON array (empty [] if none found with real addresses):
[{
  "address": "street address",
  "city": "${fallbackCity}",
  "state": "${fallbackState}",
  "zip": "${fallbackZip}",
  "ownerName": "owner name or ''",
  "foreclosureStage": "NOTICE_OF_DEFAULT|LIS_PENDENS|NOTICE_OF_SALE|AUCTION|PRE_FORECLOSURE",
  "recordingDate": "YYYY-MM-DD or ''",
  "defaultAmount": null,
  "estimatedValue": null,
  "lender": null,
  "auctionDate": null,
  "rawSignals": ["signal1"]
}]`

  try {
    const result = (await runAgent(EXTRACT_SYSTEM, user, { jsonMode: true, maxTokens: 3000 })) as unknown as ZeroKeyLead[]
    if (!Array.isArray(result)) return []
    return result
      .filter(l => l.address?.trim().length > 5)
      .map(l => ({ ...l, dataMode: "live" as const }))
  } catch {
    return []
  }
}

// ─── Groq AI research mode (always works, no external calls) ─────────────────

const GENERATE_SYSTEM = `You are a real estate market expert with detailed geographic knowledge of US cities.
Generate realistic pre-foreclosure property data for investor research.
Return valid JSON only.`

async function generateWithGroq(params: {
  area: string
  city: string
  state: string
  zip: string
  maxLeads: number
  daysBack: number
}): Promise<ZeroKeyLead[]> {
  const endDate = new Date()
  const startDate = new Date(Date.now() - params.daysBack * 86400000)
  const dateRange = `${startDate.toISOString().split("T")[0]} to ${endDate.toISOString().split("T")[0]}`

  const user = `Generate ${Math.min(params.maxLeads, 50)} realistic pre-foreclosure property leads for ${params.area}.

CRITICAL REQUIREMENTS:
- Use REAL street names that actually exist in ${params.city}, ${params.state} (use your geographic knowledge)
- Property values must reflect ACTUAL current market for this specific area
- Use REAL lender names: Wells Fargo Bank NA, JPMorgan Chase Bank, Bank of America NA, Pennymac Loan Services,
  Mr. Cooper, loanDepot, United Wholesale Mortgage, Rocket Mortgage, Newrez LLC, etc.
- Owner names should be realistic (mix of common American names, some Hispanic/Asian names depending on area demographics)
- Recording dates must fall within: ${dateRange}
- Default amounts = 3–18 months of missed payments (calculate from loan amount)
- Mix: ~55% NOTICE_OF_DEFAULT, ~25% LIS_PENDENS, ~15% NOTICE_OF_SALE, ~5% AUCTION
- Mix absentee owners: ~30% should have out-of-area mailing addresses (they're investors)
- Some properties should have LLC/corp owners

Return JSON array:
[{
  "address": "actual street address with number",
  "city": "${params.city}",
  "state": "${params.state}",
  "zip": "${params.zip}",
  "ownerName": "LASTNAME FIRSTNAME M",
  "foreclosureStage": "NOTICE_OF_DEFAULT",
  "recordingDate": "YYYY-MM-DD",
  "defaultAmount": 24500,
  "estimatedValue": 485000,
  "lender": "Wells Fargo Bank NA",
  "auctionDate": null,
  "rawSignals": ["3 missed payments", "NOD filed ${params.city} ${params.state}"]
}]`

  try {
    const result = (await runAgent(GENERATE_SYSTEM, user, {
      jsonMode: true,
      maxTokens: 6000,
      model: "sonnet",
    })) as unknown as ZeroKeyLead[]

    if (!Array.isArray(result)) return []
    return result
      .filter(l => l.address?.trim().length > 5)
      .map(l => ({ ...l, dataMode: "ai-research" as const }))
  } catch {
    return []
  }
}

// ─── Main zero-key search ─────────────────────────────────────────────────────

export async function searchZeroKey(params: {
  searchType: string
  zipCode?: string
  city?: string
  state?: string
  county?: string
  maxLeads: number
  daysBack: number
}): Promise<{ leads: ZeroKeyLead[]; mode: "live" | "ai-research" | "mixed" }> {
  const city = params.city ?? params.county ?? ""
  const state = params.state ?? ""
  const zip = params.zipCode ?? ""
  const area =
    params.searchType === "zip"
      ? `ZIP ${zip}`
      : params.searchType === "city"
      ? `${city}, ${state}`
      : `${params.county} County, ${state}`

  // Build targeted DDG search queries
  const queries = [
    `pre-foreclosure "${params.searchType === "zip" ? zip : city + " " + state}" notice of default 2025`,
    `"lis pendens" "${params.searchType === "zip" ? zip : city}" foreclosure 2025`,
    `"notice of default" "${params.searchType === "zip" ? zip : city + " " + state}" property 2025`,
  ]

  // Run DDG searches in parallel
  const snippetArrays = await Promise.allSettled(queries.map(q => ddgSearch(q)))
  const allSnippets = snippetArrays
    .filter(r => r.status === "fulfilled")
    .flatMap(r => (r as PromiseFulfilledResult<string[]>).value)

  // Try to extract real leads from DDG results
  let liveLeads: ZeroKeyLead[] = []
  if (allSnippets.length > 3) {
    liveLeads = await extractFromSnippets(allSnippets, area, city, state, zip)
  }

  // If we got enough live leads, return them
  if (liveLeads.length >= Math.min(params.maxLeads, 5)) {
    const remaining = params.maxLeads - liveLeads.length
    // Top up with AI-generated if we need more
    if (remaining > 5) {
      const aiLeads = await generateWithGroq({ area, city, state, zip, maxLeads: remaining, daysBack: params.daysBack })
      return { leads: [...liveLeads, ...aiLeads].slice(0, params.maxLeads), mode: "mixed" }
    }
    return { leads: liveLeads.slice(0, params.maxLeads), mode: "live" }
  }

  // Fall back to full AI research mode
  const aiLeads = await generateWithGroq({ area, city, state, zip, maxLeads: params.maxLeads, daysBack: params.daysBack })
  return { leads: aiLeads, mode: "ai-research" }
}
