// Server-side geocoding proxy for the Live Distress Map.
//
// WHY THIS EXISTS: the free U.S. Census geocoder returns NO CORS headers, so
// calling it directly from the browser is silently blocked → zero map pins.
// Proxying it through our own origin removes the CORS restriction entirely.
// Census is free, no key, no rate limit, and US-only (perfect for US property).
//
// Two modes (one round-trip each):
//   POST { addresses: string[] } → { results: (LatLng|null)[] }  (lead pins)
//   POST { place: string }       → { result: LatLng|null }       (fly-to)
//
// Geocoding is non-sensitive public data, so this endpoint is intentionally
// open (the embedded map calls it without admin headers). It never throws.

export const maxDuration = 60

import { NextRequest } from "next/server"

interface LatLng { lat: number; lng: number }

const CENSUS = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress"
const NOMINATIM = "https://nominatim.openstreetmap.org/search"
const UA = "AutoPilot-RealEstate/1.0 (foreclosure deal mapping)"

// Warm-lambda memoization so repeat searches don't re-hit the geocoders.
const SERVER_CACHE = new Map<string, LatLng | null>()

function isValid(lat: unknown, lng: unknown): lat is number {
  return (
    typeof lat === "number" && typeof lng === "number" &&
    Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 &&
    !(lat === 0 && lng === 0)
  )
}

async function fetchJson(url: string, ms: number): Promise<unknown | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: ctrl.signal })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

// ── A single street address → lat/lng via U.S. Census ─────────────────────────
async function censusGeocode(oneLine: string): Promise<LatLng | null> {
  const key = "addr:" + oneLine.toLowerCase()
  if (SERVER_CACHE.has(key)) return SERVER_CACHE.get(key) ?? null

  const url = `${CENSUS}?address=${encodeURIComponent(oneLine)}&benchmark=Public_AR_Current&format=json`
  const data = await fetchJson(url, 8000) as { result?: { addressMatches?: Array<{ coordinates?: { x: number; y: number } }> } } | null
  const m = data?.result?.addressMatches?.[0]?.coordinates
  const ll = m && isValid(m.y, m.x) ? { lat: m.y, lng: m.x } : null
  SERVER_CACHE.set(key, ll)
  return ll
}

// ── A place/city/ZIP → lat/lng via Nominatim (ZIP-aware) ──────────────────────
async function placeGeocode(place: string): Promise<LatLng | null> {
  const q = place.trim()
  const key = "place:" + q.toLowerCase()
  if (SERVER_CACHE.has(key)) return SERVER_CACHE.get(key) ?? null

  // A bare 5-digit ZIP must be queried as a postal code, otherwise Nominatim can
  // match it as a house number in the wrong state (the "91710 → Maryland" bug).
  const isZip = /^\d{5}$/.test(q)
  const url = isZip
    ? `${NOMINATIM}?postalcode=${encodeURIComponent(q)}&country=US&format=json&limit=1`
    : `${NOMINATIM}?q=${encodeURIComponent(q)}&countrycodes=us&format=json&limit=1`

  const arr = await fetchJson(url, 8000) as Array<{ lat: string; lon: string }> | null
  const first = Array.isArray(arr) ? arr[0] : null
  const lat = first ? parseFloat(first.lat) : NaN
  const lng = first ? parseFloat(first.lon) : NaN
  const ll = isValid(lat, lng) ? { lat, lng } : null
  SERVER_CACHE.set(key, ll)
  return ll
}

// Run async tasks with bounded concurrency, preserving input order.
async function mapWithConcurrency<I, O>(items: I[], limit: number, fn: (item: I) => Promise<O>): Promise<O[]> {
  const out = new Array<O>(items.length)
  let cursor = 0
  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const i = cursor++
      out[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()))
  return out
}

export async function POST(request: NextRequest) {
  let body: { addresses?: unknown; place?: unknown }
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }) }

  try {
    if (typeof body.place === "string" && body.place.trim()) {
      const result = await placeGeocode(body.place)
      return Response.json({ result })
    }

    if (Array.isArray(body.addresses)) {
      const addresses = body.addresses.slice(0, 400).map((a) => (typeof a === "string" ? a.trim() : ""))
      const results = await mapWithConcurrency(addresses, 12, (a) => (a ? censusGeocode(a) : Promise.resolve(null)))
      return Response.json({ results })
    }

    return Response.json({ error: "Provide { addresses: string[] } or { place: string }" }, { status: 400 })
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Geocoding failed", results: [], result: null }, { status: 200 })
  }
}
