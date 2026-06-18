// Free geocoding — no API key required, no third-party dependencies.
// zippopotam.us: ZIP → lat/lng (stable since 2011)
// Census Geocoding API: city/state → lat/lng (official US government API)

export interface GeoBox {
  north:       number
  south:       number
  east:        number
  west:        number
  centerLat:   number
  centerLng:   number
  radiusMiles: number
}

function expandBox(lat: number, lng: number, radiusMiles: number): GeoBox {
  const latDelta = radiusMiles / 69
  const lngDelta = radiusMiles / (69 * Math.cos((lat * Math.PI) / 180))
  return {
    north: lat + latDelta,
    south: lat - latDelta,
    east:  lng + lngDelta,
    west:  lng - lngDelta,
    centerLat:   lat,
    centerLng:   lng,
    radiusMiles,
  }
}

export async function geocodeZip(zip: string): Promise<GeoBox | null> {
  try {
    const res = await fetch(`https://api.zippopotam.us/us/${zip}`, {
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return null
    const data = await res.json()
    const place = data.places?.[0]
    if (!place) return null
    return expandBox(parseFloat(place.latitude), parseFloat(place.longitude), 8)
  } catch {
    return null
  }
}

// Nominatim (OpenStreetMap) — bounding box for a city. Strict rate limit
// (~1 req/sec), so it's the first try but NOT relied on alone.
async function geocodeCityNominatim(city: string, state: string): Promise<GeoBox | null> {
  try {
    const params = new URLSearchParams({ city, state, country: "USA", format: "json", limit: "1" })
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?${params}`,
      {
        headers: {
          "User-Agent": "AutoPilot-RealEstate/1.0 (foreclosure-search)",
          "Accept":     "application/json",
        },
        signal: AbortSignal.timeout(8000),
      }
    )
    if (!res.ok) return null
    const data = await res.json()
    const hit = Array.isArray(data) ? data[0] : null
    if (!hit) return null

    // Nominatim boundingbox = [south, north, west, east]
    if (Array.isArray(hit.boundingbox) && hit.boundingbox.length === 4) {
      const [south, north, west, east] = hit.boundingbox.map(Number)
      if ([south, north, west, east].every(Number.isFinite)) {
        return { south, north, west, east, centerLat: (south + north) / 2, centerLng: (west + east) / 2, radiusMiles: 25 }
      }
    }
    if (hit.lat && hit.lon) return expandBox(Number(hit.lat), Number(hit.lon), 20)
    return null
  } catch {
    return null
  }
}

// Photon (komoot) — free OSM geocoder with NO hard rate limit. Fallback for when
// Nominatim throttles a rapid second search (which would otherwise kill the
// bounding box and drop every map-tiled source).
async function geocodeCityPhoton(city: string, state: string): Promise<GeoBox | null> {
  try {
    const params = new URLSearchParams({ q: `${city}, ${state}`, limit: "1" })
    const res = await fetch(`https://photon.komoot.io/api/?${params}`, {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const data = await res.json()
    const feat = data?.features?.[0]
    if (!feat) return null
    // Photon extent = [west, north, east, south]
    const ext = feat.properties?.extent
    if (Array.isArray(ext) && ext.length === 4) {
      const [west, north, east, south] = ext.map(Number)
      if ([west, north, east, south].every(Number.isFinite)) {
        return { south, north, west, east, centerLat: (south + north) / 2, centerLng: (west + east) / 2, radiusMiles: 25 }
      }
    }
    const c = feat.geometry?.coordinates
    if (Array.isArray(c) && c.length === 2 && Number.isFinite(Number(c[1])) && Number.isFinite(Number(c[0]))) {
      return expandBox(Number(c[1]), Number(c[0]), 20)
    }
    return null
  } catch {
    return null
  }
}

export async function geocodeCity(city: string, state: string): Promise<GeoBox | null> {
  return (await geocodeCityNominatim(city, state)) ?? (await geocodeCityPhoton(city, state))
}

// In-module cache of resolved area boxes. Cities/zips don't move, so once we've
// geocoded an area we reuse it — this is what stops a rapid SECOND search from
// collapsing when the geocoder rate-limits (no box ⇒ no Redfin/Zillow/ArcGIS).
const AREA_BOX_CACHE = new Map<string, GeoBox>()
function areaBoxKey(p: { searchType: string; zipCode?: string; city?: string; state?: string; county?: string }): string {
  return `${p.searchType}|${p.zipCode ?? ""}|${(p.city ?? "").toLowerCase().trim()}|${(p.county ?? "").toLowerCase().trim()}|${(p.state ?? "").toUpperCase().trim()}`
}

export async function geocodeArea(params: {
  searchType: string
  zipCode?:   string
  city?:      string
  state?:     string
  county?:    string
}): Promise<GeoBox | null> {
  const key = areaBoxKey(params)
  const cached = AREA_BOX_CACHE.get(key)
  if (cached) return cached

  let box: GeoBox | null = null
  if (params.searchType === "zip" && params.zipCode)
    box = await geocodeZip(params.zipCode)
  else if (params.searchType === "city" && params.city && params.state)
    box = await geocodeCity(params.city, params.state)
  else if (params.searchType === "county" && params.county && params.state)
    box = await geocodeCity(`${params.county} County`, params.state)

  if (box) AREA_BOX_CACHE.set(key, box)
  return box
}
