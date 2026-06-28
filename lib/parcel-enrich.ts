// Our own keyless per-property data engine — queries county open-data parcel
// layers (ArcGIS FeatureServers) by geocoded point to pull REAL assessor facts:
// building sqft, beds, baths, year built, use/type, and assessed value. No API
// key, no scraping ToS issues (public government GIS). Per-county field schemas
// vary, so each supported county has its own field map; unknown counties return
// null and the caller falls back to other enrichment. Never throws.

import { geocodeAddressComponents } from "@/lib/geocode"
import { normCounty } from "@/lib/area-scope"

export interface ParcelData {
  sqft:           number | null
  beds:           number | null
  baths:          number | null
  yearBuilt:      number | null
  propertyType:   string | null
  units:          number | null
  assessedValue:  number | null
  ownerName:      string | null
  mailingAddress: string | null
  source:         string
}

interface ParcelLayer {
  url: string
  source: string
  f: {
    sqft: string; year: string; use: string
    beds?: string; baths?: string; units?: string; land?: string; imp?: string
    owner?: string; mailAddr?: string; mailCity?: string; mailState?: string; mailZip?: string
  }
}

// Registry of verified keyless county parcel layers. Add counties here as their
// open-data endpoints are confirmed (field names differ per county).
const COUNTY_PARCELS: Record<string, ParcelLayer> = {
  "los angeles:ca": {
    url: "https://public.gis.lacounty.gov/public/rest/services/LACounty_Cache/LACounty_Parcel/MapServer/0/query",
    source: "LA County Assessor (parcel)",
    f: { sqft: "SQFTmain1", beds: "Bedrooms1", baths: "Bathrooms1", year: "YearBuilt1", use: "UseDescription", units: "Units1", land: "Roll_LandValue", imp: "Roll_ImpValue" },
  },
  // Wayne County (Detroit) — exposes owner (taxpayer) name + mailing address.
  "wayne:mi": {
    url: "https://services2.arcgis.com/qvkbeam7Wirps6zC/arcgis/rest/services/parcel_file_current/FeatureServer/0/query",
    source: "Wayne County Assessor (parcel)",
    f: { sqft: "total_square_footage", year: "year_built", use: "use_code_description", owner: "taxpayer_1", mailAddr: "taxpayer_address", mailCity: "taxpayer_city", mailState: "taxpayer_state", mailZip: "taxpayer_zip_code" },
  },
}

const num = (v: unknown): number | null => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null }

export function isParcelCountySupported(county: string | null | undefined, state: string | null | undefined): boolean {
  return Boolean(COUNTY_PARCELS[`${normCounty(county)}:${(state || "").toLowerCase().trim()}`])
}

export async function enrichFromParcel(address: string, state: string): Promise<ParcelData | null> {
  if (!address?.trim()) return null
  try {
    const comp = await geocodeAddressComponents(address, state).catch(() => null)
    if (!comp || comp.lat == null || comp.lng == null || !comp.county) return null
    const layer = COUNTY_PARCELS[`${normCounty(comp.county)}:${(state || "").toLowerCase().trim()}`]
    if (!layer) return null

    const outFields = [layer.f.sqft, layer.f.beds, layer.f.baths, layer.f.year, layer.f.use, layer.f.units, layer.f.land, layer.f.imp, layer.f.owner, layer.f.mailAddr, layer.f.mailCity, layer.f.mailState, layer.f.mailZip].filter(Boolean).join(",")
    const base = `${layer.url}?outFields=${encodeURIComponent(outFields)}&returnGeometry=false&inSR=4326&spatialRel=esriSpatialRelIntersects&f=json`
    const runQuery = async (geometry: string, geometryType: string): Promise<Record<string, unknown> | null> => {
      const res = await fetch(`${base}&geometryType=${geometryType}&geometry=${geometry}`, { signal: AbortSignal.timeout(10000) })
      if (!res.ok) return null
      const data = (await res.json()) as { features?: Array<{ attributes?: Record<string, unknown> }> }
      return data.features?.[0]?.attributes ?? null
    }
    // Exact rooftop point first; if it lands just off the parcel polygon, retry
    // with a ~25m envelope so we still catch the property.
    let a = await runQuery(`${comp.lng},${comp.lat}`, "esriGeometryPoint")
    if (!a) {
      const dd = 0.00025
      a = await runQuery(`${comp.lng - dd},${comp.lat - dd},${comp.lng + dd},${comp.lat + dd}`, "esriGeometryEnvelope")
    }
    if (!a) return null

    const land = layer.f.land ? num(a[layer.f.land]) : null
    const imp = layer.f.imp ? num(a[layer.f.imp]) : null
    const assessedValue = land != null || imp != null ? (land ?? 0) + (imp ?? 0) : null
    const str = (k?: string) => { const v = k ? a[k] : null; return typeof v === "string" && v.trim() ? v.trim() : null }
    const mailParts = [str(layer.f.mailAddr), [str(layer.f.mailCity), str(layer.f.mailState), str(layer.f.mailZip)].filter(Boolean).join(", ")].filter(Boolean)
    return {
      sqft:           num(a[layer.f.sqft]),
      beds:           layer.f.beds ? num(a[layer.f.beds]) : null,
      baths:          layer.f.baths ? num(a[layer.f.baths]) : null,
      yearBuilt:      num(a[layer.f.year]),
      propertyType:   str(layer.f.use),
      units:          layer.f.units ? num(a[layer.f.units]) : null,
      assessedValue,
      ownerName:      str(layer.f.owner),
      mailingAddress: mailParts.length ? mailParts.join(", ") : null,
      source:         layer.source,
    }
  } catch {
    return null
  }
}
