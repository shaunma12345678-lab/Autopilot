// Dual-mode foreclosure data engine.
// Works with ONLY Groq (already configured) — no ATTOM, no Tavily, no paid APIs.
//
// Mode "pre-foreclosure": NOD, lis pendens, late payment public records — NOT listed for sale.
//   Sources: county recorder DDG search, legal notice sites, court filings, Groq intelligence
//
// Mode "reo": Post-foreclosure bank-owned (REO) properties.
//   Sources: HUD Homestore, Fannie Mae HomePath, Freddie Mac HomeSteps, bank REO portals, Groq intelligence

import { runAgent } from "@/lib/claude"

export type SearchMode = "pre-foreclosure" | "reo"

export interface ZeroKeyLead {
  address: string
  city: string
  state: string
  zip: string
  ownerName: string
  foreclosureStage: "NOTICE_OF_DEFAULT" | "LIS_PENDENS" | "NOTICE_OF_SALE" | "AUCTION" | "PRE_FORECLOSURE" | "REO" | "BANK_OWNED"
  recordingDate: string
  defaultAmount: number | null
  estimatedValue: number | null
  lender: string | null
  bankOwner: string | null      // for REO: which bank/agency owns it now
  auctionDate: string | null
  rawSignals: string[]
  dataMode: "live" | "ai-research"
  sourceLabel: string
  mode: SearchMode
}

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
const HEADERS = { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,application/json,*/*;q=0.9" }

function today(): string { return new Date().toISOString().split("T")[0] }
function daysAgo(n: number): string { return new Date(Date.now() - n * 86400000).toISOString().split("T")[0] }

// ─── DuckDuckGo targeted search for public records ────────────────────────────

async function ddgSearch(query: string): Promise<string[]> {
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
      if (t.length > 15 && t.length < 600) snippets.push(t)
    }
    return snippets.slice(0, 30)
  } catch {
    return []
  }
}

// ─── Mode-specific DDG queries ────────────────────────────────────────────────

function buildQueries(mode: SearchMode, zip: string, city: string, state: string, daysBack: number): string[] {
  const place = zip || `${city} ${state}`
  const year = new Date().getFullYear()

  if (mode === "pre-foreclosure") {
    return [
      // County recorder public records (where NODs are actually filed)
      `"${place}" "notice of default" county recorder ${year} site:gov OR site:ca.gov OR site:maricopa.gov OR site:myflcourtsdocketfile.com`,
      // Legal notices (newspapers of record)
      `"${place}" "notice of default" OR "lis pendens" OR "notice of trustee sale" ${year} legal notice`,
      // Court filings for judicial states
      `"${place}" "lis pendens" filed court ${year} foreclosure property`,
      // General pre-foreclosure public records
      `pre-foreclosure "${place}" notice default ${year} homeowner late payments`,
    ]
  } else {
    return [
      // Bank REO listings
      `"${place}" "bank owned" OR "REO" OR "real estate owned" property ${year}`,
      // Fannie Mae and government agency properties
      `"${place}" "Fannie Mae" OR "HomePath" OR "Freddie Mac" OR "HUD" foreclosure property ${year}`,
      // Auction listings (post-foreclosure)
      `"${place}" foreclosure auction "bank owned" ${year} site:auction.com OR site:hubzu.com OR site:xome.com`,
      // Servicer REO portfolios
      `"${place}" foreclosure "bank owned" "as-is" OR "occupied" property sale ${year}`,
    ]
  }
}

// ─── HUD Homestore (REO only) ─────────────────────────────────────────────────

async function searchHUD(zip: string, state: string, max: number): Promise<ZeroKeyLead[]> {
  try {
    const url =
      `https://hudhomestore.hud.gov/WebApi/HudHomesNew/GetListingResult?` +
      `ListingState=${state}&Zip=${zip}&ML=25&MH=9000000&BR=0&BH=10&BA=0&BHA=10` +
      `&PP=${Math.min(max, 40)}&PageNo=1&SortBy=ListingDate&SortOrder=desc`
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(9000) })
    if (!res.ok) return []
    const data = await res.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const listings: any[] = data?.HudHomesList ?? data?.hudHomesList ?? []
    if (!listings.length) return []

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return listings.slice(0, max).map((l: any): ZeroKeyLead => ({
      address: String(l.PropertyAddress ?? l.propertyAddress ?? "").trim(),
      city: l.City ?? l.city ?? "",
      state: l.State ?? l.state ?? state,
      zip: l.Zip ?? l.zip ?? zip,
      ownerName: "US Dept. of Housing & Urban Development",
      foreclosureStage: "REO",
      recordingDate: (l.ListingDate ?? l.listingDate ?? "").split("T")[0] || today(),
      defaultAmount: null,
      estimatedValue: l.ListingPrice ?? l.listingPrice ?? null,
      lender: "HUD",
      bankOwner: "US Dept. of Housing & Urban Development (HUD)",
      auctionDate: null,
      rawSignals: [
        "HUD-owned REO — FHA foreclosure",
        `Listed: $${(l.ListingPrice ?? 0).toLocaleString()}`,
        `${l.Bedrooms ?? "?"}bd / ${l.Bathrooms ?? "?"}ba`,
        "May qualify for special financing programs",
      ],
      dataMode: "live",
      sourceLabel: "HUD Homestore",
      mode: "reo",
    }))
  } catch {
    return []
  }
}

// ─── Groq AI — mode-specific lead generation ─────────────────────────────────
// CRITICAL: Groq json_object mode requires { "leads": [...] } not a raw array.

const GROQ_SYSTEM = `You are a US real estate market expert with deep geographic and legal knowledge.
Generate realistic property leads based on actual market conditions. Return valid JSON only.`

async function generateLeads(params: {
  mode: SearchMode
  zip: string
  city: string
  state: string
  maxLeads: number
  daysBack: number
}): Promise<ZeroKeyLead[]> {
  const { mode, zip, city, state, maxLeads, daysBack } = params
  const count = Math.min(maxLeads, 30)
  const startDate = daysAgo(daysBack)
  const endDate = today()
  const area = city ? `${city}, ${state} (ZIP: ${zip})` : `ZIP ${zip}, ${state}`

  const prompt =
    mode === "pre-foreclosure"
      ? `Generate ${count} OFF-MARKET pre-foreclosure property leads for ${area}.

CRITICAL: These are NOT listed for sale on MLS or Zillow.
These are homeowners who are BEHIND ON PAYMENTS and heading toward foreclosure.

Data requirements:
- Use REAL street names that exist in ${city || zip}, ${state}
- Property values match actual ${state} market for this specific area
- Foreclosure stage mix: 50% NOTICE_OF_DEFAULT, 30% LIS_PENDENS, 15% NOTICE_OF_SALE, 5% PRE_FORECLOSURE
- Recording dates between ${startDate} and ${endDate}
- Default amounts = 3-18 months of missed payments (typical mortgage for the area)
- Real US lender names: Wells Fargo Bank NA, JPMorgan Chase Bank NA, Bank of America NA,
  Pennymac Loan Services LLC, Mr. Cooper (Nationstar), loanDepot, Rocket Mortgage LLC,
  Newrez LLC, PNC Bank NA, US Bank NA, Flagstar Bank NA, Freedom Mortgage Corp,
  United Wholesale Mortgage, Guild Mortgage Co, CrossCountry Mortgage
- 25% should be absentee owners (investor-owned, mailing addr differs)
- 20% corporate/LLC owners (investor properties in distress)
- Signals: specific dollar amounts, lender name, missed payment count

Return this JSON structure (Groq requires object, not array):
{
  "leads": [
    {
      "address": "1234 Real St",
      "city": "${city}",
      "state": "${state}",
      "zip": "${zip}",
      "ownerName": "SMITH JOHN D",
      "foreclosureStage": "NOTICE_OF_DEFAULT",
      "recordingDate": "2025-04-10",
      "defaultAmount": 28500,
      "estimatedValue": 485000,
      "lender": "Wells Fargo Bank NA",
      "bankOwner": null,
      "auctionDate": null,
      "rawSignals": ["NOD filed — 4 missed payments totaling $28,500", "Wells Fargo lender of record", "NOD recorded with county"]
    }
  ]
}`
      : `Generate ${count} bank-owned REO (Real Estate Owned) properties for ${area}.

These are POST-FORECLOSURE properties where the bank/agency already took the home back.
Common owners: major banks, Fannie Mae (HomePath), Freddie Mac (HomeSteps), HUD, FDIC.

Data requirements:
- Use REAL street names that exist in ${city || zip}, ${state}
- Property values match actual ${state} market for this area
- Mix of bank owners: 35% Fannie Mae, 20% Freddie Mac, 15% HUD, 30% major bank portfolios
  (Wells Fargo, Bank of America, JPMorgan Chase, Citibank, Regions, Truist, etc.)
- Foreclosure completion dates between ${startDate} and ${endDate}
- Properties typically sold at 10-30% below market value
- Various condition: some vacant, some occupied, some as-is
- Signals: bank owner name, days REO, list price if known, condition notes

Return this JSON structure:
{
  "leads": [
    {
      "address": "5678 Oak Ave",
      "city": "${city}",
      "state": "${state}",
      "zip": "${zip}",
      "ownerName": "Fannie Mae / HomePath",
      "foreclosureStage": "REO",
      "recordingDate": "2025-03-01",
      "defaultAmount": null,
      "estimatedValue": 425000,
      "lender": "Original lender: Wells Fargo",
      "bankOwner": "Fannie Mae (HomePath Program)",
      "auctionDate": null,
      "rawSignals": ["Fannie Mae HomePath REO — 60 days on market", "Priced at $425k (est. 18% below market)", "Vacant — lockbox entry"]
    }
  ]
}`

  try {
    const raw = (await runAgent(GROQ_SYSTEM, prompt, {
      jsonMode: true,
      maxTokens: 4000,
    })) as Record<string, unknown>

    const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.leads) ? (raw.leads as unknown[]) : []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (arr as any[])
      .filter((l) => l?.address?.trim().length > 5)
      .map((l) => ({
        ...l,
        dataMode: "ai-research" as const,
        sourceLabel: "AI Research Mode",
        mode,
        bankOwner: l.bankOwner ?? null,
        rawSignals: Array.isArray(l.rawSignals) ? l.rawSignals : [],
      }))
  } catch {
    return []
  }
}

// ─── Web extraction — Groq parses DDG snippets for real addresses ─────────────

async function extractFromWeb(
  snippets: string[],
  mode: SearchMode,
  zip: string,
  city: string,
  state: string
): Promise<ZeroKeyLead[]> {
  if (snippets.length < 4) return []
  const stageField =
    mode === "pre-foreclosure"
      ? `"NOTICE_OF_DEFAULT" | "LIS_PENDENS" | "NOTICE_OF_SALE" | "PRE_FORECLOSURE"`
      : `"REO" | "BANK_OWNED" | "AUCTION"`
  try {
    const raw = (await runAgent(
      "Extract real estate records from web search snippets. Return valid JSON only.",
      `Extract ${mode === "pre-foreclosure" ? "pre-foreclosure filing records" : "bank-owned REO properties"} from these snippets for ${city || zip}, ${state}.
Only include entries with a real street address (number + street name).

Snippets:
${snippets.map((s, i) => `[${i + 1}] ${s}`).join("\n")}

Return JSON object:
{
  "leads": [{
    "address": "street + number",
    "city": "${city}",
    "state": "${state}",
    "zip": "${zip}",
    "ownerName": "",
    "foreclosureStage": ${stageField},
    "recordingDate": "YYYY-MM-DD or empty",
    "defaultAmount": null,
    "estimatedValue": null,
    "lender": null,
    "bankOwner": null,
    "auctionDate": null,
    "rawSignals": ["what was found in snippet"]
  }]
}`,
      { jsonMode: true, maxTokens: 2000 }
    )) as Record<string, unknown>

    const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.leads) ? (raw.leads as unknown[]) : []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (arr as any[])
      .filter((l) => l?.address?.trim().length > 5)
      .map((l) => ({ ...l, dataMode: "live" as const, sourceLabel: "Public Web Records", mode }))
  } catch {
    return []
  }
}

// ─── Main search ──────────────────────────────────────────────────────────────

export async function searchZeroKey(params: {
  searchType: string
  zipCode?: string
  city?: string
  state?: string
  county?: string
  maxLeads: number
  daysBack: number
  mode?: SearchMode
}): Promise<{ leads: ZeroKeyLead[]; mode: "live" | "ai-research" | "mixed" }> {
  const zip = params.zipCode ?? ""
  const city = params.city ?? params.county ?? ""
  const state = params.state ?? ""
  const max = Math.min(params.maxLeads, 100)
  const searchMode: SearchMode = params.mode ?? "pre-foreclosure"

  // Build targeted queries for this mode
  const queries = buildQueries(searchMode, zip, city, state, params.daysBack)

  // Run DDG searches + HUD (for REO) in parallel
  const [ddgResults, hudLeads] = await Promise.all([
    Promise.allSettled(queries.slice(0, 3).map((q) => ddgSearch(q))),
    searchMode === "reo" ? searchHUD(zip, state, Math.ceil(max / 2)) : Promise.resolve([]),
  ])

  const allSnippets = ddgResults
    .filter((r) => r.status === "fulfilled")
    .flatMap((r) => (r as PromiseFulfilledResult<string[]>).value)

  // Extract real addresses from web results
  const webLeads = await extractFromWeb(allSnippets, searchMode, zip, city, state)

  // Combine live sources
  const seen = new Set<string>()
  const liveLeads: ZeroKeyLead[] = []
  for (const lead of [...hudLeads, ...webLeads]) {
    if (!lead.address?.trim()) continue
    const key = lead.address.toLowerCase().replace(/\W/g, "").slice(0, 15)
    if (!seen.has(key)) {
      seen.add(key)
      liveLeads.push(lead)
    }
  }

  // Always generate enough leads with Groq (guaranteed results)
  const needed = Math.max(max - liveLeads.length, Math.ceil(max * 0.7))
  const aiLeads = await generateLeads({ mode: searchMode, zip, city, state, maxLeads: needed, daysBack: params.daysBack })

  // Merge: live first, then AI
  const allLeads = [...liveLeads, ...aiLeads]
    .filter((l) => l.address?.trim().length > 5)
    .slice(0, max)

  const hasLive = liveLeads.length > 0
  const hasAI = aiLeads.length > 0
  const resultMode = hasLive && hasAI ? "mixed" : hasLive ? "live" : "ai-research"

  return { leads: allLeads, mode: resultMode }
}
