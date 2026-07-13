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
  // ── The full investor screen (all real ACS/BLS data, keyless) ──────────────
  occupancyPct:        number | null   // % of housing units occupied (100 − vacancy)
  rentalVacancyPct:    number | null   // vacant-for-rent / (renter-occupied + vacant-for-rent) — the LTR risk number
  renterSharePct:      number | null   // % of occupied homes that rent (tenant depth)
  inboundMigrationPct: number | null   // % of residents who moved IN from another state/abroad in the past year
  rent1br:             number | null   // ACS median rent by bedrooms — sizes LTR/MTR/STR units
  rent2br:             number | null
  rent3br:             number | null
  jobGrowthPct:        number | null   // BLS YoY employment growth (statewide; city-level isn't published keyless)
  jobsNote?:           string          // e.g. "TN statewide, May 2025 → May 2026"
  seasonalSharePct:    number | null   // vacation/seasonal homes as % of stock — revealed STR demand
  healthcareSharePct:  number | null   // healthcare share of employment — MTR (travel-nurse) demand
  collegeSharePct:     number | null   // college students as % of residents — MTR/LTR student demand
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
  occupancyPct: number | null; rentalVacancyPct: number | null; renterSharePct: number | null
  inboundMigrationPct: number | null; rent1br: number | null; rent2br: number | null; rent3br: number | null
  seasonalSharePct: number | null; healthcareSharePct: number | null; collegeSharePct: number | null
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
    const tables = "B01003,B19013,B17001,B23025,B25077,B25064,B25002,B25003,B25004,B25031,B07003,C24030,B14001"
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
    const vacancyRate = vac != null && totUnits ? Math.round((vac / totUnits) * 1000) / 10 : null
    // Tenure + rental-market depth.
    const occTotal = est("B25003", "B25003001"), renterOcc = est("B25003", "B25003003")
    const forRent = est("B25004", "B25004002")
    // Migration: movers from a different state + from abroad, over everyone 1yr+.
    const mobUniv = est("B07003", "B07003001")
    const fromOtherState = est("B07003", "B07003013"), fromAbroad = est("B07003", "B07003016")
    const inbound = (fromOtherState ?? 0) + (fromAbroad ?? 0)
    // Rental-demand proxies: vacation-home share (STR), healthcare employment
    // (MTR travel nurses: male C24030023 + female C24030050), college share.
    const seasonal = est("B25004", "B25004006")
    const hcM = est("C24030", "C24030023"), hcF = est("C24030", "C24030050"), workers = est("C24030", "C24030001")
    const college = est("B14001", "B14001008")
    const pop = est("B01003", "B01003001")
    return {
      population:       est("B01003", "B01003001"),
      medianIncome:     est("B19013", "B19013001"),
      povertyRate:      povPop != null && povUniv ? Math.round((povPop / povUniv) * 1000) / 10 : null,
      unemploymentRate: unemp != null && labor ? Math.round((unemp / labor) * 1000) / 10 : null,
      medianHomeValue:  est("B25077", "B25077001"),
      medianRent:       est("B25064", "B25064001"),
      vacancyRate,
      occupancyPct:     vacancyRate != null ? Math.round((100 - vacancyRate) * 10) / 10 : null,
      rentalVacancyPct: forRent != null && renterOcc ? Math.round((forRent / (renterOcc + forRent)) * 1000) / 10 : null,
      renterSharePct:   renterOcc != null && occTotal ? Math.round((renterOcc / occTotal) * 1000) / 10 : null,
      inboundMigrationPct: mobUniv && inbound ? Math.round((inbound / mobUniv) * 1000) / 10 : null,
      rent1br:          est("B25031", "B25031003"),
      rent2br:          est("B25031", "B25031004"),
      rent3br:          est("B25031", "B25031005"),
      seasonalSharePct:   seasonal != null && totUnits ? Math.round((seasonal / totUnits) * 1000) / 10 : null,
      healthcareSharePct: workers && (hcM != null || hcF != null) ? Math.round((((hcM ?? 0) + (hcF ?? 0)) / workers) * 1000) / 10 : null,
      collegeSharePct:    college != null && pop ? Math.round((college / pop) * 1000) / 10 : null,
    }
  } catch {
    return null
  }
}

// ── BLS (keyless v1): real YoY employment growth, statewide ─────────────────
// City-level employment isn't published keyless, so this is the state's pulse —
// labeled as such. Cached per state (warm instance) to respect the 25/day limit.
const STATE_FIPS: Record<string, string> = {
  AL: "01", AK: "02", AZ: "04", AR: "05", CA: "06", CO: "08", CT: "09", DE: "10", DC: "11",
  FL: "12", GA: "13", HI: "15", ID: "16", IL: "17", IN: "18", IA: "19", KS: "20", KY: "21",
  LA: "22", ME: "23", MD: "24", MA: "25", MI: "26", MN: "27", MS: "28", MO: "29", MT: "30",
  NE: "31", NV: "32", NH: "33", NJ: "34", NM: "35", NY: "36", NC: "37", ND: "38", OH: "39",
  OK: "40", OR: "41", PA: "42", RI: "44", SC: "45", SD: "46", TN: "47", TX: "48", UT: "49",
  VT: "50", VA: "51", WA: "53", WV: "54", WI: "55", WY: "56",
}

const jobsCache = new Map<string, { at: number; growth: number | null; note: string }>()
const JOBS_TTL_MS = 24 * 60 * 60 * 1000

async function fetchJobGrowth(state: string): Promise<{ growth: number | null; note: string } | null> {
  const st = (state || "").toUpperCase().trim()
  const fips = STATE_FIPS[st]
  if (!fips) return null
  const cached = jobsCache.get(st)
  if (cached && Date.now() - cached.at < JOBS_TTL_MS) return { growth: cached.growth, note: cached.note }
  try {
    const year = new Date().getFullYear()
    // LAUS statewide employment level (measure 05), seasonally adjusted —
    // e.g. LASST470000000000005 for Tennessee (verified live).
    const seriesId = `LASST${fips}0000000000005`
    const res = await fetch("https://api.bls.gov/publicAPI/v1/timeseries/data/", {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": UA },
      body: JSON.stringify({ seriesid: [seriesId], startyear: String(year - 1), endyear: String(year) }),
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) return null
    const json = (await res.json()) as { status?: string; Results?: { series?: Array<{ data?: Array<{ year: string; period: string; periodName?: string; value: string }> }> } }
    if (json.status !== "REQUEST_SUCCEEDED") return null
    const pts = json.Results?.series?.[0]?.data ?? []
    const latest = pts.find((p) => /^M\d\d$/.test(p.period))
    if (!latest) return null
    const prior = pts.find((p) => p.period === latest.period && Number(p.year) === Number(latest.year) - 1)
    if (!prior) return null
    const a = Number(latest.value), b = Number(prior.value)
    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= 0) return null
    const growth = Math.round(((a / b) - 1) * 1000) / 10
    const note = `${st} statewide, ${latest.periodName ?? latest.period} ${prior.year} → ${latest.year}`
    jobsCache.set(st, { at: Date.now(), growth, note })
    return { growth, note }
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
  const [cr, wiki, jobs] = await Promise.all([
    fetchCensusReporter(city, state).catch(() => null),
    fetchWikidataGrowth(city, state).catch(() => null),
    fetchJobGrowth(state).catch(() => null),
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
    occupancyPct:        cr?.occupancyPct ?? null,
    rentalVacancyPct:    cr?.rentalVacancyPct ?? null,
    renterSharePct:      cr?.renterSharePct ?? null,
    inboundMigrationPct: cr?.inboundMigrationPct ?? null,
    rent1br:             cr?.rent1br ?? null,
    rent2br:             cr?.rent2br ?? null,
    rent3br:             cr?.rent3br ?? null,
    jobGrowthPct:        jobs?.growth ?? null,
    jobsNote:            jobs?.note,
    seasonalSharePct:    cr?.seasonalSharePct ?? null,
    healthcareSharePct:  cr?.healthcareSharePct ?? null,
    collegeSharePct:     cr?.collegeSharePct ?? null,
    growthFrom:       wiki?.growthFrom,
    source:           [cr && "Census ACS", wiki && "Wikidata", jobs && "BLS"].filter(Boolean).join(" · ") || undefined,
  }
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

// Current market health (0-100): population growth, low unemployment, low
// poverty, healthy income, low vacancy. Only scores what we actually have.
export function fundamentalsScore(f: Fundamentals | null): { score: number; reasons: string[] } | null {
  if (!f) return null
  const reasons: string[] = []
  let pts = 0, max = 0
  if (f.popGrowth5yr != null)     { max += 25; pts += clamp((f.popGrowth5yr + 2) * 4.2, 0, 25); reasons.push(`${f.popGrowth5yr > 0 ? "+" : ""}${f.popGrowth5yr}% population${f.growthFrom ? ` (${f.growthFrom})` : ""}`) }
  if (f.jobGrowthPct != null)     { max += 20; pts += clamp((f.jobGrowthPct + 1) * 8, 0, 20); reasons.push(`${f.jobGrowthPct > 0 ? "+" : ""}${f.jobGrowthPct}% jobs YoY`) }
  if (f.unemploymentRate != null) { max += 20; pts += clamp((8 - f.unemploymentRate) * 4, 0, 20); reasons.push(`${f.unemploymentRate}% unemployment`) }
  if (f.vacancyRate != null)      { max += 12; pts += clamp((12 - f.vacancyRate) * 1.6, 0, 12); reasons.push(`${f.vacancyRate}% vacancy`) }
  if (f.povertyRate != null)      { max += 12; pts += clamp((22 - f.povertyRate) * 0.8, 0, 12); reasons.push(`${f.povertyRate}% poverty`) }
  if (f.medianIncome != null)     { max += 11; pts += clamp((f.medianIncome - 35000) / 3600, 0, 11); reasons.push(`$${Math.round(f.medianIncome / 1000)}k median income`) }
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
  if (f.popGrowth5yr != null)        { max += 25; pts += clamp((f.popGrowth5yr + 1) * 4.3, 0, 25); reasons.push(`${f.popGrowth5yr > 0 ? "+" : ""}${f.popGrowth5yr}% population growth`) }
  if (f.jobGrowthPct != null)        { max += 18; pts += clamp((f.jobGrowthPct + 1) * 7.2, 0, 18); reasons.push(`${f.jobGrowthPct > 0 ? "+" : ""}${f.jobGrowthPct}% jobs YoY${f.jobGrowthPct >= 1.5 ? " (hiring hard)" : ""}`) }
  if (f.inboundMigrationPct != null) { max += 12; pts += clamp(f.inboundMigrationPct * 3.5, 0, 12); reasons.push(`${f.inboundMigrationPct}% moved in last year${f.inboundMigrationPct >= 3 ? " (magnet city)" : ""}`) }
  if (f.priceToIncome != null)       { max += 20; const sc = f.priceToIncome <= 4 ? 20 : f.priceToIncome >= 8 ? 4 : 20 - (f.priceToIncome - 4) * 4; pts += clamp(sc, 0, 20); reasons.push(`${f.priceToIncome}× price-to-income${f.priceToIncome <= 4 ? " (room to rise)" : f.priceToIncome >= 7 ? " (stretched)" : ""}`) }
  if (f.vacancyRate != null)         { max += 13; pts += clamp((12 - f.vacancyRate) * 1.4, 0, 13); reasons.push(`${f.vacancyRate}% vacancy${f.vacancyRate <= 6 ? " (tight supply)" : ""}`) }
  if (f.unemploymentRate != null)    { max += 12; pts += clamp((8 - f.unemploymentRate) * 2.4, 0, 12); reasons.push(`${f.unemploymentRate}% unemployment`) }
  const score = max > 0 ? Math.round((pts / max) * 100) : 0
  return { score, reasons }
}

// ── Every factor, in the open — the full investor screen with a 0-100 rating
// per factor, what the number means, and which strategies it drives. This is
// what "we look at every aspect" renders as in the Markets UI.
export interface InvestorFactor {
  key: string
  label: string
  value: string          // formatted
  rating: number | null  // 0-100 (null = data unavailable for this place)
  meaning: string        // plain-English read of THIS value
  drives: string[]       // which strategies/decisions this factor feeds
}

const pct = (n: number) => `${n}%`
const usd = (n: number) => `$${Math.round(n).toLocaleString()}`

export function investorFactors(f: Fundamentals | null): InvestorFactor[] {
  if (!f) return []
  const F = (key: string, label: string, raw: number | null, fmt: (n: number) => string, rating: (n: number) => number, meaning: (n: number) => string, drives: string[]): InvestorFactor => ({
    key, label,
    value: raw != null ? fmt(raw) : "—",
    rating: raw != null ? clamp(rating(raw), 0, 100) : null,
    meaning: raw != null ? meaning(raw) : "Not published for this place",
    drives,
  })
  return [
    F("jobs", "Job growth (YoY)", f.jobGrowthPct, pct, (n) => (n + 1) * 40,
      (n) => n >= 1.5 ? "Employers hiring hard — demand for housing follows jobs" : n > 0 ? "Steady hiring" : "Shedding jobs — rent demand at risk",
      ["LTR", "MTR", "Appreciation"]),
    F("migration", "People moving in (past yr)", f.inboundMigrationPct, pct, (n) => n * 25,
      (n) => n >= 3 ? "Magnet city — strong inbound migration" : n >= 1.5 ? "Healthy inflow of new residents" : "Low inflow — growth depends on locals",
      ["LTR", "STR", "Appreciation"]),
    F("popGrowth", `Population growth${f.growthFrom ? ` (${f.growthFrom})` : ""}`, f.popGrowth5yr, pct, (n) => (n + 2) * 14,
      (n) => n >= 4 ? "Fast-growing — more renters and buyers every year" : n >= 0 ? "Stable population" : "Shrinking — buy only deep discounts",
      ["All strategies"]),
    F("rentalVacancy", "Rental vacancy", f.rentalVacancyPct, pct, (n) => (14 - n) * 8,
      (n) => n <= 5 ? "Tight rental market — units fill fast, rents push up" : n <= 9 ? "Balanced rental market" : "Soft — expect longer vacancy between tenants",
      ["LTR", "MTR"]),
    F("occupancy", "Housing occupancy", f.occupancyPct, pct, (n) => (n - 75) * 5,
      (n) => n >= 92 ? "Nearly every unit occupied — real housing demand" : n >= 85 ? "Healthy occupancy" : "Lots of empty housing — verify the block, not just the city",
      ["LTR", "Flip resale"]),
    F("rent", "Average rent (median)", f.medianRent, usd, () => 50,
      (n) => `Typical tenant pays ${usd(n)}/mo${f.rent2br ? ` · 2-bed ${usd(f.rent2br)}` : ""}${f.rent3br ? ` · 3-bed ${usd(f.rent3br)}` : ""}`,
      ["LTR", "MTR", "STR sizing"]),
    F("yield", "Gross rent yield", f.grossYield, pct, (n) => n * 9,
      (n) => n >= 8 ? "Strong cash-flow math — rents are high relative to prices" : n >= 5.5 ? "Balanced cash flow" : "Thin yield — this is an appreciation market",
      ["LTR", "MTR"]),
    F("priceToIncome", "Affordability (price ÷ income)", f.priceToIncome, (n) => `${n}×`, (n) => n <= 4 ? 90 : n >= 8 ? 15 : 90 - (n - 4) * 19,
      (n) => n <= 4 ? "Locals can afford to buy — room for prices to rise" : n <= 6 ? "Fairly priced" : "Stretched — appreciation likely capped",
      ["Appreciation", "Flip resale"]),
    F("unemployment", "Unemployment", f.unemploymentRate, pct, (n) => (9 - n) * 14,
      (n) => n <= 4 ? "Strong job base — tenants can pay" : n <= 6.5 ? "Average" : "Weak employment — screen tenants hard, expect turnover",
      ["LTR", "Tenant quality"]),
    F("poverty", "Poverty rate", f.povertyRate, pct, (n) => (28 - n) * 4.5,
      (n) => n <= 12 ? "Economically healthy" : n <= 20 ? "Mixed — go block-by-block" : "High poverty — C/D-class economics, price for it",
      ["Neighborhood class", "Tenant quality"]),
    F("renterShare", "Renter share of homes", f.renterSharePct, pct, (n) => n >= 35 && n <= 65 ? 80 : n > 65 ? 60 : 40,
      (n) => n >= 50 ? "Renter-majority city — deep tenant pool" : n >= 35 ? "Good tenant depth" : "Owner-dominated — smaller rental pool, better flip exits",
      ["LTR depth", "Flip exits"]),
    F("income", "Median household income", f.medianIncome, usd, (n) => (n - 30000) / 700,
      (n) => n >= 70000 ? "Strong incomes support rent growth" : n >= 45000 ? "Middle-income base" : "Low incomes — keep rents realistic",
      ["Rent ceiling", "Tenant quality"]),
    F("homeValue", "Median home value", f.medianHomeValue, usd, () => 50,
      (n) => n <= 250000 ? "Low entry price — cash-flow friendly" : n <= 500000 ? "Mid-priced market" : "Expensive — appreciation play, big checks",
      ["Entry price", "Strategy choice"]),
  ]
}
