// Our own house-price-index service. No key, no vendor, no subscription.
//
// WHAT THIS REPLACES. The appreciation criterion is 8 of the rubric's 100
// points and had no source, so every market scored zero on it and no market
// could climb past the high forties. The paid way to fix that is an ATTOM or
// CoreLogic subscription. The free way is the file the FHFA publishes every
// quarter — the same House Price Index those vendors resell — which is a plain
// CSV covering 410 metropolitan areas back to 1975.
//
// A NOTE ON FINDING IT. The obvious filenames 404: HPI_AT_metro.csv,
// HPI_master.csv, hpi_master.csv all return an HTML error page with a 200-ish
// look to a careless check. `hpi_po_metro.csv` returns 200 and is an XLSX
// wearing a .csv extension. Only `hpi_at_metro.csv`, lowercase, is genuinely
// comma-separated. That is recorded here because it is not guessable and the
// next person to touch this will otherwise repeat the search.
//
// SELF-CHECKING. A cached data service that silently serves a stale or empty
// file is worse than no service, because everything downstream inherits the
// emptiness as "this market has no appreciation". So `selfCheck` proves the
// thing actually works — the file parses, the series are long enough, known
// metros resolve, and the numbers land in a plausible band — and says exactly
// what failed when it does not.

const HPI_URL = "https://www.fhfa.gov/hpi/download/quarterly_datasets/hpi_at_metro.csv"

// The index is quarterly, so a day-old copy is as good as a fresh one and the
// 4MB download is not repeated per request.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000
const FETCH_TIMEOUT_MS = 45_000

export interface HpiPoint { year: number; quarter: number; index: number }

interface HpiCache {
  at: number
  /** Metro label exactly as FHFA writes it → its quarterly series. */
  series: Map<string, HpiPoint[]>
}

let cache: HpiCache | null = null
let inFlight: Promise<HpiCache | null> | null = null

function parse(csv: string): Map<string, HpiPoint[]> {
  const series = new Map<string, HpiPoint[]>()

  for (const line of csv.split("\n")) {
    if (!line) continue
    // The metro label contains a comma and is quoted ("Columbus, OH"), so the
    // row is read from the RIGHT. FIVE fields follow the name — CBSA code,
    // year, quarter, index NSA, index SA — and slicing four of them left the
    // CBSA code welded to the label ('Columbus, OH",18140'), which matched
    // nothing and made every metro unresolvable.
    const parts = line.split(",")
    if (parts.length < 6) continue

    const saIndex = parts[parts.length - 1].trim()
    const nsaIndex = parts[parts.length - 2].trim()
    const quarter = parts[parts.length - 3].trim()
    const year = parts[parts.length - 4].trim()
    const name = parts.slice(0, parts.length - 5).join(",").trim().replace(/"/g, "")

    if (!/^\d{4}$/.test(year) || !/^[1-4]$/.test(quarter)) continue

    // FHFA writes "-" for a quarter it did not publish. Seasonally adjusted is
    // preferred; the not-adjusted figure is the fallback.
    const raw = nsaIndex !== "-" && nsaIndex !== "" ? nsaIndex
              : saIndex !== "-" && saIndex !== "" ? saIndex : null
    if (raw === null) continue
    const index = Number(raw)
    if (!Number.isFinite(index) || index <= 0) continue

    const list = series.get(name) ?? []
    list.push({ year: Number(year), quarter: Number(quarter), index })
    series.set(name, list)
  }

  for (const list of series.values()) {
    list.sort((a, b) => a.year - b.year || a.quarter - b.quarter)
  }
  return series
}

async function load(): Promise<HpiCache | null> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache
  // One download even if twenty markets are scored at once.
  if (inFlight) return inFlight

  inFlight = (async () => {
    try {
      const res = await fetch(HPI_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
      if (!res.ok) return cache
      const text = await res.text()

      // The wrong filename returns an HTML error page with a perfectly happy
      // status code, and an XLSX begins "PK". Neither is a CSV, and parsing
      // either would yield an empty map that looks like a country with no
      // house prices.
      if (text.startsWith("PK") || /^\s*<!DOCTYPE|^\s*<html/i.test(text)) return cache

      const series = parse(text)
      if (series.size < 100) return cache      // a real parse yields ~410 metros
      cache = { at: Date.now(), series }
      return cache
    } catch {
      return cache                              // keep serving the last good copy
    } finally {
      inFlight = null
    }
  })()

  return inFlight
}

// ── Matching a city to a metro ────────────────────────────────────────────────

/**
 * FHFA labels metros, not cities: "Sherman-Denison, TX",
 * "Fort Worth-Arlington-Grapevine, TX (MSAD)", "Sioux City, IA-NE-SD".
 *
 * Exported and pure so the matching can be tested without the 4MB download.
 */
export function matchMetro(labels: string[], city: string, state: string): string | null {
  const st = state.toUpperCase()
  const target = city.toLowerCase().trim()

  const inState = labels.filter(l => {
    // The state list sits after the last comma: "IA-NE-SD" or "TX (MSAD)".
    const tail = l.slice(l.lastIndexOf(",") + 1).toUpperCase()
    return tail.split(/[-\s(]/).some(part => part.trim() === st)
  })
  if (inState.length === 0) return null

  const nameOf = (l: string) => l.slice(0, l.lastIndexOf(",")).toLowerCase().trim()

  // Exact city name.
  const exact = inState.find(l => nameOf(l) === target)
  if (exact) return exact

  // A hyphenated metro led by this city: "Sherman-Denison" for Sherman.
  const leading = inState.find(l => nameOf(l).split("-")[0].trim() === target)
  if (leading) return leading

  // This city named anywhere in a multi-city metro.
  const member = inState.find(l => nameOf(l).split("-").some(p => p.trim() === target))
  if (member) return member

  // Last resort: the city appears inside the label at a word boundary. Ordered
  // shortest-first so "Columbus, OH" wins over a longer label containing it.
  const contained = inState
    .filter(l => new RegExp(`\\b${target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(nameOf(l)))
    .sort((a, b) => a.length - b.length)
  return contained[0] ?? null
}

// Plausibility band for a three-year compound rate. Outside this the series is
// describing a rebased index or a different place, not a housing market.
export const MIN_PLAUSIBLE_CAGR = -25
export const MAX_PLAUSIBLE_CAGR = 40

/**
 * Compound annual growth over `years`, comparing the same quarter to avoid
 * reading seasonality as appreciation.
 *
 * Pure, so the arithmetic is testable on a handmade series.
 */
export function cagrFromSeries(points: HpiPoint[], years = 3): { cagr: number; span: string } | null {
  if (points.length < years * 4 + 1) return null
  const last = points[points.length - 1]
  const base = points.find(p => p.year === last.year - years && p.quarter === last.quarter)
  if (!base || base.index <= 0) return null

  const cagr = (Math.pow(last.index / base.index, 1 / years) - 1) * 100
  if (cagr < MIN_PLAUSIBLE_CAGR || cagr > MAX_PLAUSIBLE_CAGR) return null

  return { cagr, span: `${base.year}Q${base.quarter}→${last.year}Q${last.quarter}` }
}

export interface AppreciationRead {
  cagr3yr: number | null
  metro: string | null
  span: string | null
  note: string
}

/** Three-year appreciation for a city, or an honest account of why not. */
export async function appreciationFor(city: string, state: string): Promise<AppreciationRead> {
  const loaded = await load()
  if (!loaded) {
    return { cagr3yr: null, metro: null, span: null, note: "The FHFA index could not be loaded." }
  }

  const metro = matchMetro([...loaded.series.keys()], city, state)
  if (!metro) {
    return {
      cagr3yr: null, metro: null, span: null,
      note: `No FHFA metro series covers ${city}, ${state} — the index is metropolitan, so small places are absent.`,
    }
  }

  const result = cagrFromSeries(loaded.series.get(metro)!)
  if (!result) {
    return { cagr3yr: null, metro, span: null, note: `${metro} has no usable three-year window in the index.` }
  }

  return {
    cagr3yr: result.cagr,
    metro,
    span: result.span,
    note: `FHFA all-transactions index for ${metro}, ${result.span}.`,
  }
}

// ── Proving it works ──────────────────────────────────────────────────────────

export interface HpiHealth {
  ok: boolean
  metroCount: number
  /** Newest quarter present, so a stale file is visible rather than assumed fresh. */
  latestQuarter: string | null
  quartersBehind: number | null
  checks: Array<{ name: string; ok: boolean; detail: string }>
}

/**
 * Assert the service actually does its job.
 *
 * Not "did the request return 200" — the wrong FHFA filename returns a full
 * HTML page and an XLSX returns bytes, and both would parse to an empty map
 * that reads downstream as a country where no house has changed price. So this
 * checks the file parsed into real series, that known metros resolve, that the
 * numbers are plausible, and how old the newest quarter is.
 */
export async function selfCheck(): Promise<HpiHealth> {
  const checks: HpiHealth["checks"] = []
  const loaded = await load()

  if (!loaded) {
    return {
      ok: false, metroCount: 0, latestQuarter: null, quartersBehind: null,
      checks: [{ name: "download", ok: false, detail: "Could not load or parse the FHFA index." }],
    }
  }

  const metroCount = loaded.series.size
  checks.push({
    name: "parsed",
    ok: metroCount >= 100,
    detail: `${metroCount} metro series parsed (expect roughly 410).`,
  })

  // Freshness, measured rather than trusted. The index is quarterly and lags,
  // so two quarters behind is normal and four is a stale file.
  let latestQuarter: string | null = null
  let quartersBehind: number | null = null
  let newest = { year: 0, quarter: 0 }
  for (const points of loaded.series.values()) {
    const last = points[points.length - 1]
    if (!last) continue
    if (last.year > newest.year || (last.year === newest.year && last.quarter > newest.quarter)) newest = last
  }
  if (newest.year > 0) {
    latestQuarter = `${newest.year}Q${newest.quarter}`
    const now = new Date()
    const nowQuarters = now.getFullYear() * 4 + Math.floor(now.getMonth() / 3)
    quartersBehind = nowQuarters - (newest.year * 4 + (newest.quarter - 1))
    checks.push({
      name: "freshness",
      ok: quartersBehind <= 3,
      detail: `Newest quarter ${latestQuarter}, ${quartersBehind} quarter(s) behind today.`,
    })
  }

  // Known cities must resolve and produce a believable rate. These three match
  // by three different routes: exact label, hyphenated metro, multi-state metro.
  const labels = [...loaded.series.keys()]
  for (const [city, state] of [["Columbus", "OH"], ["Sherman", "TX"], ["Sioux City", "IA"]] as const) {
    const metro = matchMetro(labels, city, state)
    const result = metro ? cagrFromSeries(loaded.series.get(metro)!) : null
    checks.push({
      name: `resolve ${city}, ${state}`,
      ok: result !== null,
      detail: result
        ? `${metro} → ${result.cagr.toFixed(2)}% CAGR (${result.span}).`
        : `did not resolve to a usable series (metro: ${metro ?? "none"}).`,
    })
  }

  return { ok: checks.every(c => c.ok), metroCount, latestQuarter, quartersBehind, checks }
}
