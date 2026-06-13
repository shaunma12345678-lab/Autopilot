// Regex-based address extractor for legal-notice raw content (nationwide).
//
// Foreclosure notices (NOD / Notice of Trustee Sale / Sheriff Sale) legally must
// publish the full property address using canonical labels:
//   • "Property Address: <addr>"
//   • "...street address ... purported to be: <addr>"
//   • "...commonly known as: <addr>"
// Plus any inline "<num> <street>, <City>, <ST> <zip>" address.
// We pull these directly from Tavily raw_content — far more reliable than asking
// an LLM to find them in tens of KB of legal boilerplate. The LLM is a second pass.

import type { FreeLead } from "@/lib/free-foreclosure-scraper"

// ── US state validation ────────────────────────────────────────────────────────
const US_STATES = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS",
  "KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY",
  "NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC",
])

const STATE_NAME_TO_CODE: Record<string, string> = {
  alabama:"AL",alaska:"AK",arizona:"AZ",arkansas:"AR",california:"CA",colorado:"CO",
  connecticut:"CT",delaware:"DE",florida:"FL",georgia:"GA",hawaii:"HI",idaho:"ID",
  illinois:"IL",indiana:"IN",iowa:"IA",kansas:"KS",kentucky:"KY",louisiana:"LA",
  maine:"ME",maryland:"MD",massachusetts:"MA",michigan:"MI",minnesota:"MN",
  mississippi:"MS",missouri:"MO",montana:"MT",nebraska:"NE",nevada:"NV",
  "new hampshire":"NH","new jersey":"NJ","new mexico":"NM","new york":"NY",
  "north carolina":"NC","north dakota":"ND",ohio:"OH",oklahoma:"OK",oregon:"OR",
  pennsylvania:"PA","rhode island":"RI","south carolina":"SC","south dakota":"SD",
  tennessee:"TN",texas:"TX",utah:"UT",vermont:"VT",virginia:"VA",washington:"WA",
  "west virginia":"WV",wisconsin:"WI",wyoming:"WY","district of columbia":"DC",
}

function normalizeState(raw: string): string | null {
  const s = raw.trim().replace(/\.$/, "")
  if (s.length === 2 && US_STATES.has(s.toUpperCase())) return s.toUpperCase()
  const code = STATE_NAME_TO_CODE[s.toLowerCase()]
  return code ?? null
}

// ── Patterns ────────────────────────────────────────────────────────────────
const STREET_TYPES = "Street|St|Avenue|Ave|Boulevard|Blvd|Drive|Dr|Road|Rd|Lane|Ln|Court|Ct|Way|Circle|Cir|Place|Pl|Terrace|Ter|Parkway|Pkwy|Trail|Trl|Highway|Hwy|Square|Sq|Loop|Path|Walk|Row|Real|Plaza|Crossing|Cove|Bend|Pass|Run|Point|Pt|Ridge"

// Inline full address with explicit state + zip — works for any US state.
const INLINE_ADDR = new RegExp(
  `\\b(\\d{1,6})\\s+([A-Z0-9][A-Za-z0-9.'\\- ]{2,42}?\\s(?:${STREET_TYPES})\\.?)\\s*(#?\\s*[\\w-]+)?,?\\s+([A-Z][A-Za-z][A-Za-z .'\\-]{1,28}?),?\\s+([A-Z]{2}|[A-Z][a-z]+(?: [A-Z][a-z]+)?)\\.?,?\\s+(\\d{5})`,
  "g"
)

// Labeled "this is the foreclosed property" forms — highest precision.
const LABELED_ADDR =
  /(?:Property Address|street address[^:]{0,90}?purported to be|common(?:ly)? (?:designation[^:]{0,50}?|known as)|purported to be)\s*:?\s*([0-9][A-Za-z0-9.,'#\- ]{5,60}?,?\s+[A-Z][A-Za-z. ]{2,28}?,?\s+(?:[A-Z]{2}|[A-Z][a-z]+(?: [A-Z][a-z]+)?)\.?,?\s+\d{5})/gi

function cleanWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim()
}

// Parse "123 Main St #4, City, CA 92101" → { address, city, state, zip }
function parseBlob(blob: string): { address: string; city: string; state: string; zip: string } | null {
  const b = cleanWhitespace(blob).replace(/,$/, "")
  const zip = b.match(/(\d{5})\s*$/)?.[1]
  if (!zip) return null
  // strip zip
  let rest = b.replace(/,?\s*\d{5}\s*$/, "").trim()
  // pull state (2-letter or full name) off the end
  const stateM = rest.match(/[, ]+([A-Za-z]{2}|[A-Z][a-z]+(?: [A-Z][a-z]+)?)\.?$/)
  let state = ""
  if (stateM) {
    const code = normalizeState(stateM[1])
    if (code) { state = code; rest = rest.slice(0, stateM.index).trim().replace(/,$/, "") }
  }
  if (!state) return null
  // remaining: "<address>, <city>" or "<address> <City>"
  let address = rest, city = ""
  if (rest.includes(",")) {
    const parts = rest.split(",")
    city = cleanWhitespace(parts.pop() ?? "")
    address = cleanWhitespace(parts.join(","))
  } else {
    const m = rest.match(new RegExp(`^(.*?\\b(?:${STREET_TYPES})\\.?\\s*(?:#?\\s*[\\w-]+)?)\\s+([A-Z][A-Za-z]+(?:\\s+[A-Z][A-Za-z]+){0,2})$`))
    if (m) { address = cleanWhitespace(m[1]); city = cleanWhitespace(m[2]) }
  }
  if (!/^\d/.test(address) || address.length < 5) return null
  // Strip a leading stray number (T.S. / case number that bled in before the
  // real street number), e.g. "253 7741 Roswell Road" → "7741 Roswell Road".
  address = address.replace(/^\d{1,5}\s+(\d{1,6}\s+[A-Za-z])/, "$1")
  city = city.replace(/\s+(Area|County)$/i, "").trim()
  return { address, city, state, zip }
}

function stageFromContext(ctx: string): FreeLead["foreclosureStage"] {
  const c = ctx.toLowerCase()
  if (/notice of trustee'?s? sale|trustee'?s sale|will sell at public auction|will be sold at|sheriff'?s sale/.test(c)) return "NOTICE_OF_SALE"
  if (/notice of default|in default under a deed of trust|lis pendens.{0,40}default/.test(c)) return "NOTICE_OF_DEFAULT"
  if (/public auction|sold to the highest bidder/.test(c)) return "AUCTION"
  if (/lis pendens/.test(c)) return "LIS_PENDENS"
  return "PRE_FORECLOSURE"
}

function amountFromContext(ctx: string): number | null {
  const m = ctx.match(/(?:unpaid balance|opening bid|total amount due|estimated[^$]{0,30}|amount of the unpaid balance[^$]{0,20})\$\s?([\d,]+(?:\.\d{2})?)/i)
    ?? ctx.match(/\$\s?([\d,]{6,})/)
  if (!m) return null
  const n = Number(m[1].replace(/,/g, ""))
  return Number.isFinite(n) && n > 5000 ? Math.round(n) : null
}

function dateFromContext(ctx: string): string | null {
  const named = ctx.match(/\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+20\d{2}/i)
  if (named) { const d = new Date(named[0]); if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10) }
  const slash = ctx.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/)
  if (slash) { const d = new Date(`${slash[3]}-${slash[1].padStart(2,"0")}-${slash[2].padStart(2,"0")}`); if (!isNaN(d.getTime())) return d.toISOString().slice(0,10) }
  return null
}

function ownerFromContext(ctx: string): string {
  const m = ctx.match(/(?:Trustor|Borrower|Grantor|Mortgagor)(?:\(s\))?:?\s*([A-Z][A-Za-z.,'\- ]{4,45}?)(?:\s{2,}|,?\s+(?:A |AN |AS |WHOSE|Recorded|Duly|Trustee|under|dated|in favor|\d))/)
  if (m) {
    const name = cleanWhitespace(m[1]).replace(/[,.]$/, "")
    if (name.length >= 4 && !/notice|default|trustee|deed|county|sale/i.test(name)) return name
  }
  return ""
}

export interface ExtractResult {
  lead: FreeLead
  state: string
  zip: string
  city: string
}

function build(blob: string, content: string, idx: number, sourceUrl: string): ExtractResult | null {
  const parsed = parseBlob(blob)
  if (!parsed) return null
  const ctx = content.slice(Math.max(0, idx - 450), idx + 450)
  return {
    state: parsed.state,
    zip: parsed.zip,
    city: parsed.city,
    lead: {
      address: parsed.address,
      city: parsed.city,
      state: parsed.state,
      zip: parsed.zip,
      ownerName: ownerFromContext(ctx),
      foreclosureStage: stageFromContext(ctx),
      recordingDate: dateFromContext(ctx) ?? "",
      defaultAmount: amountFromContext(ctx),
      lender: null,
      auctionDate: null,
      estimatedValue: null,
      sourceUrl,
      rawSignals: ["Extracted from a legally-required public foreclosure notice"],
    },
  }
}

/**
 * Extract foreclosure leads (any US location) from legal-notice raw content.
 * Returns every address found, tagged with state/city/zip, so the caller can
 * prioritize the searched location without ever returning empty.
 */
export function extractAddressesFromContent(content: string, sourceUrl: string): ExtractResult[] {
  const seen = new Set<string>()
  const out: ExtractResult[] = []

  const add = (blob: string, idx: number) => {
    const r = build(blob, content, idx, sourceUrl)
    if (!r) return
    const key = (r.lead.address + r.city).toLowerCase().replace(/[\s,#.-]/g, "")
    if (seen.has(key)) return
    seen.add(key)
    out.push(r)
  }

  for (const m of content.matchAll(LABELED_ADDR)) add(m[1], m.index ?? 0)
  for (const m of content.matchAll(INLINE_ADDR)) {
    // reconstruct blob from groups: num street unit, city, state zip
    const blob = `${m[1]} ${m[2]}${m[3] ? " " + m[3] : ""}, ${m[4]}, ${m[5]} ${m[6]}`
    add(blob, m.index ?? 0)
  }

  return out
}

// ── Location matching ──────────────────────────────────────────────────────────
export interface LocationTarget {
  searchType: "zip" | "city" | "county"
  zipCode?: string
  city?: string
  state?: string   // 2-letter
  county?: string
}

// Returns true if an extracted lead matches the user's searched location.
export function leadMatchesTarget(r: ExtractResult, t: LocationTarget): boolean {
  if (t.searchType === "zip" && t.zipCode) {
    return r.zip === t.zipCode || r.zip.slice(0, 3) === t.zipCode.slice(0, 3)
  }
  if (t.searchType === "city" && t.city) {
    const cityMatch = r.city.toLowerCase() === t.city.toLowerCase() ||
                      r.city.toLowerCase().includes(t.city.toLowerCase())
    const stateMatch = !t.state || r.state === t.state.toUpperCase()
    return cityMatch && stateMatch
  }
  if (t.searchType === "county") {
    // County granularity isn't in the address; match by state (region-correct)
    return !t.state || r.state === t.state.toUpperCase()
  }
  return true
}
