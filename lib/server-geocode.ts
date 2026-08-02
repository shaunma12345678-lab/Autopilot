// Minimal server-side geocoder (address → lat/lng) for API routes that need a
// point to query against GIS services (flood zones, county zoning). Separate
// from lib/geocode.ts on purpose — that module is client-only (localStorage
// cache, calls our own /api/geocode proxy via a relative URL, which doesn't
// resolve from a server route). This one hits the Census geocoder directly —
// free, no key, US-only, no CORS restriction on server-to-server calls.
const CENSUS_LOCATIONS = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress"

export interface LatLng { lat: number; lng: number }

export async function geocodeAddressServer(oneLineAddress: string): Promise<LatLng | null> {
  const q = oneLineAddress?.trim()
  if (!q) return null
  try {
    const url = `${CENSUS_LOCATIONS}?address=${encodeURIComponent(q)}&benchmark=Public_AR_Current&format=json`
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const data = await res.json()
    const match = data?.result?.addressMatches?.[0]
    const coords = match?.coordinates
    if (typeof coords?.x !== "number" || typeof coords?.y !== "number") return null
    return { lat: coords.y, lng: coords.x }
  } catch {
    return null
  }
}
