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

export async function geocodeCity(city: string, state: string): Promise<GeoBox | null> {
  try {
    // Nominatim (OpenStreetMap) geocodes bare city names and returns a bounding
    // box directly — works for any US city, unlike the Census address geocoder.
    const params = new URLSearchParams({
      city,
      state,
      country:   "USA",
      format:    "json",
      limit:     "1",
    })
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
        return {
          south, north, west, east,
          centerLat: (south + north) / 2,
          centerLng: (west + east) / 2,
          radiusMiles: 25,
        }
      }
    }
    if (hit.lat && hit.lon) return expandBox(Number(hit.lat), Number(hit.lon), 20)
    return null
  } catch {
    return null
  }
}

export async function geocodeArea(params: {
  searchType: string
  zipCode?:   string
  city?:      string
  state?:     string
  county?:    string
}): Promise<GeoBox | null> {
  if (params.searchType === "zip" && params.zipCode)
    return geocodeZip(params.zipCode)

  if (params.searchType === "city" && params.city && params.state)
    return geocodeCity(params.city, params.state)

  if (params.searchType === "county" && params.county && params.state)
    return geocodeCity(`${params.county} County`, params.state)

  return null
}
