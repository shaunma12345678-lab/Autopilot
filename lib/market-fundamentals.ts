// Our own market-fundamentals engine — REAL data, NO API key, no signup.
//
// Primary source: Census Reporter (api.censusreporter.org) — a free, keyless
// API that serves the Census Bureau's American Community Survey. It gives the
// full investor screen for any city, auto-selecting the 1-year release for big
// places and the 5-year for small ones:
//   • population, median household income, poverty rate, unemployment rate
//   • median HOME VALUE + median GROSS RENT  (real — replaces the distressed
//     lead sample that skewed the market value/rent)
//   • vacancy rate
// Plus Wikidata SPARQL for a real multi-year population time-series → measured
// population growth. Both keyless, both queried straight from the datacenter.
//
// Best-effort: any source failing returns null for that metric and the scores
// normalize over what we actually have. Never throws.

export interface Fundamentals {
  population:       number | null
  popGrowth5yr:    number | null   // % growth, normalized to a 5-year-equivalent from the census time-series
  medianIncome:    number | null
  povertyRate:     number | null   // %
  unemploymentRate: number | null  // %
  medianHomeValue: number | null   // $ — real ACS median owner-occupied value
  medianRent:      number | null   // $ — real ACS median gross rent (monthly)
  vacancyRate:     number | null   // % of housing units vacant
  priceToIncome:   number | null   // home value / household income (affordability)
  grossYield:      number | null   // annual rent / home value, % (cash-flow signal)
  growthFrom?:     string          // the growth period, e.g. "2010→2020"
  source?:         string
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

// No key needed — our sources are public. Always "configured".
export const isFundamentalsConfigured = () => true

const num = (v: unknown): number | null => { const n = Number(v); return Number.isFinite(n) ? n : null }
const UA = "AutoPilotRE/1.0 (markets@autopilot.app)"

// ── Census Reporter: real ACS current metrics (keyless) ─────────────────────
interface CensusMetrics {
  population: number | null; medianIncome: number | null; povertyRate: number | null
  unemploymentRate: number | null; medianHomeValue: number | null; medianRent: number | null; vacancyRate: number | null
}

async function resolveGeoid(city: string, state: string): Promise<string | null> {
  const st = (state || "").toLowerCase().trim()
  const target = city.toLowerCase().trim()
  const url = `https://api.censusreporter.org/1.0/geo/search?q=${encodeURIComponent(city)}&sumlevel=160`
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(10000) })
  if (!res.ok) return null
  const json = (await res.json()) as { results?: Array<{ full_geoid: string; full_name: string; sumlevel: string }> }
  let exact: string | null = null, loose: string | null = null
  for (const r of json.results ?? []) {
    if (r.sumlevel !== "160") continue
    const fn = r.full_name.toLowerCase()
    const idx = fn.lastIndexOf(", ")
    if (idx < 0) continue
    const namePart = fn.slice(0, idx).trim()
    const statePart = fn.slice(idx + 2).trim()
    if (st && statePart !== st) continue
    if (namePart === target) { exact = r.full_geoid; break }
    if (!loose && (namePart.startsWith(target) || namePart.split(/[\s-]/)[0] === target)) loose = r.full_geoid
  }
  return exact ?? loose
}

async function fetchCensusReporter(city: string, state: string): Promise<CensusMetrics | null> {
  try {
    const geoid = await resolveGeoid(city, state)
    if (!geoid) return null
    const tables = "B01003,B19013,B17001,B23025,B25077,B25064,B25002"
    const url = `https://api.censusreporter.org/1.0/data/show/latest?table_ids=${tables}&geo_ids=${geoid}`
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(12000) })
    if (!res.ok) return null
    const json = (await res.json()) as { data?: Record<string, Record<string, { estimate?: Record<string, number> }>> }
    const g = json.data?.[geoid]
    if (!g) return null
    const est = (t: string, c: string): number | null => num(g[t]?.estimate?.[c])
    const povPop = est("B17001", "B17001002"), povUniv = est("B17001", "B17001001")
    const unemp = est("B23025", "B23025005"), labor = est("B23025", "B23025003")
    const vac = est("B25002", "B25002003"), totUnits = est("B25002", "B25002001")
    return {
      population:       est("B01003", "B01003001"),
      medianIncome:     est("B19013", "B19013001"),
      povertyRate:      povPop != null && povUniv ? Math.round((povPop / povUniv) * 1000) / 10 : null,
      unemploymentRate: unemp != null && labor ? Math.round((unemp / labor) * 1000) / 10 : null,
      medianHomeValue:  est("B25077", "B25077001"),
      medianRent:       est("B25064", "B25064001"),
      vacancyRate:      vac != null && totUnits ? Math.round((vac / totUnits) * 1000) / 10 : null,
    }
  } catch {
    return null
  }
}

// ── Wikidata: real population growth from the time-series (keyless) ──────────
interface PopPoint { pop: number; year: number | null }

async function fetchWikidataGrowth(city: string, state: string): Promise<{ population: number | null; growth5yr: number | null; growthFrom?: string } | null> {
  const stateName = STATE_NAME[(state || "").toUpperCase()]
  if (!stateName || !city.trim()) return null
  const c = city.trim().replace(/\\/g, "\\\\").replace(/"/g, '\\"')
  const s = stateName.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
  const query = `SELECT ?city ?pop ?t WHERE {
    ?city rdfs:label "${c}"@en ; wdt:P131* ?st .
    ?st rdfs:label "${s}"@en .
    ?city p:P1082 ?ps . ?ps ps:P1082 ?pop . OPTIONAL { ?ps pq:P585 ?t }
  } ORDER BY DESC(?pop) LIMIT 40`
  try {
    const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`
    const res = await fetch(url, { headers: { Accept: "application/sparql-results+json", "User-Agent": UA }, signal: AbortSignal.timeout(12000) })
    if (!res.ok) return null
    const data = (await res.json()) as { results?: { bindings?: Array<Record<string, { value: string }>> } }
    const rows = data.results?.bindings ?? []
    if (!rows.length) return null
    const byCity = new Map<string, PopPoint[]>()
    for (const r of rows) {
      const id = r.city?.value
      const pop = num(r.pop?.value)
      if (!id || pop == null) continue
      const yr = r.t?.value ? Number(r.t.value.slice(0, 4)) : null
      const pts = byCity.get(id) ?? []
      pts.push({ pop, year: Number.isFinite(yr) ? yr : null })
      byCity.set(id, pts)
    }
    let best: PopPoint[] | null = null, bestPop = -1
    for (const pts of byCity.values()) {
      const cur = Math.max(...pts.map((p) => p.pop))
      if (cur > bestPop) { bestPop = cur; best = pts }
    }
    if (!best) return null
    const dated = best.filter((p) => p.year != null).sort((a, b) => b.year! - a.year!)
    const population = dated.length ? dated[0].pop : Math.max(...best.map((p) => p.pop))
    let growth5yr: number | null = null, growthFrom: string | undefined
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
    return { population, growth5yr, growthFrom }
  } catch {
    return null
  }
}

export async function fetchFundamentals(city: string, state: string): Promise<Fundamentals | null> {
  const [cr, wiki] = await Promise.all([
    fetchCensusReporter(city, state).catch(() => null),
    fetchWikidataGrowth(city, state).catch(() => null),
  ])
  if (!cr && !wiki) return null
  const population      = cr?.population ?? wiki?.population ?? null
  const medianHomeValue = cr?.medianHomeValue ?? null
  const medianIncome    = cr?.medianIncome ?? null
  const medianRent      = cr?.medianRent ?? null
  const priceToIncome   = medianHomeValue && medianIncome ? Math.round((medianHomeValue / medianIncome) * 10) / 10 : null
  const grossYield      = medianHomeValue && medianRent ? Math.round(((medianRent * 12) / medianHomeValue) * 1000) / 10 : null
  return {
    population,
    popGrowth5yr:     wiki?.growth5yr ?? null,
    medianIncome,
    povertyRate:      cr?.povertyRate ?? null,
    unemploymentRate: cr?.unemploymentRate ?? null,
    medianHomeValue,
    medianRent,
    vacancyRate:      cr?.vacancyRate ?? null,
    priceToIncome,
    grossYield,
    growthFrom:       wiki?.growthFrom,
    source:           cr && wiki ? "Census ACS · Wikidata" : cr ? "Census ACS" : "Wikidata",
  }
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

// Current market health (0-100): population growth, low unemployment, low
// poverty, healthy income, low vacancy. Only scores what we actually have.
export function fundamentalsScore(f: Fundamentals | null): { score: number; reasons: string[] } | null {
  if (!f) return null
  const reasons: string[] = []
  let pts = 0, max = 0
  if (f.popGrowth5yr != null)     { max += 30; pts += clamp((f.popGrowth5yr + 2) * 5, 0, 30); reasons.push(`${f.popGrowth5yr > 0 ? "+" : ""}${f.popGrowth5yr}% population${f.growthFrom ? ` (${f.growthFrom})` : ""}`) }
  if (f.unemploymentRate != null) { max += 25; pts += clamp((8 - f.unemploymentRate) * 5, 0, 25); reasons.push(`${f.unemploymentRate}% unemployment`) }
  if (f.vacancyRate != null)      { max += 15; pts += clamp((12 - f.vacancyRate) * 2, 0, 15); reasons.push(`${f.vacancyRate}% vacancy`) }
  if (f.povertyRate != null)      { max += 15; pts += clamp(22 - f.povertyRate, 0, 15); reasons.push(`${f.povertyRate}% poverty`) }
  if (f.medianIncome != null)     { max += 15; pts += clamp((f.medianIncome - 35000) / 2700, 0, 15); reasons.push(`$${Math.round(f.medianIncome / 1000)}k median income`) }
  const score = max > 0 ? Math.round((pts / max) * 100) : 0
  return { score, reasons }
}

// Upside / appreciation potential (0-100) — "how much can it go up?" Weights the
// forward drivers: population growth, affordability headroom (price-to-income),
// tight supply (low vacancy), and job demand (low unemployment), with a yield
// cushion. Higher = more room to appreciate.
export function upsidePotential(f: Fundamentals | null): { score: number; reasons: string[] } | null {
  if (!f) return null
  const reasons: string[] = []
  let pts = 0, max = 0
  if (f.popGrowth5yr != null)     { max += 35; pts += clamp((f.popGrowth5yr + 1) * 6, 0, 35); reasons.push(`${f.popGrowth5yr > 0 ? "+" : ""}${f.popGrowth5yr}% population growth`) }
  if (f.priceToIncome != null)    { max += 25; const sc = f.priceToIncome <= 4 ? 25 : f.priceToIncome >= 8 ? 5 : 25 - (f.priceToIncome - 4) * 5; pts += clamp(sc, 0, 25); reasons.push(`${f.priceToIncome}× price-to-income${f.priceToIncome <= 4 ? " (room to rise)" : f.priceToIncome >= 7 ? " (stretched)" : ""}`) }
  if (f.vacancyRate != null)      { max += 20; pts += clamp((12 - f.vacancyRate) * 2.2, 0, 20); reasons.push(`${f.vacancyRate}% vacancy${f.vacancyRate <= 6 ? " (tight supply)" : ""}`) }
  if (f.unemploymentRate != null) { max += 20; pts += clamp((8 - f.unemploymentRate) * 4, 0, 20); reasons.push(`${f.unemploymentRate}% unemployment`) }
  const score = max > 0 ? Math.round((pts / max) * 100) : 0
  return { score, reasons }
}
