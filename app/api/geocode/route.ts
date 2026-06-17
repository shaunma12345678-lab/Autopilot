// Server-side geocoding proxy for the Live Distress Map.
//
// WHY THIS EXISTS: the free U.S. Census geocoder returns NO CORS headers, so
// calling it directly from the browser is silently blocked → zero map pins.
// Proxying it through our own origin removes the CORS restriction entirely.
// Census is free, no key, no rate limit, and US-only (perfect for US property).
//
// Modes (one round-trip each):
//   POST { addresses: string[] }   → { results: (LatLng|null)[] }  (lead pins)
//   POST { place: string }         → { result: LatLng|null }       (fly-to)
//   POST { reverse: {lat,lng} }    → { address: string|null }      (click-to-analyze)
//
// Geocoding is non-sensitive public data, so this endpoint is intentionally
// open (the embedded map calls it without admin headers). It never throws.

export const maxDuration = 60

import { NextRequest } from "next/server"

interface LatLng { lat: number; lng: number }

const CENSUS = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress"
const NOMINATIM = "https://nominatim.openstreetmap.org/search"
const PHOTON = "https://photon.komoot.io/api"
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
// Forward-geocode a full street address via Nominatim (fallback to Census).
async function nominatimAddress(oneLine: string): Promise<LatLng | null> {
  const url = `${NOMINATIM}?q=${encodeURIComponent(oneLine)}&countrycodes=us&format=json&limit=1&addressdetails=1`
  const arr = await fetchJson(url, 8000) as Array<{ lat: string; lon: string; class?: string }> | null
  const first = Array.isArray(arr) ? arr[0] : null
  // Reject results that resolved only to a road/neighborhood, not a building.
  if (first && first.class === "highway") return null
  const lat = first ? parseFloat(first.lat) : NaN
  const lng = first ? parseFloat(first.lon) : NaN
  return isValid(lat, lng) ? { lat, lng } : null
}

// Photon (komoot) — free OSM geocoder, broad coverage, generous rate limits,
// no key. Covers many addresses Census (US-parcel-only) misses.
async function photonGeocode(oneLine: string): Promise<LatLng | null> {
  const data = await fetchJson(`${PHOTON}/?q=${encodeURIComponent(oneLine)}&limit=1`, 8000) as { features?: Array<{ geometry?: { coordinates?: [number, number] } }> } | null
  const c = data?.features?.[0]?.geometry?.coordinates
  return c && isValid(c[1], c[0]) ? { lat: c[1], lng: c[0] } : null
}

// Census (precise US parcels) → Photon (broad OSM) → Nominatim. Whichever hits.
async function censusGeocode(oneLine: string, allowFallback = true): Promise<LatLng | null> {
  const key = "addr:" + oneLine.toLowerCase()
  if (SERVER_CACHE.has(key)) return SERVER_CACHE.get(key) ?? null

  const url = `${CENSUS}?address=${encodeURIComponent(oneLine)}&benchmark=Public_AR_Current&format=json`
  const data = await fetchJson(url, 8000) as { result?: { addressMatches?: Array<{ coordinates?: { x: number; y: number } }> } } | null
  const m = data?.result?.addressMatches?.[0]?.coordinates
  let ll = m && isValid(m.y, m.x) ? { lat: m.y, lng: m.x } : null
  if (!ll && allowFallback) ll = await photonGeocode(oneLine)
  if (!ll && allowFallback) ll = await nominatimAddress(oneLine)
  SERVER_CACHE.set(key, ll)
  return ll
}

// Deterministic small offset so many pins sharing a ZIP centroid spread out a
// little (and stay stable across re-renders).
function jitter(base: LatLng, seed: string): LatLng {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  const dx = ((h % 1000) / 1000 - 0.5) * 0.012
  const dy = (((h >>> 10) % 1000) / 1000 - 0.5) * 0.012
  return { lat: base.lat + dy, lng: base.lng + dx }
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

// ── lat/lng → nearest street address via Nominatim reverse ────────────────────
// Returns the address plus a `kind` so the UI can be honest: clicking a freeway
// or open land doesn't have a real property address.
interface ReverseResult { address: string | null; kind: "parcel" | "road" | "area" }
const REV_CACHE = new Map<string, ReverseResult>()

async function reverseGeocode(lat: number, lng: number): Promise<ReverseResult> {
  if (!isValid(lat, lng)) return { address: null, kind: "area" }
  const key = `${lat.toFixed(5)},${lng.toFixed(5)}`
  const cached = REV_CACHE.get(key)
  if (cached) return cached

  const base = NOMINATIM.replace("/search", "/reverse")
  const url = `${base}?lat=${lat}&lon=${lng}&format=json&zoom=18&addressdetails=1`
  let data = await fetchJson(url, 8000) as { display_name?: string; class?: string; category?: string; address?: Record<string, string> } | null
  if (!data) data = await fetchJson(url, 8000) as typeof data // one retry on transient failure

  const a = data?.address
  const cls = data?.class ?? data?.category
  const hasHouse = Boolean(a?.house_number)
  const kind: ReverseResult["kind"] = hasHouse ? "parcel" : cls === "highway" ? "road" : "area"

  let address: string | null = null
  if (a) {
    const street = [a.house_number, a.road].filter(Boolean).join(" ")
    const city = a.city || a.town || a.village || a.hamlet || a.county
    address = [street, city, a.state, a.postcode].filter(Boolean).join(", ") || data?.display_name || null
  } else {
    address = data?.display_name ?? null
  }
  const result: ReverseResult = { address, kind }
  REV_CACHE.set(key, result)
  return result
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
  let body: { addresses?: unknown; place?: unknown; reverse?: unknown; fallback?: unknown }
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }) }

  try {
    if (body.reverse && typeof body.reverse === "object") {
      const r = body.reverse as { lat?: number; lng?: number }
      if (typeof r.lat !== "number" || typeof r.lng !== "number") return Response.json({ address: null, kind: "area" })
      const rev = await reverseGeocode(r.lat, r.lng)
      return Response.json(rev)
    }

    if (typeof body.place === "string" && body.place.trim()) {
      const result = await placeGeocode(body.place)
      return Response.json({ result })
    }

    if (Array.isArray(body.addresses)) {
      const addresses = body.addresses.slice(0, 400).map((a) => (typeof a === "string" ? a.trim() : ""))
      // Census → Photon → Nominatim for every address (Photon's generous limits
      // make this safe in bulk).
      const results = await mapWithConcurrency(addresses, 10, (a) => (a ? censusGeocode(a, true) : Promise.resolve(null)))

      // Fallback chain so a lead is NEVER dropped: ZIP centroid (from the
      // address) → searched-area centroid (passed by the client). Both jittered
      // and cached, so every lead gets at least an approximate pin.
      const fallback = typeof body.fallback === "string" ? body.fallback.trim() : ""
      const areaCentroid = fallback ? await placeGeocode(fallback) : null
      const zipCache = new Map<string, LatLng | null>()
      for (let i = 0; i < addresses.length; i++) {
        if (results[i] || !addresses[i]) continue
        const zip = (addresses[i].match(/\b(\d{5})\b/) ?? [])[1]
        let c: LatLng | null = null
        if (zip) { if (!zipCache.has(zip)) zipCache.set(zip, await placeGeocode(zip)); c = zipCache.get(zip) ?? null }
        if (!c) c = areaCentroid
        if (c) results[i] = jitter(c, addresses[i])
      }
      return Response.json({ results })
    }

    return Response.json({ error: "Provide { addresses: string[] } or { place: string }" }, { status: 400 })
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Geocoding failed", results: [], result: null }, { status: 200 })
  }
}
