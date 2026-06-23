// Our own keyless per-property data engine — queries county open-data parcel
// layers (ArcGIS FeatureServers) by geocoded point to pull REAL assessor facts:
// building sqft, beds, baths, year built, use/type, and assessed value. No API
// key, no scraping ToS issues (public government GIS). Per-county field schemas
// vary, so each supported county has its own field map; unknown counties return
// null and the caller falls back to other enrichment. Never throws.

import { geocodeAddressComponents } from "@/lib/geocode"
import { normCounty } from "@/lib/area-scope"

export interface ParcelData {
  sqft:          number | null
  beds:          number | null
  baths:         number | null
  yearBuilt:     number | null
  propertyType:  string | null
  units:         number | null
  assessedValue: number | null
  source:        string
}

interface ParcelLayer {
  url: string
  source: string
  f: { sqft: string; beds: string; baths: string; year: string; use: string; units?: string; land?: string; imp?: string }
}

// Registry of verified keyless county parcel layers. Add counties here as their
// open-data endpoints are confirmed (field names differ per county).
const COUNTY_PARCELS: Record<string, ParcelLayer> = {
  "los angeles:ca": {
    url: "https://public.gis.lacounty.gov/public/rest/services/LACounty_Cache/LACounty_Parcel/MapServer/0/query",
    source: "LA County Assessor (parcel)",
    f: { sqft: "SQFTmain1", beds: "Bedrooms1", baths: "Bathrooms1", year: "YearBuilt1", use: "UseDescription", units: "Units1", land: "Roll_LandValue", imp: "Roll_ImpValue" },
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

    const outFields = [layer.f.sqft, layer.f.beds, layer.f.baths, layer.f.year, layer.f.use, layer.f.units, layer.f.land, layer.f.imp].filter(Boolean).join(",")
    const url = `${layer.url}?geometry=${comp.lng},${comp.lat}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=${encodeURIComponent(outFields)}&returnGeometry=false&f=json`
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
    if (!res.ok) return null
    const data = (await res.json()) as { features?: Array<{ attributes?: Record<string, unknown> }> }
    const a = data.features?.[0]?.attributes
    if (!a) return null

    const land = layer.f.land ? num(a[layer.f.land]) : null
    const imp = layer.f.imp ? num(a[layer.f.imp]) : null
    const assessedValue = land != null || imp != null ? (land ?? 0) + (imp ?? 0) : null
    const use = layer.f.use ? a[layer.f.use] : null
    return {
      sqft:         num(a[layer.f.sqft]),
      beds:         num(a[layer.f.beds]),
      baths:        num(a[layer.f.baths]),
      yearBuilt:    num(a[layer.f.year]),
      propertyType: typeof use === "string" && use.trim() ? use.trim() : null,
      units:        layer.f.units ? num(a[layer.f.units]) : null,
      assessedValue,
      source:       layer.source,
    }
  } catch {
    return null
  }
}
