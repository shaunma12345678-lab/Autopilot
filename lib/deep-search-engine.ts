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
import { webSearchAny } from "@/lib/search"
import { runAgent } from "@/lib/claude"
import { withConcurrency } from "@/lib/geo-tiles"
import { enrichLeadsWithContact } from "@/lib/contact-enrichment"
import { extractAddressesFromContent, leadMatchesTarget, type ExtractResult, type LocationTarget } from "@/lib/address-extractor"
import { fetchCaDojForeclosures, fetchPublicNotices } from "@/lib/legal-notice-sources"
import { enrichFreeLead } from "@/lib/lead-intelligence"
import { loadAreaCache, saveAreaCache, areaCacheKey } from "@/lib/lead-cache"
import { freeLeadHasType } from "@/lib/lead-types"
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

// Reject scraped boilerplate that isn't a real street address (auction-site
// marketing text like "No Reserve Auctions", "grossed billions", etc.).
const ADDRESS_JUNK_RX = /\b(no reserve|auctions|grossed|billion|properties and|car auction|click here|view more|learn more|opening bid|sign in|create account)\b/i

function isValidPropertyAddress(address: string | undefined): boolean {
  const a = (address ?? "").trim()
  if (a.length < 6 || a.length > 90) return false
  if (!/^\d{1,6}\s+[A-Za-z]/.test(a)) return false   // must be "<house#> <word>…"
  if (ADDRESS_JUNK_RX.test(a)) return false          // marketing boilerplate
  if ((a.match(/\d{5,}/g) ?? []).length > 1) return false  // multiple long digit runs = parsed garbage
  return true
}

// ── Query builder — works for any location ───────────────────────────────────
// `mode` controls ordering: "filings" (default) leads with foreclosure legal
// notices that reliably carry a property address — best for the normal
// pre-foreclosure search. "predictive" leads with PRE-filing early-distress
// signals — best for the forecast layer, which wants owners NOT yet in court.
function buildDeepQuerySet(loc: SearchLocation, year: number, mode: "filings" | "predictive" = "filings", leadType?: string): string[] {
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

  // Foreclosure FILINGS — already in the pipeline, carry a recorded address.
  const filings = [
    // Trustee-sale / foreclosure legal notices (these carry the property address)
    `${place} "NOTICE OF TRUSTEE'S SALE" ${year} "property address"`,
    `${place} "notice of trustee sale" ${year} property address APN`,
    `${placeLoose} "notice of default" ${year} "deed of trust" property`,
    `${place} foreclosure auction ${year} "property address" trustee`,
    `${placeLoose} "T.S. No" trustee sale ${year} street address`,
    // Verified high-yield legal-notice publishers
    `site:capublicnotice.com ${placeLoose} trustee sale ${year}`,
    `site:citynewsgroup.com ${placeLoose} trustee sale ${year}`,
    `site:publicnoticeads.com ${placeLoose} foreclosure OR trustee ${year}`,
    `site:legalnewsonline.com ${placeLoose} foreclosure ${year}`,
    // Sheriff sale / lis pendens (judicial-foreclosure states)
    `${placeLoose} "sheriff's sale" ${year} property address foreclosure`,
    `${placeLoose} "lis pendens" ${year} foreclosure property`,
    // Government & auction inventory
    `${placeLoose} "tax defaulted" OR "tax sale" property auction ${year} address`,
    `site:auction.com ${placeLoose} foreclosure`,
    `site:hubzu.com ${placeLoose} bank owned`,
    // Pre-foreclosure / motivated sellers
    `${placeLoose} pre-foreclosure ${year} "notice of default" owner property`,
    `${placeLoose} distressed property foreclosure ${year} for sale`,
    // Bank REO / government
    `${placeLoose} bank-owned REO foreclosure ${year} listing address`,
    `${placeLoose} HUD home OR "Fannie Mae" foreclosure ${year} address`,
    `${st} ${placeLoose} foreclosure homes ${year} owner address`,
    `${placeLoose} county recorder "notice of default" OR "trustee sale" ${year} document`,
  ]

  // EARLY-DISTRESS signals — owners showing trouble BEFORE any foreclosure
  // filing. These power the predictive/forecast layer.
  const early = [
    `${placeLoose} property tax delinquent OR "tax defaulted" ${year} owner list`,
    `${placeLoose} probate "real property" estate ${year} address sale`,
    `${placeLoose} code violation OR "vacant property" registry ${year} address`,
    `${placeLoose} probate estate "real property" sale ${year} address`,
    `${placeLoose} divorce "real property" OR marital home ${year} address sale`,
    `${placeLoose} eviction OR "unlawful detainer" landlord property ${year} address`,
    `${placeLoose} bankruptcy "chapter 13" OR "chapter 7" real property ${year} address`,
    `${placeLoose} inherited OR estate sale "as-is" house ${year} address`,
    `${placeLoose} vacant OR abandoned house ${year} owner address for sale`,
    `${placeLoose} "must sell" OR "as-is" OR "cash only" distressed home ${year} address`,
    `${placeLoose} absentee owner OR out-of-state landlord tired ${year} property address`,
    `${placeLoose} fire OR water damage OR fixer-upper house ${year} address`,
    `${placeLoose} "for sale by owner" FSBO motivated ${year} address`,
    `${placeLoose} expired OR withdrawn listing distressed ${year} property address`,
    `${placeLoose} "free and clear" OR "no mortgage" owner property ${year} address sell`,
    `${placeLoose} tired landlord OR "rental property" owner selling as-is ${year} address`,
    `${placeLoose} long-time owner OR "owned since" absentee out-of-state property ${year} address`,
    `${placeLoose} abandoned OR "zombie property" OR boarded-up house ${year} address`,
    `${placeLoose} "owner unknown" OR "owner deceased" vacant tax delinquent property ${year} address`,
  ]

  // Targeted lead-type focus — when the user wants a SPECIFIC kind of deal
  // (e.g. 100 probate leads), lead with queries aimed at that category so far
  // more of that type surfaces, then fall back to the rest for fill.
  if (leadType) {
    const cat: Record<string, string[]> = {
      probate: [
        `${placeLoose} probate "real property" estate ${year} address sale`,
        `${placeLoose} inherited house OR "estate sale" "as-is" ${year} address`,
        `${placeLoose} deceased owner OR heir property ${year} address for sale`,
        `${placeLoose} probate court real estate ${year} ${st} address`,
      ],
      taxdelq: [
        `${placeLoose} property tax delinquent list ${year} owner address`,
        `${placeLoose} "tax defaulted" OR "tax sale" property ${year} address`,
        `${placeLoose} treasurer back taxes owed property ${year} address`,
      ],
      vacant: [
        `${placeLoose} vacant property registry ${year} address`,
        `${placeLoose} abandoned OR boarded-up OR "zombie property" house ${year} address`,
        `${placeLoose} code enforcement vacant building ${year} address`,
      ],
      absentee: [
        `${placeLoose} absentee owner OR out-of-state landlord ${year} property address`,
        `${placeLoose} non-owner occupied rental ${year} owner address`,
        `${placeLoose} tired landlord selling rental ${year} address`,
      ],
      liens: [
        `${placeLoose} property tax lien OR judgment lien ${year} address`,
        `${placeLoose} mechanics lien OR HOA lien ${year} property address`,
        `${placeLoose} IRS OR state tax lien real property ${year} address`,
      ],
      code: [
        `${placeLoose} code violation OR condemned property ${year} address`,
        `${placeLoose} nuisance abatement OR unsafe building ${year} address`,
      ],
      divorce: [
        `${placeLoose} divorce "real property" OR marital home ${year} address sale`,
        `${placeLoose} dissolution of marriage property ${year} address`,
      ],
      eviction: [
        `${placeLoose} eviction OR "unlawful detainer" landlord property ${year} address`,
        `${placeLoose} tired landlord OR problem tenant selling ${year} address`,
      ],
      bankruptcy: [
        `${placeLoose} bankruptcy "chapter 13" OR "chapter 7" real property ${year} address`,
        `${placeLoose} bankruptcy estate home ${year} ${st} address`,
      ],
      motivated: [
        `${placeLoose} motivated seller "as-is" OR "must sell" ${year} house address`,
        `${placeLoose} "cash only" OR fixer-upper OR "price reduced" distressed ${year} address`,
        `${placeLoose} fire OR water damage house ${year} address for sale`,
      ],
      highequity: [
        `${placeLoose} "free and clear" OR "no mortgage" owner property ${year} address sell`,
        `${placeLoose} long-time owner OR "owned since" high equity property ${year} address`,
      ],
      foreclosure: filings,
      predicted: early,
    }
    const focus = cat[leadType]
    if (focus && focus.length) {
      const rest = leadType === "predicted" ? filings : early
      return [...focus, ...filings, ...rest].filter((q, i, a) => a.indexOf(q) === i)
    }
  }

  return mode === "predictive" ? [...early, ...filings] : [...filings, ...early]
}

// Category focus for targeted extraction + a signal tag so classifyLead matches.
const CATEGORY_FOCUS: Record<string, { focus: string; signal: string }> = {
  probate:    { focus: "PROBATE / estate / inherited / deceased-owner",     signal: "Probate / inherited estate" },
  eviction:   { focus: "eviction / unlawful-detainer / tired-landlord",     signal: "Eviction / tired landlord" },
  divorce:    { focus: "divorce / marital-dissolution",                     signal: "Divorce dissolution" },
  bankruptcy: { focus: "bankruptcy (chapter 7 / 13)",                       signal: "Bankruptcy filing" },
  code:       { focus: "code-violation / condemned / nuisance",             signal: "Code violation" },
  taxdelq:    { focus: "tax-delinquent / tax-defaulted",                    signal: "Tax delinquent" },
  vacant:     { focus: "vacant / abandoned",                                signal: "Vacant abandoned" },
  liens:      { focus: "lien / judgment",                                   signal: "Lien judgment" },
}

// AI extraction — secondary pass over capped content for any location.
async function extractLeadsFromContent(content: string, locLabel: string, category?: string): Promise<FreeLead[]> {
  if (!content.trim()) return []
  const cat = category ? CATEGORY_FOCUS[category] : undefined

  const SYSTEM = `You are a real estate public records extraction specialist.
Extract distressed property leads from web search results.
Return valid JSON arrays ONLY — no markdown, no preamble.
Be thorough — include every property with a recognizable street address.
Never fabricate data.`

  const USER = `Extract EVERY ${cat ? `${cat.focus} property` : "pre-foreclosure, foreclosure, trustee-sale, or distressed property"} with a street address from these search results (target area: ${locLabel}).

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
    if (!Array.isArray(parsed)) return []
    const cleaned = parsed.filter(l => l?.address?.trim())
    // Tag with the category signal so classifyLead recognizes the targeted type.
    if (cat) for (const l of cleaned) l.rawSignals = [cat.signal, ...(l.rawSignals ?? [])].slice(0, 3)
    return cleaned
  } catch {
    return []
  }
}

// ── Public-records / legal-notice phase (NO API KEY) ─────────────────────────
// Sources that serve plain HTML/JSON and work from datacenter IPs:
//   • CA DOJ official foreclosure-sale registry (statewide, government)
//   • State public-notice publications (legal NOD / trustee-sale notices)
//   • Free web search (DDG/Bing) as an opportunistic bonus — regex-extracted
// Returns ALL extracted leads tagged for relevance — caller filters/prioritizes.
async function runWebSearchPhase(
  loc: SearchLocation,
  maxLeads: number,
  mode: "filings" | "predictive" = "filings",
  leadType?: string
): Promise<{ regex: ExtractResult[]; ai: FreeLead[] }> {
  const year    = new Date().getFullYear()
  const queries = buildDeepQuerySet(loc, year, mode, leadType)
  const isCA    = (loc.state || "").toUpperCase() === "CA"

  // Public-notice query — category-aware so a probate/eviction/etc. search hits
  // the relevant legal notices, not just trustee-sale notices.
  const CATEGORY_NOTICE_TERMS: Record<string, string> = {
    probate:    "probate notice estate administer creditors real property",
    eviction:   "unlawful detainer eviction notice property",
    divorce:    "dissolution of marriage real property notice",
    bankruptcy: "bankruptcy notice real property estate",
    code:       "code violation abatement condemned notice property",
    taxdelq:    "tax delinquent defaulted property sale notice",
    liens:      "lien judgment notice property",
    vacant:     "vacant abandoned property notice registry",
  }
  const placePart =
    loc.searchType === "zip"  ? `${loc.zipCode}` :
    loc.searchType === "city" ? `${loc.city} ${loc.state}` :
    `${loc.county} County ${loc.state}`
  const noticeTerms = (leadType && CATEGORY_NOTICE_TERMS[leadType]) || "notice of trustee sale default"
  const noticeQuery = `${placePart} ${noticeTerms} ${year}`

  // Fire official + public-notice fetchers and free web searches in parallel.
  // Wider net than before so a small-city search still works toward the
  // requested volume instead of stopping at a handful of leads.
  const queryCount = maxLeads <= 100 ? 12 : maxLeads <= 200 ? 18 : maxLeads <= 400 ? 24 : 30
  const selectedQueries = queries.slice(0, queryCount)

  const [caDoj, publicNotices, webBatches] = await Promise.all([
    isCA ? fetchCaDojForeclosures() : Promise.resolve([] as ExtractResult[]),
    fetchPublicNotices(noticeQuery, loc.state || "CA"),
    // Free web search (no key): DDG → Bing. Often blocked from datacenter, so
    // best-effort — whatever comes back is regex-mined for addresses.
    withConcurrency(
      selectedQueries.map(q => async () => {
        try {
          const res = await webSearchAny(q, 8)
          return res.results.map(r => ({ url: r.url, raw: `${r.title}\n${r.content}` }))
        } catch {
          return []
        }
      }),
      8
    ),
  ])

  const webResults = webBatches.flat().filter(r => r.raw.length > 40)
  const webRegex: ExtractResult[] = []
  for (const { url, raw } of webResults) {
    webRegex.push(...extractAddressesFromContent(raw.slice(0, 400_000), url))
  }

  const regex = [...caDoj, ...publicNotices, ...webRegex]

  // AI extraction is best-effort only (Groq free tier rate-limits); regex is
  // the primary producer. Cap hard at 8s so it can never stall the search.
  const combined = webResults.map(r => `URL: ${r.url}\n${r.raw.slice(0, 4000)}`).join("\n---\n")
  let ai: FreeLead[] = []
  if (combined.length > 200) {
    ai = await Promise.race([
      extractLeadsFromContent(combined.slice(0, 14000), loc.label, leadType),
      new Promise<FreeLead[]>(resolve => setTimeout(() => resolve([]), 8000)),
    ])
  }

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
  mode?:             "filings" | "predictive"  // query bias; "filings" = normal search
  leadType?:         string        // focus a specific motivated-seller category
  businessId?:       string        // when set, merge/persist a per-area lead cache
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
        leadType:   params.leadType,
      }))
    ),
    28000,
    [] as PromiseSettledResult<Awaited<ReturnType<typeof searchDirectSources>>>[]
  )

  const webWork = withDeadline(
    Promise.allSettled(locations.map(loc => runWebSearchPhase(loc, maxLeads, params.mode ?? "filings", params.leadType))),
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

  // Geographic pool — keep results in the SEARCHED AREA so the leads are
  // actually where you searched, not scattered across the state. We define the
  // local region by ZIP-3 prefix, derived from: the searched ZIP, the exact
  // city matches, and the bbox-based direct-source leads (which are already
  // local). We only widen to the rest of the state if that local pool is too
  // thin to be useful, and never cross into another state.
  const targetState = (target.state || "").toUpperCase()
  const statePool   = targetState ? allRegex.filter(r => r.state === targetState) : allRegex

  const localZip3 = new Set<string>()
  if (target.zipCode) localZip3.add(target.zipCode.slice(0, 3))
  for (const r of allRegex)        if (leadMatchesTarget(r, target) && r.zip) localZip3.add(r.zip.slice(0, 3))
  for (const l of allDirectLeads)  if (l.zip) localZip3.add(l.zip.slice(0, 3))

  const inRegion = (r: ExtractResult) => leadMatchesTarget(r, target) || (!!r.zip && localZip3.has(r.zip.slice(0, 3)))
  const regionPool = localZip3.size > 0 ? statePool.filter(inRegion) : []

  // Always provide region-first, then the rest of the state, so we can fill all
  // the way to the requested maxLeads. The localityRank sort + final slice keep
  // the searched area on top and trim to the requested count — so choosing 100
  // returns 100 (local first) whenever that many leads exist at all.
  const chosenRegex = regionPool.length > 0
    ? [...regionPool, ...statePool.filter(r => !inRegion(r))]
    : (statePool.length > 0 ? statePool : allRegex)
  const regexLeads = chosenRegex.map(r => r.lead)

  const allWebLeads = [...regexLeads, ...allAiLeads]
  if (allWebLeads.length > 0) {
    combinedSourceCounts["Public records & notices"] = (combinedSourceCounts["Public records & notices"] ?? 0) + allWebLeads.length
  }

  notify(`Found ${allDirectLeads.length + allWebLeads.length} raw leads — deduplicating…`, allDirectLeads.length + allWebLeads.length)

  // ── Merge and deduplicate all leads ──────────────────────────────────────
  const seen = new Set<string>()
  const deduped: FreeLead[] = []

  for (const lead of [...allWebLeads, ...allDirectLeads]) {
    if (!isValidPropertyAddress(lead.address)) continue
    const key = (lead.address + (lead.city ?? "")).toLowerCase().replace(/[\s,#.-]/g, "")
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(lead)
  }

  // Merge the persistent per-area cache so a flaky run (sources rate-limited
  // this time) never collapses the count — fresh leads win on dedupe, cached
  // ones fill the rest. The cache resolves its own business id, so it works on
  // every normal (not predictive) search. Best-effort.
  const cacheable = (params.mode ?? "filings") !== "predictive"
  const cacheKey  = areaCacheKey({ searchType: primary.searchType, zipCode: primary.zipCode, city: primary.city, county: primary.county, state: primary.state })
  // Leads found on THIS run (before cache merge) → their "last seen" resets to
  // now; older cached leads keep their timestamp so stale deals age out.
  const freshKeys = new Set(seen)
  if (cacheable) {
    const cached = await loadAreaCache(cacheKey, params.businessId)
    for (const lead of cached) {
      if (!isValidPropertyAddress(lead.address)) continue
      const key = (lead.address + (lead.city ?? "")).toLowerCase().replace(/[\s,#.-]/g, "")
      if (seen.has(key)) continue
      seen.add(key)
      deduped.push(lead)
    }
  }

  // Locality rank — the user's exact city/zip first, then same-region, then the
  // rest of the state. Primary sort key so when we slice to maxLeads the leads
  // closest to what was searched are never dropped in favor of far-away ones.
  const tCity  = (target.city || "").toLowerCase()
  const tZip3  = target.zipCode?.slice(0, 3)
  const localityRank = (l: FreeLead): number => {
    if (target.searchType === "zip" && target.zipCode) {
      if (l.zip === target.zipCode) return 0
      if (tZip3 && l.zip?.slice(0, 3) === tZip3) return 1
    } else if (target.searchType === "city" && tCity) {
      const c = (l.city || "").toLowerCase()
      if (c === tCity || c.includes(tCity)) return 0
    }
    // Immediate region (same ZIP-3 as the searched area) ranks above the rest
    // of the state, so statewide fill (incl. statewide direct sources) is the
    // last to survive the slice — the map stays on the area you searched.
    if (localZip3.size > 0 && l.zip && localZip3.has(l.zip.slice(0, 3))) return 1
    return 2
  }

  // Sort: locality first, then AUCTION (most urgent) → NOTICE_OF_SALE → NOD, etc.
  const STAGE_ORDER: Record<string, number> = {
    AUCTION:          0,
    NOTICE_OF_SALE:   1,
    NOTICE_OF_DEFAULT: 2,
    LIS_PENDENS:      3,
    PRE_FORECLOSURE:  4,
  }
  // When a specific lead type is targeted, matches come first so they survive
  // the slice to maxLeads — then locality, then stage urgency.
  const typeRank = (l: FreeLead) => (params.leadType && freeLeadHasType(l, params.leadType) ? 0 : 1)
  deduped.sort((a, b) =>
    (typeRank(a) - typeRank(b)) ||
    (localityRank(a) - localityRank(b)) ||
    ((STAGE_ORDER[a.foreclosureStage] ?? 5) - (STAGE_ORDER[b.foreclosureStage] ?? 5))
  )

  const leads    = deduped.slice(0, maxLeads)

  // Persist the merged pool (fresh ∪ cached) so the area's lead count keeps
  // growing and never collapses on a later flaky run. Fire-and-forget.
  if (cacheable && deduped.length > 0) {
    void saveAreaCache(cacheKey, deduped, freshKeys, params.businessId)
  }

  // ── Intelligence pass — zero-cost, never-throws enrichment of every lead ──
  // Computes auction countdowns, sweeps for junior liens, and surfaces urgency.
  // Wrapped per-lead so a single bad parse can never break the search.
  for (const lead of leads) {
    try { enrichFreeLead(lead) } catch { /* best-effort */ }
  }

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
