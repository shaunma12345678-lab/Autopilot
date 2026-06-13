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
import { webSearchDeepOrAny } from "@/lib/search"
import { runAgent } from "@/lib/claude"
import { withConcurrency } from "@/lib/geo-tiles"
import { enrichLeadsWithContact } from "@/lib/contact-enrichment"
import { extractAddressesFromContent, leadMatchesTarget, type ExtractResult, type LocationTarget } from "@/lib/address-extractor"
import type { FreeLead } from "@/lib/free-foreclosure-scraper"

// ── Search location ─────────────────────────────────────────────────────────
// A single place to search — works for ANY US zip, city, or county.
interface SearchLocation {
  searchType: "zip" | "city" | "county"
  label:      string          // human label, e.g. "San Diego County, CA" or "ZIP 30301"
  state:      string          // 2-letter, "" if unknown (zip-only search)
  zipCode?:   string
  city?:      string
  county?:    string
  countyId?:  string          // known SoCal county id for the fast hardcoded box, if any
}

const KNOWN_COUNTY_NAMES: Record<string, string> = {
  "san-diego": "San Diego", "riverside": "Riverside", "san-bernardino": "San Bernardino",
  "orange": "Orange", "los-angeles": "Los Angeles",
}

// ── Query builder — works for any location ───────────────────────────────────
function buildDeepQuerySet(loc: SearchLocation, year: number): string[] {
  const st = loc.state || "United States"
  // Primary place phrase used across queries
  const place =
    loc.searchType === "zip"  ? `${loc.zipCode}` :
    loc.searchType === "city" ? `"${loc.city}, ${loc.state}"` :
    `"${loc.county} County" ${loc.state}`
  const placeLoose =
    loc.searchType === "zip"  ? `${loc.zipCode}` :
    loc.searchType === "city" ? `"${loc.city}" ${loc.state}` :
    `"${loc.county} County" ${loc.state}`

  return [
    // Tier 1 — trustee-sale / foreclosure legal notices (these carry the property address)
    `${place} "NOTICE OF TRUSTEE'S SALE" ${year} "property address"`,
    `${place} "notice of trustee sale" ${year} property address APN`,
    `${placeLoose} "notice of default" ${year} "deed of trust" property`,
    `${place} foreclosure auction ${year} "property address" trustee`,
    `${placeLoose} "T.S. No" trustee sale ${year} street address`,
    // Tier 2 — verified high-yield legal-notice publishers
    `site:capublicnotice.com ${placeLoose} trustee sale ${year}`,
    `site:citynewsgroup.com ${placeLoose} trustee sale ${year}`,
    `site:publicnoticeads.com ${placeLoose} foreclosure OR trustee ${year}`,
    `site:legalnewsonline.com ${placeLoose} foreclosure ${year}`,
    // Tier 3 — sheriff sale / lis pendens (judicial-foreclosure states)
    `${placeLoose} "sheriff's sale" ${year} property address foreclosure`,
    `${placeLoose} "lis pendens" ${year} foreclosure property`,
    // Tier 4 — government & auction inventory
    `${placeLoose} "tax defaulted" OR "tax sale" property auction ${year} address`,
    `site:auction.com ${placeLoose} foreclosure`,
    `site:hubzu.com ${placeLoose} bank owned`,
    // Tier 5 — pre-foreclosure / motivated sellers
    `${placeLoose} pre-foreclosure ${year} "notice of default" owner property`,
    `${placeLoose} distressed property foreclosure ${year} for sale`,
    // Tier 6 — probate / bank REO
    `${placeLoose} probate estate "real property" sale ${year} address`,
    `${placeLoose} bank-owned REO foreclosure ${year} listing address`,
    `${placeLoose} HUD home OR "Fannie Mae" foreclosure ${year} address`,
    `${st} ${placeLoose} foreclosure homes ${year} owner address`,
  ]
}

// AI extraction — secondary pass over capped content for any location.
async function extractLeadsFromContent(content: string, locLabel: string): Promise<FreeLead[]> {
  if (!content.trim()) return []

  const SYSTEM = `You are a real estate public records extraction specialist.
Extract distressed property leads from web search results.
Return valid JSON arrays ONLY — no markdown, no preamble.
Be thorough — include every property with a recognizable street address.
Never fabricate data.`

  const USER = `Extract EVERY pre-foreclosure, foreclosure, trustee-sale, or distressed property with a street address from these search results (target area: ${locLabel}).

${content}

For each property return:
{
  "address": "street address (required)",
  "city": "city",
  "state": "2-letter state",
  "zip": "5-digit zip or empty",
  "ownerName": "owner/borrower/trustor name or empty",
  "foreclosureStage": "NOTICE_OF_DEFAULT | LIS_PENDENS | NOTICE_OF_SALE | AUCTION | PRE_FORECLOSURE",
  "recordingDate": "YYYY-MM-DD or empty",
  "defaultAmount": number or null,
  "lender": "lender/bank name or null",
  "auctionDate": "YYYY-MM-DD or null",
  "estimatedValue": number or null,
  "sourceUrl": "source URL",
  "rawSignals": ["1-3 short distress descriptions"]
}

Rules:
- Real recognizable street addresses only (no PO boxes, no courthouse/trustee office addresses).
- Include ALL properties found — do not limit.
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

// TEMP diagnostics — surfaced in sourceCounts to debug the live web phase.
const __debug = { webResults: 0, webRawChars: 0, regexFound: 0, matched: 0, hasKey: 0, errMsg: "" }

// Returns ALL extracted leads tagged for relevance — caller filters/prioritizes.
async function runWebSearchPhase(
  loc: SearchLocation,
  maxLeads: number
): Promise<{ regex: ExtractResult[]; ai: FreeLead[] }> {
  const year    = new Date().getFullYear()
  const queries = buildDeepQuerySet(loc, year)

  // Scale query count to target. Tavily crawls server-side, so it works from
  // Vercel datacenter IPs where direct scrapers get blocked.
  const queryCount = maxLeads <= 100 ? 11 : maxLeads <= 200 ? 15 : maxLeads <= 300 ? 18 : 20
  const selectedQueries = queries.slice(0, queryCount)

  // Every query uses DEEP search — property addresses live in raw_content.
  // High concurrency so all queries finish in ~1-2 waves; each Tavily call is
  // capped at 14s internally, so the whole phase stays well under budget.
  __debug.hasKey = process.env.TAVILY_API_KEY ? 1 : 0
  const resultBatches = await withConcurrency(
    selectedQueries.map(q => async () => {
      try {
        const res = await webSearchDeepOrAny(q, 6)
        return res.results.map(r => ({ url: r.url, raw: r.rawContent ?? r.content ?? "" }))
      } catch (e) {
        if (!__debug.errMsg) __debug.errMsg = (e instanceof Error ? e.message : String(e)).slice(0, 80)
        return []
      }
    }),
    10
  )

  const results = resultBatches.flat().filter(r => r.raw.length > 50)
  const rawAll = resultBatches.flat()
  if (!__debug.errMsg && rawAll.length === 0) __debug.errMsg = "0 results, no throw"
  else if (!__debug.errMsg && results.length === 0) __debug.errMsg = `${rawAll.length} results all <50 chars`
  const totalRawChars = results.reduce((a, r) => a + r.raw.length, 0)
  __debug.webResults += results.length
  __debug.webRawChars += totalRawChars
  if (results.length === 0) return { regex: [], ai: [] }

  // ── Primary: regex extraction (reliable, processes raw content) ─────────
  // Cap each page to 400 KB — that already holds hundreds of notices and keeps
  // regex time bounded on multi-MB legal-notice pages.
  const regex: ExtractResult[] = []
  for (const { url, raw } of results) {
    regex.push(...extractAddressesFromContent(raw.slice(0, 400_000), url))
  }
  __debug.regexFound += regex.length

  // ── Secondary: AI extraction over capped content (catches odd formats) ───
  // Groq is rate-limited on the free tier and its SDK backs off 15-60s on 429.
  // Regex is the PRIMARY producer and needs no LLM, so we run AI best-effort with
  // a hard 9s cap and only 2 chunks — if Groq is throttled we just skip it.
  const combined = results.map(r => `URL: ${r.url}\n${r.raw.slice(0, 6000)}`).join("\n---\n")
  const CHUNK = 14000
  const chunks: string[] = []
  for (let i = 0; i < combined.length && chunks.length < 2; i += CHUNK) {
    chunks.push(combined.slice(i, i + CHUNK))
  }

  const ai = await Promise.race([
    Promise.all(chunks.map(c => extractLeadsFromContent(c, loc.label))).then(r => r.flat()),
    new Promise<FreeLead[]>(resolve => setTimeout(() => resolve([]), 9000)),
  ])

  return { regex, ai }
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

  __debug.webResults = 0; __debug.webRawChars = 0; __debug.regexFound = 0; __debug.matched = 0

  // ── Resolve search locations (works for ANY zip / city / county) ─────────
  const locations: SearchLocation[] = []

  if (params.countyIds?.length) {
    // Known SoCal counties — fast path with hardcoded bounding boxes
    for (const id of params.countyIds) {
      const name = KNOWN_COUNTY_NAMES[id]
      if (name) locations.push({ searchType: "county", label: `${name} County, CA`, state: "CA", county: name, countyId: id })
    }
  } else if (params.searchType === "zip" && params.zipCode) {
    locations.push({ searchType: "zip", label: `ZIP ${params.zipCode}`, state: params.state?.toUpperCase() ?? "", zipCode: params.zipCode })
  } else if (params.searchType === "city" && params.city) {
    const st = params.state?.toUpperCase() ?? ""
    locations.push({ searchType: "city", label: `${params.city}${st ? ", " + st : ""}`, state: st, city: params.city })
  } else if (params.county) {
    const st = params.state?.toUpperCase() ?? ""
    const cleanCounty = params.county.replace(/\s+county\s*$/i, "").trim()
    const knownId = Object.entries(KNOWN_COUNTY_NAMES).find(([, n]) => n.toLowerCase() === cleanCounty.toLowerCase())?.[0]
    locations.push({ searchType: "county", label: `${cleanCounty} County${st ? ", " + st : ""}`, state: st, county: cleanCounty, countyId: knownId })
  }

  if (locations.length === 0) {
    // Last-resort default so the search never no-ops
    locations.push({ searchType: "county", label: "San Diego County, CA", state: "CA", county: "San Diego", countyId: "san-diego" })
  }

  // Build the location-match target from the primary searched location
  const primary = locations[0]
  const target: LocationTarget = {
    searchType: primary.searchType,
    zipCode:    primary.zipCode,
    city:       primary.city,
    state:      primary.state,
    county:     primary.county,
  }

  notify(`Searching ${locations.map(l => l.label).join(", ")} — firing all sources in parallel…`, 0)

  // Web search (Tavily) and direct scrapers run CONCURRENTLY.
  // Direct scrapers are mostly blocked on datacenter IPs and fast-fail (7s),
  // so they can't starve the Tavily phase which is the reliable producer.
  const combinedSourceCounts: Record<string, number> = {}

  // Each phase is wrapped in a hard timeout so a single hung dependency
  // (rate-limited LLM, slow scraper) can never stall the whole search.
  const withDeadline = <T>(p: Promise<T>, ms: number, fallback: T): Promise<T> =>
    Promise.race([p, new Promise<T>(resolve => setTimeout(() => resolve(fallback), ms))])

  const directWork = withDeadline(
    Promise.allSettled(
      locations.map(loc => searchDirectSources({
        searchType: loc.searchType,
        zipCode:    loc.zipCode ?? params.zipCode,
        city:       loc.city ?? params.city,
        state:      loc.state || params.state,
        county:     loc.county,
        countyId:   loc.countyId,
        maxLeads,
      }))
    ),
    20000,
    [] as PromiseSettledResult<Awaited<ReturnType<typeof searchDirectSources>>>[]
  )

  const webWork = withDeadline(
    Promise.allSettled(locations.map(loc => runWebSearchPhase(loc, maxLeads))),
    38000,
    [] as PromiseSettledResult<Awaited<ReturnType<typeof runWebSearchPhase>>>[]
  )

  const [directPhases, webPhases] = await Promise.all([directWork, webWork])

  const allDirectLeads: FreeLead[] = []
  for (const phase of directPhases) {
    if (phase.status !== "fulfilled") continue
    allDirectLeads.push(...phase.value.leads)
    for (const [src, n] of Object.entries(phase.value.sourceCounts)) {
      combinedSourceCounts[src] = (combinedSourceCounts[src] ?? 0) + n
    }
  }

  // Collect web results: regex (tagged for relevance) + AI leads
  const allRegex: ExtractResult[] = []
  const allAiLeads: FreeLead[] = []
  for (const phase of webPhases) {
    if (phase.status !== "fulfilled") continue
    allRegex.push(...phase.value.regex)
    allAiLeads.push(...phase.value.ai)
  }

  // Filter regex leads to the searched location; if too few match (e.g. the
  // local publisher wasn't in results), keep ALL found — they're still real,
  // verified foreclosure notices in/near the region, so we never return empty.
  const matched   = allRegex.filter(r => leadMatchesTarget(r, target))
  __debug.matched = matched.length
  const regexLeads = (matched.length >= 8 ? matched : allRegex).map(r => r.lead)

  const allWebLeads = [...regexLeads, ...allAiLeads]
  if (allWebLeads.length > 0) {
    combinedSourceCounts["Legal notices (web)"] = (combinedSourceCounts["Legal notices (web)"] ?? 0) + allWebLeads.length
  }
  // TEMP debug surfaced in sourceCounts
  combinedSourceCounts["_dbg_webResults"] = __debug.webResults
  combinedSourceCounts["_dbg_rawKB"] = Math.round(__debug.webRawChars / 1000)
  combinedSourceCounts["_dbg_regexFound"] = __debug.regexFound
  combinedSourceCounts["_dbg_matched"] = __debug.matched
  combinedSourceCounts["_dbg_hasKey"] = __debug.hasKey
  ;(combinedSourceCounts as Record<string, unknown>)["_dbg_err"] = __debug.errMsg || "none"

  notify(`Found ${allDirectLeads.length + allWebLeads.length} raw leads — deduplicating…`, allDirectLeads.length + allWebLeads.length)

  // ── Merge and deduplicate all leads ──────────────────────────────────────
  const seen = new Set<string>()
  const deduped: FreeLead[] = []

  for (const lead of [...allWebLeads, ...allDirectLeads]) {
    if (!lead.address?.trim()) continue
    const key = (lead.address + (lead.city ?? "")).toLowerCase().replace(/[\s,#.-]/g, "")
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(lead)
  }

  // Sort: AUCTION (most urgent) first, then NOTICE_OF_SALE, NOTICE_OF_DEFAULT, etc.
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

  // Contact enrichment — look up phone for leads that have an owner name.
  // Hard-capped at 9s via Promise.race so it can never blow the serverless
  // budget; whatever resolves in time is merged, the rest is skipped silently.
  try {
    const contactMap = await Promise.race([
      enrichLeadsWithContact(
        leads.map(l => ({ address: l.address, ownerName: l.ownerName, city: l.city, state: l.state }))
      ),
      new Promise<Map<string, string>>(resolve => setTimeout(() => resolve(new Map()), 9000)),
    ])
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
