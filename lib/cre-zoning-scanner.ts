// Zoning/entitlement context — SanGIS's Zoning_Unincorporated FeatureServer.
// Verified live: layer 0 of
// https://geo.sandag.org/server/rest/services/Hosted/Zoning_Unincorporated/FeatureServer
// with fields usereg/density/lot/height/buildtype/maxflr/flrarearatio/coverage.
//
// Two honesty caveats, surfaced directly to the user rather than glossed over:
// 1. This layer covers UNINCORPORATED San Diego County only — not the City of
//    San Diego or other incorporated cities within the county, which run their
//    own separate zoning ordinances/GIS. Addresses outside unincorporated
//    county return "not available", not a wrong answer dressed up as a real one.
// 2. The zoning fields are coded strings (county planning designators), not
//    clean numeric FAR/density values — there's no public lookup table bundled
//    here to decode them precisely. The AI narrative is explicitly hedged as an
//    interpretation of the raw codes, and the raw codes are always shown
//    alongside it so a user can verify against the county's own zoning ordinance.
import { geocodeAddressServer } from "./server-geocode"
import { runAgent } from "./claude"

const ZONING_QUERY_URL = "https://geo.sandag.org/server/rest/services/Hosted/Zoning_Unincorporated/FeatureServer/0/query"

export interface ZoningContext {
  covered: boolean
  usereg: string | null
  density: string | null
  lot: string | null
  height: string | null
  buildtype: string | null
  maxflr: string | null
  flrarearatio: string | null
  coverage: string | null
  narrative: string | null
}

export async function scanZoning(address: string): Promise<ZoningContext | null> {
  const point = await geocodeAddressServer(address)
  if (!point) return null

  try {
    const params = new URLSearchParams({
      geometry: `${point.lng},${point.lat}`,
      geometryType: "esriGeometryPoint",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "usereg,density,lot,height,buildtype,maxflr,flrarearatio,coverage",
      returnGeometry: "false",
      f: "json",
    })
    const res = await fetch(`${ZONING_QUERY_URL}?${params}`, { signal: AbortSignal.timeout(10000) })
    if (!res.ok) return null

    const data = await res.json()
    const feature = data?.features?.[0]?.attributes as Record<string, string | null> | undefined

    if (!feature) {
      return {
        covered: false, usereg: null, density: null, lot: null, height: null,
        buildtype: null, maxflr: null, flrarearatio: null, coverage: null,
        narrative: "This address is outside unincorporated San Diego County — SanGIS's free zoning layer doesn't cover incorporated cities. Check the relevant city planning department directly.",
      }
    }

    let narrative: string | null = null
    try {
      const raw = await runAgent(
        "You interpret raw San Diego County zoning designator codes for a real estate investor. " +
        "Be clearly hedged — these are coded planning designators, not something you should claim certainty about. " +
        "Never invent specifics not present in the codes given. Keep it to 2-3 sentences, plain English.",
        `Raw San Diego County zoning fields for this parcel: ${JSON.stringify(feature)}. ` +
        "Give a brief, appropriately-hedged plain-English read on what this zoning generally allows (use type, density, height) and whether it looks like there could be development upside — always framing it as 'based on these codes' rather than certain fact.",
        { maxTokens: 300 }
      )
      narrative = typeof raw === "string" ? raw : JSON.stringify(raw)
    } catch {
      narrative = null // AI narrative is a bonus, not required — raw codes still returned
    }

    return {
      covered: true,
      usereg: feature.usereg ?? null,
      density: feature.density ?? null,
      lot: feature.lot ?? null,
      height: feature.height ?? null,
      buildtype: feature.buildtype ?? null,
      maxflr: feature.maxflr ?? null,
      flrarearatio: feature.flrarearatio ?? null,
      coverage: feature.coverage ?? null,
      narrative,
    }
  } catch {
    return null
  }
}
