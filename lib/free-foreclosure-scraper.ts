// Free ATTOM replacement — finds pre-foreclosure leads using public record sources.
// Works with Tavily (free tier: 1,000/month) + Groq/Claude (already configured).
// No paid data subscriptions required.
//
// Sources targeted:
//  - County recorder websites (NOD filings)
//  - Legal notice aggregators (published NODs / lis pendens)
//  - Auction.com / Bid4Assets (properties approaching auction)
//  - Court docket sites (judicial foreclosure states)
//  - HUD / Fannie Mae public listings
//  - Real estate listing sites (pre-foreclosure tags)

import { webSearch } from "@/lib/search"
import { runAgent } from "@/lib/claude"

export interface FreeLead {
  address: string
  city: string
  state: string
  zip: string
  ownerName: string
  foreclosureStage: "NOTICE_OF_DEFAULT" | "LIS_PENDENS" | "NOTICE_OF_SALE" | "AUCTION" | "PRE_FORECLOSURE"
  recordingDate: string
  defaultAmount: number | null
  lender: string | null
  auctionDate: string | null
  estimatedValue: number | null
  sourceUrl: string
  rawSignals: string[]
}

const EXTRACT_SYSTEM = `You are a real estate data extraction specialist.
Extract pre-foreclosure property listings from web search results.
Return valid JSON only. Be conservative — only include entries with a real street address.`

function buildSearchQueries(area: {
  searchType: string
  zipCode?: string
  city?: string
  state?: string
  county?: string
  daysBack: number
}): string[] {
  const year = new Date().getFullYear()
  const prevYear = year - 1
  const place =
    area.searchType === "zip"
      ? area.zipCode!
      : area.searchType === "city"
      ? `"${area.city}" "${area.state}"`
      : `"${area.county} county" "${area.state}"`

  return [
    // Public legal notice aggregators (where NODs are published by law)
    `${place} "notice of default" ${year} foreclosure filing`,
    `${place} "lis pendens" ${year} filed property`,
    // Auction sites (properties past NOD stage)
    `site:auction.com ${place} foreclosure ${year}`,
    `site:bid4assets.com ${place} real estate ${year}`,
    // Pre-foreclosure listing sites
    `${place} "pre-foreclosure" property listing ${year}`,
    // Court records (judicial foreclosure states)
    `${place} foreclosure lawsuit filed ${year} property owner`,
    // Legal newspaper notices
    `${place} "notice of trustee's sale" OR "notice of sheriff's sale" ${year}`,
    // Tax delinquency overlap
    `${place} delinquent property "notice of default" ${year}`,
  ]
}

export async function searchFreeForeclosures(params: {
  searchType: string
  zipCode?: string
  city?: string
  state?: string
  county?: string
  daysBack: number
  maxLeads: number
}): Promise<{ leads: FreeLead[]; total: number; source: "tavily" | "none" }> {
  if (!process.env.TAVILY_API_KEY) {
    return { leads: [], total: 0, source: "none" }
  }

  const queries = buildSearchQueries(params)

  // Run searches in parallel (2 at a time to stay within rate limits)
  const allSnippets: Array<{ query: string; title: string; url: string; content: string }> = []

  for (let i = 0; i < queries.length; i += 2) {
    const batch = queries.slice(i, i + 2)
    const results = await Promise.allSettled(batch.map(q => webSearch(q, 7)))
    results.forEach((r, idx) => {
      if (r.status === "fulfilled") {
        r.value.results.forEach(sr => {
          allSnippets.push({ query: batch[idx], title: sr.title, url: sr.url, content: sr.content.slice(0, 500) })
        })
      }
    })
    if (i + 2 < queries.length) await new Promise(r => setTimeout(r, 400))
  }

  if (allSnippets.length === 0) return { leads: [], total: 0, source: "tavily" }

  const areaDesc =
    params.searchType === "zip"
      ? `ZIP ${params.zipCode}`
      : params.searchType === "city"
      ? `${params.city}, ${params.state}`
      : `${params.county} County, ${params.state}`

  const extractUser = `Extract every pre-foreclosure property found in these web results for ${areaDesc}.

Search results:
${allSnippets.map((s, i) => `[${i + 1}] "${s.query}"\nTitle: ${s.title}\nURL: ${s.url}\nSnippet: ${s.content}`).join("\n\n")}

For each property with a real street address found, extract:
- address (street number + street name)
- city (fill in ${params.city || ""} if not mentioned)
- state (fill in ${params.state || ""} if not mentioned)
- zip (use ${params.zipCode || ""} if not mentioned)
- ownerName (owner name if mentioned, else "")
- foreclosureStage: NOTICE_OF_DEFAULT | LIS_PENDENS | NOTICE_OF_SALE | AUCTION | PRE_FORECLOSURE
- recordingDate: YYYY-MM-DD format if mentioned, else ""
- defaultAmount: number (no dollar sign) or null
- lender: lender name if mentioned, else null
- auctionDate: YYYY-MM-DD if mentioned, else null
- estimatedValue: number or null if mentioned
- sourceUrl: the URL this was found in
- rawSignals: array of 1-3 short strings describing what signals were found

Rules:
- Only include entries with a real street address (house number + street)
- Deduplicate: if the same address appears twice, keep the one with more data
- Do NOT invent data — only use what is explicitly stated in the snippets

Return JSON array (empty [] if nothing found):
[{ "address": "...", "city": "...", "state": "...", "zip": "...", "ownerName": "...", "foreclosureStage": "...", "recordingDate": "...", "defaultAmount": null, "lender": null, "auctionDate": null, "estimatedValue": null, "sourceUrl": "...", "rawSignals": [] }]`

  let rawLeads: FreeLead[] = []

  try {
    rawLeads = (await runAgent(EXTRACT_SYSTEM, extractUser, {
      jsonMode: true,
      maxTokens: 4000,
    })) as unknown as FreeLead[]
  } catch {
    return { leads: [], total: 0, source: "tavily" }
  }

  if (!Array.isArray(rawLeads)) return { leads: [], total: 0, source: "tavily" }

  // Deduplicate by normalized address
  const seen = new Set<string>()
  const unique = rawLeads.filter(l => {
    if (!l.address?.trim()) return false
    const key = (l.address + l.city).toLowerCase().replace(/\s+/g, "")
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  return {
    leads: unique.slice(0, params.maxLeads),
    total: unique.length,
    source: "tavily",
  }
}
