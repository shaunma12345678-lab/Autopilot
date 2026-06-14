// Client-side geocoding for the Live Distress Map.
//
// Design rules (match the rest of the intelligence layer):
//   • ZERO cost, ZERO API key — uses the free U.S. Census geocoder for street
//     addresses (no key, no rate limit, US-only) and free OpenStreetMap
//     Nominatim for place/city look-ups (one call per search).
//   • NEVER touches the server search path — runs only in the browser when the
//     map is open, so it can never slow down or break a search.
//   • Every result is cached in localStorage, so any given address is geocoded
//     at most once, ever. Repeat searches are instant and hit no network.
//   • Every function is fully null-safe and never throws.

export interface LatLng { lat: number; lng: number }

const CACHE_PREFIX = "ap_geo_v1:"
const MEM_CACHE = new Map<string, LatLng | null>()

function cacheKey(q: string): string {
  return CACHE_PREFIX + q.trim().toLowerCase().replace(/\s+/g, " ")
}

function readCache(q: string): LatLng | null | undefined {
  const key = cacheKey(q)
  if (MEM_CACHE.has(key)) return MEM_CACHE.get(key)
  if (typeof window === "undefined") return undefined
  try {
    const raw = window.localStorage.getItem(key)
    if (raw === null) return undefined
    const parsed = raw === "null" ? null : (JSON.parse(raw) as LatLng)
    MEM_CACHE.set(key, parsed)
    return parsed
  } catch {
    return undefined
  }
}

function writeCache(q: string, value: LatLng | null): void {
  const key = cacheKey(q)
  MEM_CACHE.set(key, value)
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(key, value ? JSON.stringify(value) : "null")
  } catch {
    /* localStorage full or unavailable — in-memory cache still applies */
  }
}

function isValid(lat: unknown, lng: unknown): lat is number {
  return (
    typeof lat === "number" && typeof lng === "number" &&
    Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 &&
    !(lat === 0 && lng === 0)
  )
}

async function fetchWithTimeout(url: string, ms: number, init?: RequestInit): Promise<Response | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

// ── Street address → lat/lng (U.S. Census, free, no key, US-only) ─────────────
export async function geocodeAddress(oneLineAddress: string): Promise<LatLng | null> {
  const q = (oneLineAddress || "").trim()
  if (!q) return null

  const cached = readCache(q)
  if (cached !== undefined) return cached

  const url =
    "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress" +
    `?address=${encodeURIComponent(q)}` +
    "&benchmark=Public_AR_Current&format=json"

  const res = await fetchWithTimeout(url, 8000)
  if (!res || !res.ok) {
    // Don't cache transient network failures — allow a later retry.
    return null
  }

  try {
    const data = await res.json()
    const match = data?.result?.addressMatches?.[0]
    const lng = match?.coordinates?.x
    const lat = match?.coordinates?.y
    if (isValid(lat, lng)) {
      const ll = { lat, lng }
      writeCache(q, ll)
      return ll
    }
    // A real "no match" response — cache the miss so we don't ask again.
    writeCache(q, null)
    return null
  } catch {
    return null
  }
}

// ── Free-text place / city / zip → lat/lng (OpenStreetMap Nominatim) ──────────
// Used once per search to fly the map to where the user is looking. Nominatim
// understands "Riverside, CA", "91710", and full street addresses alike.
export async function geocodePlace(query: string): Promise<LatLng | null> {
  const q = (query || "").trim()
  if (!q) return null

  const cached = readCache("place:" + q)
  if (cached !== undefined) return cached

  const url =
    "https://nominatim.openstreetmap.org/search" +
    `?q=${encodeURIComponent(q)}&format=json&limit=1&countrycodes=us`

  const res = await fetchWithTimeout(url, 8000, {
    headers: { Accept: "application/json" },
  })
  if (!res || !res.ok) return null

  try {
    const arr = await res.json()
    const first = Array.isArray(arr) ? arr[0] : null
    const lat = first ? parseFloat(first.lat) : NaN
    const lng = first ? parseFloat(first.lon) : NaN
    if (isValid(lat, lng)) {
      const ll = { lat, lng }
      writeCache("place:" + q, ll)
      return ll
    }
    writeCache("place:" + q, null)
    return null
  } catch {
    return null
  }
}

// ── Bulk geocode lead addresses with bounded concurrency ──────────────────────
// Calls onResult for each lead as soon as its coordinates resolve, so pins can
// appear progressively rather than all-at-once after a long wait.
export async function geocodeLeads<T extends { address: string; city?: string; state?: string; zip?: string }>(
  leads: T[],
  onResult: (index: number, coords: LatLng) => void,
  opts?: { concurrency?: number; signal?: AbortSignal },
): Promise<void> {
  const concurrency = opts?.concurrency ?? 6
  let cursor = 0

  const oneLine = (l: T): string =>
    [l.address, l.city, l.state, l.zip].filter(Boolean).join(", ").trim()

  async function worker(): Promise<void> {
    while (cursor < leads.length) {
      if (opts?.signal?.aborted) return
      const i = cursor++
      const lead = leads[i]
      const line = oneLine(lead)
      if (!line) continue
      const coords = await geocodeAddress(line)
      if (opts?.signal?.aborted) return
      if (coords) onResult(i, coords)
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, leads.length) }, () => worker())
  await Promise.all(workers)
}
