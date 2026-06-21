// Client-side geocoding for the Live Distress Map.
//
// Calls our own /api/geocode proxy (NOT the geocoders directly) because the
// free U.S. Census geocoder sends no CORS headers — direct browser calls are
// blocked and produce zero pins. The proxy hits Census (street addresses, free,
// no key, US-only) and Nominatim (ZIP-aware place/city look-ups) server-side.
//
// Design rules:
//   • ZERO cost, ZERO API key.
//   • NEVER touches the server SEARCH path — geocoding runs only when the map
//     is open, so it can't slow down or break a search.
//   • Every result is cached in localStorage, so any address is geocoded at most
//     once ever; repeat searches are instant and hit no network.
//   • Fully null-safe; never throws.

export interface LatLng { lat: number; lng: number }

const CACHE_PREFIX = "ap_geo_v2:"
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

function isValid(ll: unknown): ll is LatLng {
  const v = ll as LatLng | null
  return Boolean(
    v && typeof v.lat === "number" && typeof v.lng === "number" &&
    Number.isFinite(v.lat) && Number.isFinite(v.lng) &&
    !(v.lat === 0 && v.lng === 0),
  )
}

async function postJson(body: unknown, ms: number): Promise<unknown | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    const res = await fetch("/api/geocode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

const oneLine = (l: { address: string; city?: string; state?: string; zip?: string }): string =>
  [l.address, l.city, l.state, l.zip].filter(Boolean).join(", ").trim()

// ── Single street address → lat/lng ───────────────────────────────────────────
export async function geocodeAddress(oneLineAddress: string): Promise<LatLng | null> {
  const q = (oneLineAddress || "").trim()
  if (!q) return null
  const cached = readCache(q)
  if (cached !== undefined) return cached

  const data = await postJson({ addresses: [q] }, 12000) as { results?: (LatLng | null)[] } | null
  if (!data) return null // transient failure — don't cache, allow retry
  const ll = data.results?.[0]
  if (isValid(ll)) { writeCache(q, ll); return ll }
  writeCache(q, null) // a real miss — cache it
  return null
}

// ── Street address → standardized city + ZIP (server-side, Census) ────────────
// The CA-DOJ registry returns bare street addresses with no city/zip, so a small
// city search can't tell Temple City from neighboring El Monte. Census's
// onelineaddress geocoder returns the canonical city + ZIP for an address, which
// lets us scope results to the city actually searched. Cached in-module.
export interface AddrComponents { city: string | null; zip: string | null; lat: number | null; lng: number | null }
const CENSUS_ONELINE = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress"
const compCache = new Map<string, AddrComponents | null>()

export async function geocodeAddressComponents(address: string, state?: string): Promise<AddrComponents | null> {
  if (!address?.trim()) return null
  const q = [address.trim(), state].filter(Boolean).join(", ")
  if (compCache.has(q)) return compCache.get(q)!
  try {
    const url = `${CENSUS_ONELINE}?address=${encodeURIComponent(q)}&benchmark=Public_AR_Current&format=json`
    const res = await fetch(url, { signal: AbortSignal.timeout(7000) })
    if (!res.ok) { compCache.set(q, null); return null }
    const data = (await res.json()) as { result?: { addressMatches?: Array<{ coordinates?: { x: number; y: number }; addressComponents?: { city?: string; zip?: string } }> } }
    const m = data.result?.addressMatches?.[0]
    if (!m) { compCache.set(q, null); return null }
    const out: AddrComponents = { city: m.addressComponents?.city ?? null, zip: m.addressComponents?.zip ?? null, lat: m.coordinates?.y ?? null, lng: m.coordinates?.x ?? null }
    compCache.set(q, out)
    return out
  } catch { compCache.set(q, null); return null }
}

// ── Place / city / ZIP → lat/lng (ZIP-aware on the server) ────────────────────
export async function geocodePlace(query: string): Promise<LatLng | null> {
  const q = (query || "").trim()
  if (!q) return null
  const cached = readCache("place:" + q)
  if (cached !== undefined) return cached

  const data = await postJson({ place: q }, 12000) as { result?: LatLng | null } | null
  if (!data) return null
  const ll = data.result
  if (isValid(ll)) { writeCache("place:" + q, ll); return ll }
  writeCache("place:" + q, null)
  return null
}

// ── lat/lng → nearest street address (click-to-analyze) ───────────────────────
export interface ReverseResult { address: string | null; kind: "parcel" | "road" | "area" }
export async function reverseGeocode(lat: number, lng: number): Promise<ReverseResult> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { address: null, kind: "area" }
  const data = await postJson({ reverse: { lat, lng } }, 12000) as ReverseResult | null
  return { address: data?.address ?? null, kind: data?.kind ?? "area" }
}

// ── Bulk geocode lead addresses ───────────────────────────────────────────────
// Resolves cached addresses instantly, then batches the rest through the proxy
// in chunks so pins appear progressively instead of all at once.
export async function geocodeLeads<T extends { address: string; city?: string; state?: string; zip?: string }>(
  leads: T[],
  onResult: (index: number, coords: LatLng) => void,
  opts?: { signal?: AbortSignal; chunkSize?: number; fallbackPlace?: string },
): Promise<void> {
  const chunkSize = opts?.chunkSize ?? 40
  const fallback = opts?.fallbackPlace || undefined

  // 1) Serve anything already cached immediately (no network). Note: we do NOT
  //    short-circuit cached "null" (miss) — the server can now place it at the
  //    area centroid, so we re-send misses to give every lead a pin.
  const pending: { index: number; line: string }[] = []
  for (let i = 0; i < leads.length; i++) {
    const line = oneLine(leads[i])
    if (!line) continue
    const cached = readCache(line)
    if (cached) { onResult(i, cached); continue }
    pending.push({ index: i, line })
  }

  // 2) Geocode the rest in chunks via the proxy (with an area-centroid fallback
  //    so a lead is never dropped — at worst it lands in the searched area).
  for (let c = 0; c < pending.length; c += chunkSize) {
    if (opts?.signal?.aborted) return
    const slice = pending.slice(c, c + chunkSize)
    const data = await postJson({ addresses: slice.map((s) => s.line), fallback }, 30000) as { results?: (LatLng | null)[] } | null
    if (opts?.signal?.aborted) return
    const results = data?.results ?? []
    slice.forEach((s, k) => {
      const ll = results[k]
      if (isValid(ll)) { writeCache(s.line, ll); onResult(s.index, ll) }
    })
  }
}
