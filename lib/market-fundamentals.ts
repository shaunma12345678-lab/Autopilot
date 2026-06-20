// Real market fundamentals from the US Census ACS 5-year API (free, no key,
// works from datacenter). Gives the hard numbers an investor actually screens
// on — population + growth, median household income, poverty rate, and
// unemployment — so the market analysis scores on REAL data, not estimates off
// a distressed sample. Best-effort: any failure returns null and the analysis
// falls back to what it can measure.

export interface Fundamentals {
  population:       number | null
  popGrowth5yr:    number | null   // % change vs 5 years ago
  medianIncome:    number | null
  povertyRate:     number | null   // %
  unemploymentRate: number | null  // %
}

const STATE_FIPS: Record<string, string> = {
  AL: "01", AK: "02", AZ: "04", AR: "05", CA: "06", CO: "08", CT: "09", DE: "10", DC: "11",
  FL: "12", GA: "13", HI: "15", ID: "16", IL: "17", IN: "18", IA: "19", KS: "20", KY: "21",
  LA: "22", ME: "23", MD: "24", MA: "25", MI: "26", MN: "27", MS: "28", MO: "29", MT: "30",
  NE: "31", NV: "32", NH: "33", NJ: "34", NM: "35", NY: "36", NC: "37", ND: "38", OH: "39",
  OK: "40", OR: "41", PA: "42", RI: "44", SC: "45", SD: "46", TN: "47", TX: "48", UT: "49",
  VT: "50", VA: "51", WA: "53", WV: "54", WI: "55", WY: "56",
}

// Census's data API requires a free key (census.gov/data/key_signup.html). With
// no key the fundamentals stay null and the analysis falls back to deal metrics.
const CENSUS_KEY = process.env.CENSUS_API_KEY ?? ""
export const isFundamentalsConfigured = () => Boolean(CENSUS_KEY)

const num = (v: unknown): number | null => { const n = Number(v); return Number.isFinite(n) && n > -100000 ? n : null }
const normPlace = (s: string) => s.toLowerCase().replace(/\b(city|town|cdp|village|borough|municipality)\b/g, "").replace(/,.*$/, "").trim()

// Pull a year's ACS5 place rows for a state and find the matching city.
async function fetchYear(year: number, fips: string, city: string): Promise<string[] | null> {
  try {
    const vars = "NAME,B01003_001E,B19013_001E,B17001_002E,B17001_001E,B23025_003E,B23025_005E"
    const url = `https://api.census.gov/data/${year}/acs/acs5?get=${vars}&for=place:*&in=state:${fips}&key=${CENSUS_KEY}`
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(9000) })
    if (!res.ok) return null
    const data = (await res.json()) as string[][]
    const rows = data.slice(1)
    const target = city.toLowerCase().trim()
    // Prefer an exact place-name match, else the largest place that contains it.
    let best: string[] | null = null
    let bestPop = -1
    for (const r of rows) {
      const name = normPlace(r[0])
      if (name === target) return r
      if (name.startsWith(target) || target.startsWith(name)) {
        const pop = num(r[1]) ?? 0
        if (pop > bestPop) { bestPop = pop; best = r }
      }
    }
    return best
  } catch {
    return null
  }
}

export async function fetchFundamentals(city: string, state: string): Promise<Fundamentals | null> {
  const fips = STATE_FIPS[(state || "").toUpperCase()]
  if (!fips || !city.trim() || !CENSUS_KEY) return null
  try {
    const [cur, old] = await Promise.all([fetchYear(2022, fips, city), fetchYear(2017, fips, city)])
    if (!cur) return null
    const pop = num(cur[1]), income = num(cur[2]), povPop = num(cur[3]), povUniv = num(cur[4]), labor = num(cur[5]), unemp = num(cur[6])
    const oldPop = old ? num(old[1]) : null
    return {
      population:       pop,
      popGrowth5yr:     pop && oldPop && oldPop > 0 ? Math.round((pop - oldPop) / oldPop * 1000) / 10 : null,
      medianIncome:     income,
      povertyRate:      povPop != null && povUniv ? Math.round((povPop / povUniv) * 1000) / 10 : null,
      unemploymentRate: unemp != null && labor ? Math.round((unemp / labor) * 1000) / 10 : null,
    }
  } catch {
    return null
  }
}

// Score a market against an investor's fundamentals criteria (0-100) with the
// reasons. Higher = better screen: population/job growth, low unemployment, low
// poverty, healthy income. Only scores the metrics we actually have.
export function fundamentalsScore(f: Fundamentals | null): { score: number; reasons: string[] } | null {
  if (!f) return null
  const reasons: string[] = []
  let pts = 0, max = 0
  if (f.popGrowth5yr != null)     { max += 30; const p = Math.max(0, Math.min(30, (f.popGrowth5yr + 2) * 5)); pts += p; reasons.push(`${f.popGrowth5yr > 0 ? "+" : ""}${f.popGrowth5yr}% population (5yr)`) }
  if (f.unemploymentRate != null) { max += 25; pts += Math.max(0, Math.min(25, (8 - f.unemploymentRate) * 5)); reasons.push(`${f.unemploymentRate}% unemployment`) }
  if (f.povertyRate != null)      { max += 20; pts += Math.max(0, Math.min(20, (22 - f.povertyRate))); reasons.push(`${f.povertyRate}% poverty`) }
  if (f.medianIncome != null)     { max += 25; pts += Math.max(0, Math.min(25, (f.medianIncome - 35000) / 1600)); reasons.push(`$${Math.round(f.medianIncome / 1000)}k median income`) }
  const score = max > 0 ? Math.round((pts / max) * 100) : 0
  return { score, reasons }
}
