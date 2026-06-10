// Free ATTOM replacement — finds pre-foreclosure leads using public record sources.
// Uses Tavily web search + deep content extraction + Claude AI extraction.
//
// Sources targeted (legally required public publications):
//  - Legal notice newspapers (NODs are legally required to be published)
//  - County recorder official search pages
//  - Auction.com / Bid4Assets / Xome foreclosure listings
//  - RealtyTrac / Foreclosure.com pre-foreclosure listings
//  - Zillow pre-foreclosure tagged homes
//  - HUD / Fannie Mae public REO listings
//  - Court docket sites (judicial foreclosure states)
//  - Local newspaper legal notice sections

import { webSearchAny, webSearchDeepOrAny, extractPageContent } from "@/lib/search"
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

const EXTRACT_SYSTEM = `You are a real estate data extraction specialist with deep knowledge of US foreclosure law.
Extract pre-foreclosure property listings from web search results and page content.
Return valid JSON only. Include every property you can identify — be thorough, not conservative.`

// Standard queries — broad coverage
function buildSearchQueries(area: {
  searchType: string
  zipCode?: string
  city?: string
  state?: string
  county?: string
  daysBack: number
}): string[] {
  const year = new Date().getFullYear()
  const place =
    area.searchType === "zip"
      ? `"${area.zipCode}"`
      : area.searchType === "city"
      ? `"${area.city}" "${area.state}"`
      : `"${area.county} county" "${area.state}"`

  // Derive county/city name for richer queries
  const cityOrZip =
    area.searchType === "zip"
      ? area.zipCode!
      : area.searchType === "city"
      ? `${area.city} ${area.state}`
      : `${area.county} county ${area.state}`

  return [
    // Legal notice publications — where banks MUST publish NODs by law
    `${place} "notice of default" ${year} legal notice filed property`,
    `${place} "notice of trustee's sale" OR "trustee sale" ${year} property address`,
    // Lis pendens judicial foreclosures
    `${place} "lis pendens" ${year} foreclosure filed court`,
    // Auction listing sites with property addresses
    `site:auction.com "${cityOrZip}" foreclosure property`,
    `site:xome.com "${cityOrZip}" foreclosure home`,
    // Pre-foreclosure listing aggregators
    `site:foreclosure.com "${cityOrZip}" pre-foreclosure`,
    // Zillow pre-foreclosure homes
    `site:zillow.com "${cityOrZip}" pre-foreclosure`,
    // Real estate news with specific addresses
    `${place} pre-foreclosure home owner ${year} address`,
  ]
}

// Deep queries — for raw full-page content from sources most likely to list actual addresses
function buildDeepQueries(area: {
  searchType: string
  zipCode?: string
  city?: string
  state?: string
  county?: string
}): string[] {
  const year = new Date().getFullYear()
  const countyOrCity =
    area.searchType === "zip"
      ? `zip ${area.zipCode}`
      : area.searchType === "city"
      ? `${area.city} ${area.state}`
      : `${area.county} county ${area.state}`

  // These queries are designed to hit pages that CONTAIN property address lists
  return [
    // County recorder legal notice lists — contain hundreds of addresses
    `${countyOrCity} county recorder "notice of default" ${year} list`,
    // Legal newspaper notices (legally required, contain exact addresses + owner names + lenders)
    `${countyOrCity} legal notices foreclosure "notice of default" ${year}`,
    // Foreclosure.com area page (shows property addresses directly)
    `foreclosure.com ${countyOrCity} pre-foreclosure listing ${year}`,
    // RealtyTrac listing page
    `realtytrac.com ${countyOrCity} foreclosure homes ${year}`,
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
  const queries     = buildSearchQueries(params)
  const deepQueries = buildDeepQueries(params)

  // ── Phase 1: Standard search — broad coverage at 1,500-char snippets ─────────
  const allSnippets: Array<{ query: string; title: string; url: string; content: string }> = []
  const topUrls: string[] = []

  for (let i = 0; i < queries.length; i += 2) {
    const batch = queries.slice(i, i + 2)
    const results = await Promise.allSettled(batch.map(q => webSearchAny(q, 8)))
    results.forEach((r, idx) => {
      if (r.status === "fulfilled") {
        r.value.results.forEach(sr => {
          // 1,500 chars — 3x the old limit, much more likely to include addresses
          allSnippets.push({ query: batch[idx], title: sr.title, url: sr.url, content: sr.content.slice(0, 1500) })
          if (topUrls.length < 12 && sr.url) topUrls.push(sr.url)
        })
      }
    })
    if (i + 2 < queries.length) await new Promise(r => setTimeout(r, 300))
  }

  // ── Phase 2: Deep search — full raw page content on targeted queries ──────────
  // This hits legal notice pages, county recorders, listing sites — sources with address lists
  const deepSnippets: Array<{ query: string; title: string; url: string; content: string }> = []

  for (let i = 0; i < Math.min(deepQueries.length, 4); i++) {
    try {
      const result = await webSearchDeepOrAny(deepQueries[i], 5)
      result.results.forEach(sr => {
        // Use rawContent when available (full page text) — up to 4,000 chars
        const content = sr.rawContent
          ? sr.rawContent.slice(0, 4000)
          : sr.content.slice(0, 1500)
        deepSnippets.push({ query: deepQueries[i], title: sr.title, url: sr.url, content })
        if (topUrls.length < 20 && sr.url) topUrls.push(sr.url)
      })
      await new Promise(r => setTimeout(r, 300))
    } catch {
      // continue
    }
  }

  // ── Phase 3: Direct page extraction on best URLs ──────────────────────────────
  // Pull full content from the top 6 most promising URLs (legal notice / auction sites)
  const extractionCandidates = [...new Set(topUrls)]
    .filter(u =>
      /auction\.com|foreclosure\.com|realtytrac|zillow|xome|recorder|legalnotice|publicnotice|courtrecord|trustee|deed|foreclosuredaily/i.test(u)
    )
    .slice(0, 6)

  const extractedPages: Array<{ query: string; title: string; url: string; content: string }> = []

  if (extractionCandidates.length > 0) {
    const pages = await extractPageContent(extractionCandidates)
    pages.forEach(p => {
      if (p.content.length > 100) {
        extractedPages.push({
          query: "direct page extraction",
          title: p.url,
          url:   p.url,
          content: p.content.slice(0, 5000),
        })
      }
    })
  }

  const allContent = [...allSnippets, ...deepSnippets, ...extractedPages]

  if (allContent.length === 0) return { leads: [], total: 0, source: "tavily" }

  // ── Phase 4: AI extraction from all content ───────────────────────────────────
  const areaDesc =
    params.searchType === "zip"
      ? `ZIP ${params.zipCode}`
      : params.searchType === "city"
      ? `${params.city}, ${params.state}`
      : `${params.county} County, ${params.state}`

  const extractUser = `Extract EVERY pre-foreclosure property you can find in these search results for ${areaDesc}.

Search results and page content (${allContent.length} sources):
${allContent.map((s, i) => `[${i + 1}] Source: "${s.query}"\nPage: ${s.title}\nURL: ${s.url}\n---\n${s.content}\n---`).join("\n\n")}

For EVERY property found, extract:
- address (street number + street name — required)
- city (if not mentioned, use ${params.city || params.zipCode || ""})
- state (if not mentioned, use ${params.state || ""})
- zip (use ${params.zipCode || ""} if not specified)
- ownerName (owner/borrower name if mentioned, else "")
- foreclosureStage: NOTICE_OF_DEFAULT | LIS_PENDENS | NOTICE_OF_SALE | AUCTION | PRE_FORECLOSURE
- recordingDate: YYYY-MM-DD if mentioned, else ""
- defaultAmount: number or null
- lender: lender/bank name if mentioned, else null
- auctionDate: YYYY-MM-DD if mentioned, else null
- estimatedValue: asking price or estimated value if mentioned, else null
- sourceUrl: the URL this was found in
- rawSignals: 1-3 short strings about what distress signals were found

Critical rules:
- Include EVERY property with a street address — be thorough, do not skip any
- If the same address appears multiple times, keep the entry with the most data
- If city/state/zip are not explicitly stated but can be inferred from context, fill them in
- Do NOT invent data — only use what is in the sources
- If you see a list of properties on a page, extract ALL of them, not just the first few
- Look for patterns like "123 Main St", "1234 Oak Ave", "456 Elm Blvd" in the text

Return JSON array ([] if truly nothing found):
[{ "address": "123 Main St", "city": "...", "state": "AZ", "zip": "85001", "ownerName": "...", "foreclosureStage": "NOTICE_OF_DEFAULT", "recordingDate": "", "defaultAmount": null, "lender": null, "auctionDate": null, "estimatedValue": null, "sourceUrl": "...", "rawSignals": ["notice of default filed"] }]`

  let rawLeads: FreeLead[] = []

  try {
    rawLeads = (await runAgent(EXTRACT_SYSTEM, extractUser, {
      jsonMode:  true,
      maxTokens: 8000,
      model:     "sonnet",
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
    leads:  unique.slice(0, params.maxLeads),
    total:  unique.length,
    source: "tavily",
  }
}
