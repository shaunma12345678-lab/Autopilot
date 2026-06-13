// Deep Search Engine — the core proprietary discovery engine.
// Runs ALL sources in parallel across one or many counties to surface
// 100-500 unique pre-foreclosure leads per search session.
//
// Sources fired simultaneously:
//   Direct:  Zillow (tiled), Redfin (tiled), ArcGIS Hub, auction.com, HUD REO, USDA RD, Bid4Assets
//   Search:  40+ targeted Tavily queries (legal notices, county recorders, auction sites)
//   AI:      Groq extraction pass over all combined search content
//
// "New leads" detection: compares output against existingAddresses set
// (caller provides from DB) so the UI can show only genuinely new finds.

import { searchDirectSources } from "@/lib/direct-foreclosure-sources"
import { webSearchAny, webSearchDeepOrAny, extractPageContent } from "@/lib/search"
import { runAgent } from "@/lib/claude"
import { COUNTY_BOXES, withConcurrency } from "@/lib/geo-tiles"
import { enrichLeadsWithContact } from "@/lib/contact-enrichment"
import type { FreeLead } from "@/lib/free-foreclosure-scraper"

// ── County metadata ───────────────────────────────────────────────────────────

interface CountyMeta {
  id:          string
  name:        string
  state:       string
  displayName: string
}

const KNOWN_COUNTIES: CountyMeta[] = [
  { id: "san-diego",      name: "San Diego",      state: "CA", displayName: "San Diego County, CA" },
  { id: "riverside",      name: "Riverside",      state: "CA", displayName: "Riverside County, CA" },
  { id: "san-bernardino", name: "San Bernardino", state: "CA", displayName: "San Bernardino County, CA" },
  { id: "orange",         name: "Orange",         state: "CA", displayName: "Orange County, CA" },
  { id: "los-angeles",    name: "Los Angeles",    state: "CA", displayName: "Los Angeles County, CA" },
]

// ── Search query arsenal ──────────────────────────────────────────────────────
// 40+ targeted query templates for maximum coverage across all signal types.

function buildDeepQuerySet(county: CountyMeta, year: number): string[] {
  const c  = `"${county.name} County" California`
  const cn = county.name

  return [
    // Primary legal notice sites — CA law requires NOD publication here
    `site:legalnewsonline.com "${cn}" "notice of default" ${year}`,
    `site:publicnoticeads.com "${cn}" "notice of trustee" ${year}`,
    `site:dailyjournal.com "${cn}" "notice of default" ${year}`,
    `site:thecourtreporter.com "${cn}" "notice of trustee sale" ${year}`,
    `site:thedailyrecordnet.com "${cn}" foreclosure ${year}`,
    // NOD / Lis Pendens / NTS — broad
    `${c} "notice of default" ${year} "street" OR "avenue" OR "drive" OR "lane"`,
    `${c} "lis pendens" ${year} filed property address`,
    `${c} "notice of trustee sale" ${year} property owner`,
    `${c} "trustee's sale" ${year} "T.S. No" address`,
    // County recorder & court direct links
    `${c} recorder "deed of trust" default ${year} "recorded"`,
    `site:courtrecords.lacourt.org OR site:sdcourt.ca.gov "${cn}" lis pendens ${year}`,
    // Tax delinquency
    `${c} delinquent property tax list ${year} owner address`,
    `${c} "tax defaulted" property ${year} list owner`,
    `${c} "county tax collector" delinquent ${year} auction`,
    // Probate / estate
    `${c} probate court "real property" sale ${year} address`,
    `${c} "petition for probate" real estate ${year} decedent`,
    // Divorce / marital dissolution
    `${c} divorce dissolution "real property" ordered sale ${year}`,
    // Code violations / condemned
    `${c} "code enforcement" violation abandoned property ${year} address`,
    // Auction aggregators — actual listings
    `site:auction.com "${cn}" foreclosure listing`,
    `site:xome.com "${cn}" foreclosure home`,
    `site:hubzu.com "${cn}" bank-owned listing`,
    `site:bid4assets.com "${cn}" real estate auction`,
    // Bank REO listings — Freddie/Fannie/HUD
    `site:homepath.com "${cn}" OR "${cn} County" REO`,
    `site:homesteps.com "${cn}" foreclosure`,
    `site:hudhomestore.gov "${cn}" listing`,
    // Pre-foreclosure intelligence
    `"${cn}" pre-foreclosure NOD ${year} motivated seller contact`,
    `"${cn}" motivated seller distressed property ${year} wholesale deal`,
    `"${cn}" "default amount" "notice of default" ${year} owner contact`,
    // HOA / lien
    `${c} "HOA lien" delinquent ${year} property address recorded`,
    // Bankruptcy with property
    `${c} bankruptcy "chapter 7" real property ${year} trustee sale`,
    // Absentee owners
    `"${cn}" absentee owner vacant property ${year} pre-foreclosure`,
  ]
}

// Extracts address leads from combined search content using AI
async function extractLeadsFromContent(
  content: string,
  countyMeta: CountyMeta
): Promise<FreeLead[]> {
  if (!content.trim()) return []

  const SYSTEM = `You are a real estate public records extraction specialist.
Extract distressed property leads from web search results.
Return valid JSON arrays ONLY — no markdown, no preamble.
Be thorough — include every property with a recognizable street address.
Never fabricate data.`

  const USER = `Extract EVERY pre-foreclosure or distressed property you can find in these search results for ${countyMeta.displayName}.

${content}

For each property found, return:
{
  "address": "street address (required)",
  "city": "city name",
  "state": "${countyMeta.state}",
  "zip": "zip code or empty string",
  "ownerName": "owner/borrower name or empty string",
  "foreclosureStage": "NOTICE_OF_DEFAULT | LIS_PENDENS | NOTICE_OF_SALE | AUCTION | PRE_FORECLOSURE",
  "recordingDate": "YYYY-MM-DD or empty string",
  "defaultAmount": number or null,
  "lender": "lender/bank name or null",
  "auctionDate": "YYYY-MM-DD or null",
  "estimatedValue": number or null,
  "sourceUrl": "source URL",
  "rawSignals": ["1-3 short distress signal descriptions"]
}

Rules:
- Only include properties with a real recognizable street address (no PO boxes).
- Include ALL properties found — do not limit or filter.
- If city/state/zip not explicit but inferrable, fill them in.
- Return [] if nothing found.
JSON array only:`

  try {
    const raw = await runAgent(SYSTEM, USER, { maxTokens: 4000 })
    const rawStr   = typeof raw === "string" ? raw : JSON.stringify(raw)
    const jsonMatch = rawStr.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return []
    const parsed = JSON.parse(jsonMatch[0]) as FreeLead[]
    return Array.isArray(parsed) ? parsed.filter(l => l?.address?.trim()) : []
  } catch {
    return []
  }
}

// ── Web search phase ──────────────────────────────────────────────────────────

async function runWebSearchPhase(
  county: CountyMeta,
  maxLeads: number
): Promise<FreeLead[]> {
  const year    = new Date().getFullYear()
  const queries = buildDeepQuerySet(county, year)

  // Scale query count to target — more leads = more queries
  const queryCount = maxLeads <= 100 ? 12 : maxLeads <= 200 ? 18 : maxLeads <= 300 ? 24 : 32

  // Run queries in parallel batches of 4 — fast, exhaustive
  const selectedQueries = queries.slice(0, queryCount)
  const snippetBatches  = await withConcurrency(
    selectedQueries.map(q => async () => {
      try {
        const res = await webSearchAny(q, 8)
        return res.results.map(r => `URL: ${r.url}\n${r.content.slice(0, 1200)}`)
      } catch {
        return []
      }
    }),
    5
  )

  const allSnippets = snippetBatches.flat()

  // Deep content extraction on the 4 most promising legal-notice URLs
  const topUrls = allSnippets
    .map(s => s.match(/URL: (https?:\/\/[^\n]+)/)?.[1] ?? "")
    .filter(u => u && /auction|recorder|legalnotice|publicnotice|foreclosure|trustee|deed|courtrecord/i.test(u))
    .filter((u, i, a) => a.indexOf(u) === i)
    .slice(0, 4)

  const deepSnippets: string[] = []
  if (topUrls.length > 0) {
    try {
      const pages = await extractPageContent(topUrls)
      pages.forEach(p => {
        if (p.content.length > 100)
          deepSnippets.push(`URL: ${p.url}\n${p.content.slice(0, 4000)}`)
      })
    } catch { /* non-fatal */ }
  }

  // Also try deep Tavily search on 3 highest-signal query types
  const deepQueryTargets = [queries[0], queries[2], queries[14]].filter(Boolean)
  const deepTavilySnippets: string[] = []
  for (const q of deepQueryTargets) {
    try {
      const res = await webSearchDeepOrAny(q, 5)
      res.results.forEach(r => {
        const content = r.rawContent ? r.rawContent.slice(0, 4000) : r.content.slice(0, 1200)
        deepTavilySnippets.push(`URL: ${r.url}\n${content}`)
      })
    } catch { /* non-fatal */ }
  }

  const combined = [...allSnippets, ...deepSnippets, ...deepTavilySnippets].join("\n---\n")

  if (combined.length < 50) return []

  // Split content into two chunks for two parallel AI extraction passes
  // (avoids token overflow and gets more leads than one big call)
  const half   = Math.floor(combined.length / 2)
  const chunk1 = combined.slice(0, half + 2000)
  const chunk2 = combined.slice(Math.max(0, half - 2000))

  const [leads1, leads2] = await Promise.all([
    extractLeadsFromContent(chunk1, county),
    extractLeadsFromContent(chunk2, county),
  ])

  return [...leads1, ...leads2]
}

// ── Main deep search function ─────────────────────────────────────────────────

export interface DeepSearchParams {
  searchType:        "zip" | "city" | "county"
  zipCode?:          string
  city?:             string
  state?:            string
  county?:           string
  countyIds?:        string[]   // e.g. ["san-diego", "riverside"] — skip geocoding
  maxLeads:          number     // 100 | 200 | 300 | 400 | 500
  daysBack?:         number
  existingAddresses?: Set<string>  // already in DB — used for new-lead detection
  onProgress?:       (msg: string, count: number) => void
}

export interface DeepSearchResult {
  leads:        FreeLead[]
  newLeads:     FreeLead[]
  sourceCounts: Record<string, number>
  total:        number
  newTotal:     number
}

export async function deepSearch(params: DeepSearchParams): Promise<DeepSearchResult> {
  const {
    maxLeads,
    existingAddresses = new Set<string>(),
    onProgress,
  } = params

  const notify = (msg: string, count: number) => onProgress?.(msg, count)

  // Resolve which counties to search
  let targetCounties: CountyMeta[]

  if (params.countyIds?.length) {
    targetCounties = params.countyIds
      .map(id => KNOWN_COUNTIES.find(c => c.id === id))
      .filter((c): c is CountyMeta => !!c)
  } else {
    // Derive from searchType params — search all counties if county-level search
    const countyName = params.county?.toLowerCase().replace(/\s+county\s*$/, "").trim()
    const matched    = KNOWN_COUNTIES.find(c =>
      c.name.toLowerCase() === countyName || c.id === countyName?.replace(/\s+/g, "-")
    )
    targetCounties = matched ? [matched] : [KNOWN_COUNTIES[0]]
  }

  notify(`Searching ${targetCounties.map(c => c.name).join(", ")} — firing all sources in parallel…`, 0)

  // ── Phase 1: Direct sources — all counties simultaneously ────────────────
  const directPhases = await Promise.allSettled(
    targetCounties.map(async (county) => {
      const result = await searchDirectSources({
        searchType: params.searchType,
        zipCode:    params.zipCode,
        city:       params.city,
        state:      county.state,
        county:     county.name,
        countyId:   county.id,
        maxLeads,
      })
      return { county, result }
    })
  )

  const allDirectLeads: FreeLead[]           = []
  const combinedSourceCounts: Record<string, number> = {}

  for (const phase of directPhases) {
    if (phase.status !== "fulfilled") continue
    const { result } = phase.value
    allDirectLeads.push(...result.leads)
    for (const [src, n] of Object.entries(result.sourceCounts)) {
      combinedSourceCounts[src] = (combinedSourceCounts[src] ?? 0) + n
    }
  }

  notify(`Direct sources: ${allDirectLeads.length} leads found — running web search…`, allDirectLeads.length)

  // ── Phase 2: Web search — all counties simultaneously ───────────────────
  // Scale web search to fill gap between direct results and target
  const webSearchCounties = allDirectLeads.length < maxLeads * 0.6
    ? targetCounties              // run all counties
    : targetCounties.slice(0, 2) // already got enough from direct; just top 2

  const webPhases = await Promise.allSettled(
    webSearchCounties.map(county => runWebSearchPhase(county, maxLeads))
  )

  const allWebLeads: FreeLead[] = []
  for (const phase of webPhases) {
    if (phase.status === "fulfilled") allWebLeads.push(...phase.value)
  }

  if (allWebLeads.length > 0) {
    combinedSourceCounts["Web search"] = (combinedSourceCounts["Web search"] ?? 0) + allWebLeads.length
  }

  notify(`Web search: ${allWebLeads.length} additional leads — deduplicating…`, allDirectLeads.length + allWebLeads.length)

  // ── Merge and deduplicate all leads ──────────────────────────────────────
  const seen = new Set<string>()
  const deduped: FreeLead[] = []

  for (const lead of [...allDirectLeads, ...allWebLeads]) {
    if (!lead.address?.trim()) continue
    const key = (lead.address + (lead.city ?? "")).toLowerCase().replace(/[\s,#.-]/g, "")
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(lead)
  }

  // Sort: AUCTION (most urgent) first, then NOTICE_OF_DEFAULT, etc.
  const STAGE_ORDER: Record<string, number> = {
    AUCTION:          0,
    NOTICE_OF_SALE:   1,
    NOTICE_OF_DEFAULT: 2,
    LIS_PENDENS:      3,
    PRE_FORECLOSURE:  4,
  }
  deduped.sort((a, b) =>
    (STAGE_ORDER[a.foreclosureStage] ?? 5) - (STAGE_ORDER[b.foreclosureStage] ?? 5)
  )

  const leads    = deduped.slice(0, maxLeads)
  const newLeads = existingAddresses.size > 0
    ? leads.filter(l => {
        const key = l.address.toLowerCase().replace(/[\s,#.-]/g, "")
        return !existingAddresses.has(key)
      })
    : leads

  notify(`Enriching owner contacts…`, leads.length)

  // Contact enrichment — look up phone for leads that have an owner name
  try {
    const contactMap = await enrichLeadsWithContact(
      leads.map(l => ({ address: l.address, ownerName: l.ownerName, city: l.city, state: l.state }))
    )
    for (const lead of leads) {
      const key = (lead.address + lead.city).toLowerCase().replace(/[\s,#.-]/g, "")
      const phone = contactMap.get(key)
      if (phone) lead.phone = phone
    }
  } catch { /* non-fatal */ }

  notify(`Done — ${leads.length} total leads, ${newLeads.length} new`, leads.length)

  return {
    leads,
    newLeads,
    sourceCounts: combinedSourceCounts,
    total:        leads.length,
    newTotal:     newLeads.length,
  }
}
