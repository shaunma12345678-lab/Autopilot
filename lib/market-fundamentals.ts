// Our own market-fundamentals engine — REAL data, NO API key, no signup.
//
// Replaces the key-walled Census API with free, keyless public sources we query
// directly from the datacenter:
//   • Wikidata SPARQL  → population + a real multi-year population time-series
//                        (so growth is measured, not guessed). Keyless.
//   • BLS LAUS (v1)    → state unemployment rate, current month. Keyless.
// Combined with our proprietary deep-search deal signals (distress, equity,
// gems, rent yield) this scores a market on REAL fundamentals an investor
// screens on — population growth + low unemployment — with zero setup.
//
// Best-effort: any source failing returns null for that metric and the score
// normalizes over what we actually have. Never throws.

export interface Fundamentals {
  population:       number | null
  popGrowth5yr:    number | null   // % growth, normalized to a 5-year-equivalent from the census time-series
  medianIncome:    number | null   // populated only when a source has it; usually null (kept for shape)
  povertyRate:     number | null
  unemploymentRate: number | null  // % — BLS state LAUS, current
  growthFrom?:     string          // human note on the growth period, e.g. "2010→2020"
  source?:         string
}

const STATE_FIPS: Record<string, string> = {
  AL: "01", AK: "02", AZ: "04", AR: "05", CA: "06", CO: "08", CT: "09", DE: "10", DC: "11",
  FL: "12", GA: "13", HI: "15", ID: "16", IL: "17", IN: "18", IA: "19", KS: "20", KY: "21",
  LA: "22", ME: "23", MD: "24", MA: "25", MI: "26", MN: "27", MS: "28", MO: "29", MT: "30",
  NE: "31", NV: "32", NH: "33", NJ: "34", NM: "35", NY: "36", NC: "37", ND: "38", OH: "39",
  OK: "40", OR: "41", PA: "42", RI: "44", SC: "45", SD: "46", TN: "47", TX: "48", UT: "49",
  VT: "50", VA: "51", WA: "53", WV: "54", WI: "55", WY: "56",
}

const STATE_NAME: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado",
  CT: "Connecticut", DE: "Delaware", DC: "Washington, D.C.", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas",
  KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts",
  MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico",
  NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma",
  OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
  TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
}

// No key needed anymore — our sources are public. Always "configured".
export const isFundamentalsConfigured = () => true

const num = (v: unknown): number | null => { const n = Number(v); return Number.isFinite(n) ? n : null }

// ── Wikidata: population + real population time-series ──────────────────────
interface PopPoint { pop: number; year: number | null }

async function fetchWikidata(city: string, state: string): Promise<{ population: number | null; growth5yr: number | null; growthFrom?: string; medianIncome: number | null } | null> {
  const stateName = STATE_NAME[(state || "").toUpperCase()]
  if (!stateName || !city.trim()) return null
  // Escape double-quotes in labels for the SPARQL string literal.
  const c = city.trim().replace(/\\/g, "\\\\").replace(/"/g, '\\"')
  const s = stateName.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
  // Resolve the city by exact English label located within the state, and pull
  // every population statement with its point-in-time qualifier (the series).
  const query = `SELECT ?city ?pop ?t ?inc WHERE {
    ?city rdfs:label "${c}"@en ; wdt:P131* ?st .
    ?st rdfs:label "${s}"@en .
    ?city p:P1082 ?ps . ?ps ps:P1082 ?pop . OPTIONAL { ?ps pq:P585 ?t }
    OPTIONAL { ?city wdt:P3529 ?inc }
  } ORDER BY DESC(?pop) LIMIT 40`
  try {
    const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`
    const res = await fetch(url, {
      headers: { Accept: "application/sparql-results+json", "User-Agent": "AutoPilotRE/1.0 (markets@autopilot.app)" },
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { results?: { bindings?: Array<Record<string, { value: string }>> } }
    const rows = data.results?.bindings ?? []
    if (!rows.length) return null

    // Group population points by city entity; pick the entity with the largest
    // current population (disambiguates same-named places, e.g. Springfields).
    const byCity = new Map<string, { points: PopPoint[]; inc: number | null }>()
    for (const r of rows) {
      const id = r.city?.value
      const pop = num(r.pop?.value)
      if (!id || pop == null) continue
      const yr = r.t?.value ? Number(r.t.value.slice(0, 4)) : null
      const entry = byCity.get(id) ?? { points: [], inc: null }
      entry.points.push({ pop, year: Number.isFinite(yr) ? yr : null })
      if (entry.inc == null && r.inc?.value) entry.inc = num(r.inc.value)
      byCity.set(id, entry)
    }
    let best: { points: PopPoint[]; inc: number | null } | null = null
    let bestPop = -1
    for (const e of byCity.values()) {
      const cur = Math.max(...e.points.map((p) => p.pop))
      if (cur > bestPop) { bestPop = cur; best = e }
    }
    if (!best) return null

    const dated = best.points.filter((p) => p.year != null).sort((a, b) => b.year! - a.year!)
    const population = dated.length ? dated[0].pop : Math.max(...best.points.map((p) => p.pop))

    // Real growth: newest dated point vs the oldest dated point ≥3yr apart,
    // annualized then normalized to a 5-year-equivalent for comparability.
    let growth5yr: number | null = null
    let growthFrom: string | undefined
    if (dated.length >= 2) {
      const newest = dated[0]
      const older = dated.find((p) => newest.year! - p.year! >= 3)
      if (older && older.pop > 0) {
        const yrs = newest.year! - older.year!
        const annual = Math.pow(newest.pop / older.pop, 1 / yrs) - 1
        growth5yr = Math.round((Math.pow(1 + annual, 5) - 1) * 1000) / 10
        growthFrom = `${older.year}→${newest.year}`
      }
    }
    return { population, growth5yr, growthFrom, medianIncome: best.inc }
  } catch {
    return null
  }
}

// ── BLS: state unemployment rate (keyless v1), cached per-state in-module ───
const blsCache = new Map<string, number | null>()

async function fetchUnemployment(state: string): Promise<number | null> {
  const fips = STATE_FIPS[(state || "").toUpperCase()]
  if (!fips) return null
  if (blsCache.has(fips)) return blsCache.get(fips)!
  const series = `LASST${fips}0000000000003` // statewide unemployment rate, seasonally adjusted
  try {
    const year = new Date().getFullYear()
    const res = await fetch("https://api.bls.gov/publicAPI/v1/timeseries/data/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seriesid: [series], startyear: String(year - 1), endyear: String(year) }),
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) { blsCache.set(fips, null); return null }
    const data = (await res.json()) as { Results?: { series?: Array<{ data?: Array<{ value: string }> }> } }
    const points = data.Results?.series?.[0]?.data ?? []
    for (const p of points) {           // newest first; skip placeholder "-"
      const v = num(p.value)
      if (v != null && p.value !== "-") { blsCache.set(fips, v); return v }
    }
    blsCache.set(fips, null)
    return null
  } catch {
    blsCache.set(fips, null)
    return null
  }
}

export async function fetchFundamentals(city: string, state: string): Promise<Fundamentals | null> {
  const [wiki, unemploymentRate] = await Promise.all([
    fetchWikidata(city, state).catch(() => null),
    fetchUnemployment(state).catch(() => null),
  ])
  if (!wiki && unemploymentRate == null) return null
  return {
    population:       wiki?.population ?? null,
    popGrowth5yr:     wiki?.growth5yr ?? null,
    medianIncome:     wiki?.medianIncome ?? null,
    povertyRate:      null,
    unemploymentRate,
    growthFrom:       wiki?.growthFrom,
    source:           "Wikidata · BLS",
  }
}

// Score a market against the investor's fundamentals criteria (0-100) with the
// reasons. Higher = better: population growth, low unemployment, low poverty,
// healthy income. Only scores the metrics we actually have (normalizes by max).
export function fundamentalsScore(f: Fundamentals | null): { score: number; reasons: string[] } | null {
  if (!f) return null
  const reasons: string[] = []
  let pts = 0, max = 0
  if (f.popGrowth5yr != null)     { max += 35; pts += Math.max(0, Math.min(35, (f.popGrowth5yr + 2) * 6)); reasons.push(`${f.popGrowth5yr > 0 ? "+" : ""}${f.popGrowth5yr}% population${f.growthFrom ? ` (${f.growthFrom}, 5yr-equiv)` : ""}`) }
  if (f.unemploymentRate != null) { max += 35; pts += Math.max(0, Math.min(35, (8 - f.unemploymentRate) * 7)); reasons.push(`${f.unemploymentRate}% unemployment`) }
  if (f.povertyRate != null)      { max += 15; pts += Math.max(0, Math.min(15, (22 - f.povertyRate))); reasons.push(`${f.povertyRate}% poverty`) }
  if (f.medianIncome != null)     { max += 15; pts += Math.max(0, Math.min(15, (f.medianIncome - 35000) / 2700)); reasons.push(`$${Math.round(f.medianIncome / 1000)}k median income`) }
  const score = max > 0 ? Math.round((pts / max) * 100) : 0
  return { score, reasons }
}
