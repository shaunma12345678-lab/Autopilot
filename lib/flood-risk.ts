// Climate/insurance risk overlay — FEMA's National Flood Hazard Layer.
// Free, public, no key, nationwide (works for every county, not just the 4 CA
// counties the distress pipelines cover). Verified live: layer 28 of
// https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer is
// "Flood Hazard Zones" with fields FLD_ZONE, ZONE_SUBTY, SFHA_TF, STATIC_BFE.
import { geocodeAddressServer } from "./server-geocode"

const NFHL_QUERY_URL = "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query"

// SFHA_TF = "T" means inside a Special Flood Hazard Area (the 1%-annual-chance
// "100-year" floodplain) — this is the field mortgage lenders use to require
// flood insurance. Zone codes starting with A or V are the SFHA zones;
// X (unshaded) is minimal risk, X (shaded) is the 500-year/0.2% zone.
const HIGH_RISK_ZONE_PREFIXES = ["A", "V"]

export interface FloodRiskResult {
  floodZone: string | null
  zoneSubtype: string | null
  inSpecialFloodHazardArea: boolean | null
  baseFloodElevationFt: number | null
  riskLevel: "high" | "moderate" | "minimal" | "unknown"
  summary: string
}

export async function assessFloodRisk(address: string): Promise<FloodRiskResult | null> {
  const point = await geocodeAddressServer(address)
  if (!point) return null

  try {
    const params = new URLSearchParams({
      geometry: `${point.lng},${point.lat}`,
      geometryType: "esriGeometryPoint",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "FLD_ZONE,ZONE_SUBTY,SFHA_TF,STATIC_BFE",
      returnGeometry: "false",
      f: "json",
    })
    const res = await fetch(`${NFHL_QUERY_URL}?${params}`, { signal: AbortSignal.timeout(10000) })
    if (!res.ok) return null

    const data = await res.json()
    const feature = data?.features?.[0]?.attributes as
      | { FLD_ZONE?: string; ZONE_SUBTY?: string; SFHA_TF?: string; STATIC_BFE?: number }
      | undefined

    // No feature returned means the point fell outside any mapped flood zone
    // in NFHL's coverage — treated as minimal risk, not an error, since NFHL
    // coverage is genuinely incomplete in some rural/unstudied areas.
    if (!feature) {
      return {
        floodZone: null, zoneSubtype: null, inSpecialFloodHazardArea: null,
        baseFloodElevationFt: null, riskLevel: "unknown",
        summary: "No FEMA-mapped flood zone found at this address — either genuinely minimal risk or outside NFHL's current study coverage.",
      }
    }

    const zone = feature.FLD_ZONE ?? null
    const inSFHA = feature.SFHA_TF === "T"
    const bfe = typeof feature.STATIC_BFE === "number" && feature.STATIC_BFE > -9000 ? feature.STATIC_BFE : null

    const riskLevel: FloodRiskResult["riskLevel"] = inSFHA
      ? "high"
      : zone && HIGH_RISK_ZONE_PREFIXES.some(p => zone.startsWith(p))
      ? "high"
      : zone === "X" && (feature.ZONE_SUBTY ?? "").toLowerCase().includes("0.2")
      ? "moderate"
      : "minimal"

    const summary = inSFHA
      ? `Zone ${zone} — inside FEMA's Special Flood Hazard Area (the 100-year floodplain). Mortgage lenders will require flood insurance.${bfe ? ` Base flood elevation: ${bfe}ft.` : ""}`
      : riskLevel === "moderate"
      ? `Zone ${zone} — 500-year (0.2% annual chance) floodplain. Insurance not federally required but worth pricing in.`
      : `Zone ${zone ?? "unmapped"} — minimal flood risk per FEMA's current mapping.`

    return { floodZone: zone, zoneSubtype: feature.ZONE_SUBTY ?? null, inSpecialFloodHazardArea: inSFHA, baseFloodElevationFt: bfe, riskLevel, summary }
  } catch {
    return null
  }
}
