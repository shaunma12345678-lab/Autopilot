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

// Registry — add markets here as we wire them.
const COUNTY_REGISTRY: Record<string, CountyConfig> = {
  "los-angeles": {
    label: "Los Angeles",
    socrataDomain: "data.lacity.org",
    sets: [
      { q: "code enforcement",          signal: "Code enforcement case (LA open data)" },
      { q: "building code violation",   signal: "Building/code violation (LA open data)" },
      { q: "vacant building",           signal: "Vacant building (LA open data)", vacant: true },
      { q: "vacant property",           signal: "Vacant property (LA open data)", vacant: true },
      { q: "nuisance abatement",        signal: "Nuisance abatement (LA open data)" },
      { q: "order to comply",           signal: "Order to comply / code case (LA open data)" },
      { q: "rent registry",             signal: "Rental / landlord registry (LA open data)" },
      { q: "demolition permit",         signal: "Demolition permit (LA open data)", vacant: true },
    ],
  },
}

// Map a search to a registered county (by countyId, county name, or city).
export function resolveCounty(p: { countyId?: string; county?: string; city?: string; state?: string }): { id: string; cfg: CountyConfig } | null {
  const direct = p.countyId && COUNTY_REGISTRY[p.countyId] ? p.countyId : null
  if (direct) return { id: direct, cfg: COUNTY_REGISTRY[direct] }
  const name = `${p.county ?? ""} ${p.city ?? ""}`.toLowerCase()
  if (/los angeles|\bla\b|long beach|hollywood|van nuys|north hollywood|san pedro|venice/.test(name) && (p.state ?? "").toUpperCase() !== "" ) {
    if (COUNTY_REGISTRY["los-angeles"]) return { id: "los-angeles", cfg: COUNTY_REGISTRY["los-angeles"] }
  }
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

// Default distress categories used for generic (non-registered) counties.
const GENERIC_SETS: SocrataSet[] = [
  { q: "code enforcement violation", signal: "Code violation (open data)" },
  { q: "vacant property",            signal: "Vacant property (open data)", vacant: true },
  { q: "tax delinquent property",    signal: "Tax delinquent (open data)" },
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
  const areaTerm = p.zipCode || p.city || p.county || ""
  if (!areaTerm) return []
  const match = resolveCounty(p)

  let batches: FreeLead[][]
  if (match?.cfg.socrataDomain) {
    // Tuned market — pinned domain.
    const domain = match.cfg.socrataDomain
    batches = await Promise.all(match.cfg.sets.map(async (set) => {
      const ids = await socrataDiscover(domain, set.q)
      const rowsArrays = await Promise.all(ids.map((id) => socrataRows(domain, id, areaTerm)))
      return rowsArrays.flat().map((row) => rowToLead(row, set, domain, p)).filter((l): l is FreeLead => l !== null)
    }))
  } else {
    // Generic — discover across all Socrata domains, biased to the place name.
    batches = await Promise.all(GENERIC_SETS.map(async (set) => {
      const found = await socrataDiscoverGlobal(`${areaTerm} ${set.q}`)
      const rowsArrays = await Promise.all(found.map((f) => socrataRows(f.domain, f.id, areaTerm).then((rows) => ({ rows, domain: f.domain }))))
      const out: FreeLead[] = []
      for (const { rows, domain } of rowsArrays) for (const row of rows) { const l = rowToLead(row, set, domain, p); if (l) out.push(l) }
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
