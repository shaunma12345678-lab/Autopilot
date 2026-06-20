// County open-data engine. Each county/city publishes records through portals
// that are built FOR API access (Socrata / ArcGIS) and don't block servers —
// unlike court systems. We register the portals per market and pull distress
// records (code enforcement, vacancy, building cases, tax-defaulted) as leads,
// tagged with the category so they classify correctly. Expandable county-by-
// county. Best-effort: every failure is swallowed, never blocks the search.
//
// NOTE: in CA, assessor parcel data typically omits owner names for privacy, so
// the strongest free signals here are code/vacancy/violation + tax records.

import type { FreeLead } from "@/lib/free-foreclosure-scraper"

interface SocrataSet { q: string; signal: string; vacant?: boolean }
interface CountyConfig {
  label:         string
  socrataDomain?: string          // e.g. "data.lacity.org"
  sets:          SocrataSet[]     // category searches to run against the domain
}

// Shared comprehensive distress set for tuned markets (each portal's catalog is
// searched for these, so dataset naming differences don't matter much).
const DISTRESS_SETS: SocrataSet[] = [
  { q: "code enforcement violation", signal: "Code violation (open data)" },
  { q: "building violation",         signal: "Building violation (open data)" },
  { q: "vacant abandoned building",  signal: "Vacant / abandoned (open data)", vacant: true },
  { q: "vacant lot",                 signal: "Vacant lot (open data)", vacant: true },
  { q: "demolition",                 signal: "Demolition (open data)", vacant: true },
  { q: "tax delinquent",             signal: "Tax delinquent (open data)" },
  { q: "lien",                       signal: "Lien (open data)" },
]

// Registry — tuned top markets (deep, pinned portal). Everywhere else is covered
// by automatic portal resolution + the same category set, so it's just as deep.
const COUNTY_REGISTRY: Record<string, CountyConfig> = {
  "los-angeles": {
    label: "Los Angeles",
    socrataDomain: "data.lacity.org",
    sets: [
      { q: "code enforcement",        signal: "Code enforcement case (LA open data)" },
      { q: "building code violation", signal: "Building/code violation (LA open data)" },
      { q: "vacant building",         signal: "Vacant building (LA open data)", vacant: true },
      { q: "nuisance abatement",      signal: "Nuisance abatement (LA open data)" },
      { q: "order to comply",         signal: "Order to comply / code case (LA open data)" },
      { q: "demolition permit",       signal: "Demolition permit (LA open data)", vacant: true },
    ],
  },
  "new-york-city": {
    label: "New York City",
    socrataDomain: "data.cityofnewyork.us",
    sets: [
      { q: "housing maintenance code violations", signal: "HPD housing violation (NYC open data)" },
      { q: "DOB violations",                      signal: "DOB building violation (NYC open data)" },
      { q: "vacant lot",                          signal: "Vacant lot (NYC open data)", vacant: true },
      { q: "code enforcement",                    signal: "Code enforcement (NYC open data)" },
      { q: "tax lien",                            signal: "Tax lien (NYC open data)" },
    ],
  },
  "chicago":       { label: "Chicago",       socrataDomain: "data.cityofchicago.org", sets: DISTRESS_SETS },
  "san-diego":     { label: "San Diego",     socrataDomain: "data.sandiego.gov",      sets: DISTRESS_SETS },
  "san-francisco": { label: "San Francisco", socrataDomain: "data.sfgov.org",         sets: DISTRESS_SETS },
}

// Place-name → tuned market matchers.
const MATCHERS: Array<{ id: string; rx: RegExp }> = [
  { id: "los-angeles",   rx: /los angeles|long beach|hollywood|van nuys|north hollywood|san pedro|venice|\bl\.?a\.?\b/ },
  { id: "new-york-city", rx: /new york city|nyc|manhattan|brooklyn|bronx|queens|staten island/ },
  { id: "chicago",       rx: /chicago|cook county/ },
  { id: "san-diego",     rx: /san diego/ },
  { id: "san-francisco", rx: /san francisco/ },
]

// Map a search to a registered market (by countyId, county name, or city).
export function resolveCounty(p: { countyId?: string; county?: string; city?: string; state?: string }): { id: string; cfg: CountyConfig } | null {
  const direct = p.countyId && COUNTY_REGISTRY[p.countyId] ? p.countyId : null
  if (direct) return { id: direct, cfg: COUNTY_REGISTRY[direct] }
  const name = `${p.county ?? ""} ${p.city ?? ""}`.toLowerCase()
  for (const m of MATCHERS) if (m.rx.test(name) && COUNTY_REGISTRY[m.id]) return { id: m.id, cfg: COUNTY_REGISTRY[m.id] }
  return null
}

const ADDR_KEYS  = ["address", "site_address", "street_address", "property_address", "location_address", "address_start", "full_address", "addr"]
const CITY_KEYS  = ["city", "site_city", "property_city"]
const ZIP_KEYS   = ["zip", "zip_code", "zipcode", "site_zip", "property_zip"]
const OWNER_KEYS = ["owner", "owner_name", "property_owner", "ownername"]

function pick(row: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) { const v = row[k]; if (v != null && typeof v !== "object" && String(v).trim()) return String(v).trim() }
  return ""
}

async function socrataDiscover(domain: string, q: string): Promise<string[]> {
  try {
    const url = `https://api.us.socrata.com/api/catalog/v1?domains=${encodeURIComponent(domain)}&q=${encodeURIComponent(q)}&only=dataset&limit=3`
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(7000) })
    if (!res.ok) return []
    const data = await res.json()
    return (data.results ?? [])
      .map((r: Record<string, unknown>) => String((r.resource as Record<string, unknown>)?.id ?? ""))
      .filter(Boolean)
      .slice(0, 2)
  } catch {
    return []
  }
}

// Generic discovery across ALL Socrata domains — biased to the searched area by
// including the place name in the query. Covers most cities/counties that
// publish on Socrata without any per-county config.
async function socrataDiscoverGlobal(q: string): Promise<Array<{ domain: string; id: string }>> {
  try {
    const url = `https://api.us.socrata.com/api/catalog/v1?q=${encodeURIComponent(q)}&only=dataset&limit=4`
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(7000) })
    if (!res.ok) return []
    const data = await res.json()
    return (data.results ?? [])
      .map((r: Record<string, unknown>) => ({
        domain: String((r.metadata as Record<string, unknown>)?.domain ?? ""),
        id:     String((r.resource as Record<string, unknown>)?.id ?? ""),
      }))
      .filter((d: { domain: string; id: string }) => d.domain && d.id)
      .slice(0, 3)
  } catch {
    return []
  }
}

// Domains that aren't a specific local portal — skip so we pin the LOCAL one.
const GENERIC_DOMAINS = new Set(["data.gov", "catalog.data.gov", "data.ca.gov", "performance.commerce.gov"])

// Resolve the searched area's OWN open-data portal (the Socrata domain that hosts
// the most datasets for that place). Once we have it we can run the full category
// set against it — the same depth as a hand-tuned market, but automatically.
async function resolveSocrataDomain(areaTerm: string): Promise<string | null> {
  try {
    const url = `https://api.us.socrata.com/api/catalog/v1?q=${encodeURIComponent(areaTerm)}&only=dataset&limit=25`
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(7000) })
    if (!res.ok) return null
    const data = await res.json()
    const counts = new Map<string, number>()
    for (const r of (data.results ?? []) as Record<string, unknown>[]) {
      const d = String((r.metadata as Record<string, unknown>)?.domain ?? "")
      if (!d || GENERIC_DOMAINS.has(d)) continue
      counts.set(d, (counts.get(d) ?? 0) + 1)
    }
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1])
    return ranked[0]?.[0] ?? null
  } catch {
    return null
  }
}

// Default distress categories used for generic (non-registered) counties — broad
// so the auto-discovery goes DEEP wherever a county publishes, no per-county code.
const GENERIC_SETS: SocrataSet[] = [
  { q: "code enforcement violation",  signal: "Code violation (open data)" },
  { q: "vacant abandoned property",   signal: "Vacant / abandoned (open data)", vacant: true },
  { q: "tax delinquent property",     signal: "Tax delinquent (open data)" },
  { q: "nuisance condemned property", signal: "Nuisance / condemned (open data)" },
  { q: "demolition order",            signal: "Demolition order (open data)", vacant: true },
  { q: "foreclosure registry",        signal: "Foreclosure registry (open data)" },
  { q: "property lien assessment",    signal: "Lien / assessment (open data)" },
]

async function socrataRows(domain: string, id: string, areaTerm: string): Promise<Record<string, unknown>[]> {
  try {
    const qs = areaTerm ? `&$q=${encodeURIComponent(areaTerm)}` : ""
    const url = `https://${domain}/resource/${id}.json?$limit=200${qs}`
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) })
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

function rowToLead(row: Record<string, unknown>, set: SocrataSet, domain: string, p: { city?: string; state?: string; zipCode?: string }): FreeLead | null {
  const address = pick(row, ADDR_KEYS)
  if (!address || !/^\d/.test(address)) return null
  return {
    address,
    city:  pick(row, CITY_KEYS) || p.city || "",
    state: (p.state ?? "CA").toUpperCase(),
    zip:   pick(row, ZIP_KEYS) || p.zipCode || "",
    ownerName: pick(row, OWNER_KEYS),
    foreclosureStage: "PRE_FORECLOSURE",
    recordingDate: "", defaultAmount: null, lender: null, auctionDate: null, estimatedValue: null,
    sourceUrl: `https://${domain}`,
    rawSignals: [set.signal],
    occupancy: set.vacant ? "vacant" : null,
  }
}

// Pull county/city open-data records for a search as tagged leads. Uses the
// tuned registry for known markets, otherwise generic Socrata discovery — so it
// covers MOST counties that publish open data, with no per-county config.
export async function fetchCountyRecords(
  p: { countyId?: string; county?: string; city?: string; state?: string; zipCode?: string },
): Promise<FreeLead[]> {
  const areaTerm = p.county || p.city || p.zipCode || ""
  if (!areaTerm) return []
  const match = resolveCounty(p)

  // Pin a domain: tuned registry first, else auto-resolve the area's own portal.
  // Either way we then run the FULL category set against it — so any county gets
  // the same depth as a hand-tuned market.
  const domain = match?.cfg.socrataDomain ?? await resolveSocrataDomain(areaTerm)
  const sets   = match?.cfg.sets ?? GENERIC_SETS
  const rowArea = p.zipCode || p.city || ""

  let batches: FreeLead[][]
  if (domain) {
    batches = await Promise.all(sets.map(async (set) => {
      const ids = await socrataDiscover(domain, set.q)
      const rowsArrays = await Promise.all(ids.map((id) => socrataRows(domain, id, rowArea)))
      return rowsArrays.flat().map((row) => rowToLead(row, set, domain, p)).filter((l): l is FreeLead => l !== null)
    }))
  } else {
    // No local portal resolved — last-resort discovery across all domains.
    batches = await Promise.all(GENERIC_SETS.map(async (set) => {
      const found = await socrataDiscoverGlobal(`${areaTerm} ${set.q}`)
      const rowsArrays = await Promise.all(found.map((f) => socrataRows(f.domain, f.id, rowArea).then((rows) => ({ rows, domain: f.domain }))))
      const out: FreeLead[] = []
      for (const { rows, domain: d } of rowsArrays) for (const row of rows) { const l = rowToLead(row, set, d, p); if (l) out.push(l) }
      return out
    }))
  }

  // Dedupe by address+city.
  const seen = new Set<string>()
  const leads: FreeLead[] = []
  for (const lead of batches.flat()) {
    const key = (lead.address + (lead.city ?? "")).toLowerCase().replace(/[\s,#.-]/g, "")
    if (seen.has(key)) continue
    seen.add(key)
    leads.push(lead)
  }
  return leads
}
