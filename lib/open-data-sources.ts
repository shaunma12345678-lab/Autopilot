// Free government OPEN-DATA sources (ArcGIS Hub / Esri Feature Services).
// Unlike county court sites, these are built FOR API access and serve plain
// JSON from datacenter IPs — so they actually respond from our servers. They
// surface real distress categories that the listing sources don't carry:
// code-violation, vacant/abandoned, tax-delinquent, and liens. Each lead is
// tagged with the category signal so classifyLead recognizes it.
//
// Coverage depends on whether the searched jurisdiction publishes open data
// (many US cities/counties do). Best-effort: every failure is swallowed.

import type { FreeLead } from "@/lib/free-foreclosure-scraper"
import type { GeoBox } from "@/lib/geocoding"

// Category → (ArcGIS search keywords, signal tag, occupancy hint).
const CATEGORY: Record<string, { q: string; signal: string; vacant?: boolean }> = {
  code:        { q: "code enforcement violation",          signal: "Code violation (open data)" },
  vacant:      { q: "vacant abandoned property registry",  signal: "Vacant / abandoned (open data)", vacant: true },
  taxdelq:     { q: "tax delinquent property",             signal: "Tax delinquent (open data)" },
  liens:       { q: "property lien special assessment",    signal: "Lien / assessment (open data)" },
  foreclosure: { q: "foreclosure notice of default",       signal: "Foreclosure record (open data)" },
  // Court-adjacent: only some jurisdictions publish these as open data, but we
  // try — where it exists, it surfaces (best-effort).
  probate:     { q: "probate estate decedent property",    signal: "Probate / inherited estate (open data)" },
  eviction:    { q: "eviction unlawful detainer filing",   signal: "Eviction / tired landlord (open data)" },
}
// Broad sweep when no specific type is requested.
const BROAD = [CATEGORY.code, CATEGORY.vacant, CATEGORY.taxdelq]

const ADDR_FIELDS = ["SITE_ADDR", "SITUS_ADDR", "situs_address", "PropertyAddress", "PROPERTY_ADDRESS", "StreetAddress", "STREET_ADDR", "ADDRESS", "Address", "address", "FULL_ADDR", "ADDR"]
const CITY_FIELDS = ["CITY", "SITUS_CITY", "PropertyCity", "city", "City"]
const ZIP_FIELDS  = ["ZIP", "ZIP_CODE", "SITUS_ZIP", "PropertyZip", "zip", "Zip"]
const OWNER_FIELDS = ["OWNER_NAME", "OwnerName", "OWNER", "owner", "Owner", "GRANTEE", "TAXPAYER", "OWNER1"]

function pick(attrs: Record<string, unknown>, fields: string[]): string {
  for (const f of fields) { const v = attrs[f]; if (v != null && String(v).trim()) return String(v).trim() }
  return ""
}

async function queryHub(box: GeoBox, kw: { q: string; signal: string; vacant?: boolean }, state: string): Promise<FreeLead[]> {
  const bbox = `${box.west},${box.south},${box.east},${box.north}`
  try {
    const searchUrl = `https://hub.arcgis.com/api/v3/datasets?q=${encodeURIComponent(kw.q)}&fields[datasets]=name,url&page[size]=6&filter[bbox]=${bbox}`
    const res = await fetch(searchUrl, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(7000) })
    if (!res.ok) return []
    const data = await res.json()
    const services: string[] = (data.data ?? [])
      .map((d: Record<string, unknown>) => String((d.attributes as Record<string, unknown>)?.url ?? ""))
      .filter((u: string) => u.includes("FeatureServer") || u.includes("MapServer"))
      .slice(0, 4)
    if (services.length === 0) return []

    const out: FreeLead[] = []
    await Promise.allSettled(services.map(async (serviceUrl) => {
      try {
        const base     = serviceUrl.replace(/\/$/, "")
        const queryUrl = /\/\d+$/.test(base) ? `${base}/query` : `${base}/0/query`
        const qs = new URLSearchParams({
          where: "1=1", outFields: "*", resultRecordCount: "200",
          geometry: bbox, geometryType: "esriGeometryEnvelope",
          spatialRel: "esriSpatialRelIntersects", f: "json",
        })
        const qRes = await fetch(`${queryUrl}?${qs}`, { signal: AbortSignal.timeout(7000) })
        if (!qRes.ok) return
        const qData = await qRes.json()
        for (const f of (qData.features ?? []) as Record<string, unknown>[]) {
          const a = (f.attributes ?? {}) as Record<string, unknown>
          const address = pick(a, ADDR_FIELDS)
          if (!address || !/^\d/.test(address)) continue
          out.push({
            address,
            city:  pick(a, CITY_FIELDS),
            state: state || "CA",
            zip:   pick(a, ZIP_FIELDS),
            ownerName: pick(a, OWNER_FIELDS),
            foreclosureStage: "PRE_FORECLOSURE",
            recordingDate: "",
            defaultAmount: null,
            lender: null,
            auctionDate: null,
            estimatedValue: null,
            sourceUrl: serviceUrl,
            rawSignals: [kw.signal],
            occupancy: kw.vacant ? "vacant" : null,
          })
        }
      } catch { /* skip this dataset */ }
    }))
    return out
  } catch {
    return []
  }
}

// Fetch open-data leads for a box. If leadType maps to a category, hunt that;
// otherwise sweep the broad distress set.
export async function fetchOpenDataLeads(box: GeoBox | null, state: string, leadType?: string): Promise<FreeLead[]> {
  if (!box) return []
  const targets = leadType && CATEGORY[leadType] ? [CATEGORY[leadType]] : BROAD
  const batches = await Promise.all(targets.map((t) => queryHub(box, t, state)))
  // Dedupe by address+city.
  const seen = new Set<string>()
  const out: FreeLead[] = []
  for (const lead of batches.flat()) {
    const key = (lead.address + (lead.city ?? "")).toLowerCase().replace(/[\s,#.-]/g, "")
    if (seen.has(key)) continue
    seen.add(key)
    out.push(lead)
  }
  return out
}
