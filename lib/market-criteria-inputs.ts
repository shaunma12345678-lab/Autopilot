// Turning free, keyless data into the rubric's inputs.
//
// Everything here comes from sources that need no API key: Census Reporter for
// the ACS screen (population, rents, values, vacancy, poverty, unemployment) and
// BLS for employment growth. Two criteria come from curated tables because the
// spec says they should — landlord law and effective property tax change once a
// year by legislation, not by the day, and scraping them daily would be less
// reliable than maintaining them deliberately.
//
// Three-year appreciation now comes from our own FHFA index service
// (lib/hpi-service.ts) — keyless, 410 metros, self-checking. That was 8 of the
// 100 points and it was the reason no market could climb past the high forties.
//
// WHAT IS STILL DELIBERATELY LEFT NULL. Days on market, worth 2 points. The
// public Redfin extract carries it but the file is 194MB, which is a scheduled
// job rather than something to fetch while scoring. Left null rather than
// estimated: inventing it would put a number in the score that nothing measured.

import { fetchFundamentals, type Fundamentals } from "@/lib/market-fundamentals"
import { appreciationFor } from "@/lib/hpi-service"
import type { MarketInputs } from "@/lib/market-criteria"

// National reference points for the two "vs national" criteria. Stated here as
// constants with a date rather than hidden in the scorer, so it is obvious when
// they need refreshing.
export const NATIONAL_REFERENCE = {
  medianHomePrice: 416_900,   // Census/NAR national median, 2026 Q2
  medianRent: 1_900,          // ACS national median gross rent
  asOf: "2026-Q2",
} as const

// Census place identifiers for the watchlist, taken from the official 2024
// Census Gazetteer (2024_Gaz_place_national) rather than looked up at runtime.
//
// WHY THIS IS A TABLE. Census Reporter's geo/search endpoint answers
// {"error":"block"} to every user agent tried, which is why every ACS figure in
// this module was arriving null — median value, median rent, vacancy,
// unemployment and poverty, five of the ten criteria, silently absent. Its DATA
// endpoint works perfectly once you already know the identifier, so the
// identifiers are resolved once, from the authoritative federal file, and shipped.
//
// Verified: all 35 watchlist markets resolved, Columbus OH = 16000US3918000.
export const PLACE_GEOIDS: Record<string, string> = {
  "Buffalo|NY": "16000US3611000",
  "Chicago|IL": "16000US1714000",
  "Cincinnati|OH": "16000US3915000",
  "Colorado Springs|CO": "16000US0816000",
  "Columbia|SC": "16000US4516000",
  "Columbus|OH": "16000US3918000",
  "Des Moines|IA": "16000US1921000",
  "Durham|NC": "16000US3719000",
  "Fort Wayne|IN": "16000US1825000",
  "Fort Worth|TX": "16000US4827000",
  "Greensboro|NC": "16000US3728000",
  "Greenville|SC": "16000US4530850",
  "Hartford|CT": "16000US0937000",
  "Hattiesburg|MS": "16000US2831020",
  "Huntsville|AL": "16000US0137000",
  "Indianapolis|IN": "16000US1836003",
  "Kansas City|MO": "16000US2938000",
  "Knoxville|TN": "16000US4740000",
  "Louisville|KY": "16000US2148000",
  "McKinney|TX": "16000US4845744",
  "Minneapolis|MN": "16000US2743000",
  "Montgomery|AL": "16000US0151000",
  "Morgantown|WV": "16000US5455756",
  "Ocala|FL": "16000US1250750",
  "Oklahoma City|OK": "16000US4055000",
  "Peoria|IL": "16000US1759000",
  "Philadelphia|PA": "16000US4260000",
  "Rochester|NY": "16000US3663000",
  "Rockford|IL": "16000US1765000",
  "San Antonio|TX": "16000US4865000",
  "Sherman|TX": "16000US4867496",
  "Sioux City|IA": "16000US1973335",
  "Tuscaloosa|AL": "16000US0177256",
  "Twin Falls|ID": "16000US1682810",
  "Winston-Salem|NC": "16000US3775000",
}

/** The census identifier for a city, or null when it is not in the table. */
export function placeGeoid(city: string, state: string): string | null {
  return PLACE_GEOIDS[`${city}|${state.toUpperCase()}`] ?? null
}

// §2.2 criterion 9 — landlord-friendly rating, and §2.3's LTR disqualifier.
//
// Curated from the sources the spec names (Nolo, Avail.co, ALEC). Only the
// states the watchlist actually touches are listed; anything absent scores as
// unmeasured rather than being guessed at, which is why the default is null.
const LANDLORD_LAW: Record<string, { friendly: boolean; evictionMonths: number; rentControl: boolean }> = {
  AL: { friendly: true,  evictionMonths: 1.5, rentControl: false },
  TN: { friendly: true,  evictionMonths: 1.5, rentControl: false },
  TX: { friendly: true,  evictionMonths: 1,   rentControl: false },
  IN: { friendly: true,  evictionMonths: 1.5, rentControl: false },
  OK: { friendly: true,  evictionMonths: 1.5, rentControl: false },
  SC: { friendly: true,  evictionMonths: 2,   rentControl: false },
  NC: { friendly: true,  evictionMonths: 1.5, rentControl: false },
  KY: { friendly: true,  evictionMonths: 2,   rentControl: false },
  MO: { friendly: true,  evictionMonths: 2,   rentControl: false },
  IA: { friendly: true,  evictionMonths: 1.5, rentControl: false },
  WV: { friendly: true,  evictionMonths: 2,   rentControl: false },
  MS: { friendly: true,  evictionMonths: 1.5, rentControl: false },
  FL: { friendly: true,  evictionMonths: 1,   rentControl: false },
  OH: { friendly: true,  evictionMonths: 2,   rentControl: false },
  ID: { friendly: true,  evictionMonths: 1,   rentControl: false },
  CO: { friendly: true,  evictionMonths: 2,   rentControl: false },
  AZ: { friendly: true,  evictionMonths: 1,   rentControl: false },
  IL: { friendly: false, evictionMonths: 5,   rentControl: false },
  NY: { friendly: false, evictionMonths: 8,   rentControl: true  },
  MN: { friendly: false, evictionMonths: 4,   rentControl: false },
  CT: { friendly: false, evictionMonths: 5,   rentControl: false },
  PA: { friendly: true,  evictionMonths: 2.5, rentControl: false },
  CA: { friendly: false, evictionMonths: 6,   rentControl: true  },
  NJ: { friendly: false, evictionMonths: 7,   rentControl: true  },
}

// §7.5 — EFFECTIVE rate (taxes actually paid / value), not the advertised one.
// Figures from the spec plus state averages; a county can differ, so this is a
// screen rather than an underwriting input.
const EFFECTIVE_PROPERTY_TAX: Record<string, number> = {
  AL: 0.37, TN: 0.46, SC: 0.55, WV: 0.57, CO: 0.48, ID: 0.63, AZ: 0.60,
  KY: 0.83, IN: 0.84, NC: 0.78, MS: 0.79, OK: 0.90, MO: 0.98, FL: 0.86,
  CA: 0.71, MN: 1.05, PA: 1.49, OH: 1.53, IA: 1.52, TX: 1.68,
  NY: 1.73, CT: 2.15, IL: 2.23, NJ: 2.33,
}

// No city gains or loses this much of its population in a single year. A series
// implying it is describing two different places, not one place changing.
const MAX_CREDIBLE_ANNUAL_POP_CHANGE_PCT = 8

/**
 * Population growth per year, and null when the series cannot be trusted.
 *
 * THE FALSE DISQUALIFICATION THIS PREVENTS. Wikidata returned Louisville as
 * 597,337 in 2010, 760,026 in 2014 and 246,161 in 2020 — three different
 * geographies filed under one name (city proper, consolidated metro, and
 * something smaller again). Divided out, that is -60.9% over five years, which
 * tripped the "population is declining" hard disqualifier and removed a market
 * the spec flags as a priority from consideration entirely, with a confident
 * explanation attached.
 *
 * Population is the one criterion that can BOTH score and disqualify, so a bad
 * figure here is more damaging than anywhere else in the rubric. Where the
 * series moves faster than any real city can, it is refused: the market loses
 * the 14 points and is NOT failed, because "we cannot measure this" and "this
 * place is dying" are different statements.
 */
function annualisePopGrowth(f: Fundamentals): number | null {
  const series = f.popSeries
  if (series && series.length >= 2) {
    const sorted = [...series].sort((a, b) => a.year - b.year)

    // Checked across consecutive points, not just the endpoints: a series that
    // jumps and comes back would otherwise look calm end to end.
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1], curr = sorted[i]
      const years = curr.year - prev.year
      if (years <= 0 || prev.pop <= 0 || curr.pop <= 0) return null
      const annual = (Math.pow(curr.pop / prev.pop, 1 / years) - 1) * 100
      if (Math.abs(annual) > MAX_CREDIBLE_ANNUAL_POP_CHANGE_PCT) return null
    }

    const first = sorted[0], last = sorted[sorted.length - 1]
    const years = last.year - first.year
    if (years > 0) return (Math.pow(last.pop / first.pop, 1 / years) - 1) * 100
  }

  if (f.popGrowth5yr === null) return null
  // Compound rather than divide: 10% over five years is 1.92%/yr, not 2%.
  const annual = (Math.pow(1 + f.popGrowth5yr / 100, 1 / 5) - 1) * 100
  return Math.abs(annual) > MAX_CREDIBLE_ANNUAL_POP_CHANGE_PCT ? null : annual
}

/** Exported for testing — the guard matters more than the arithmetic. */
export const __popGrowthForTest = annualisePopGrowth

export interface MarketRequest {
  city: string
  state: string
  metro?: string
  greenFlags?: string[]
  /** Whether a long-term rental hold is intended, which gates §2.3. */
  targetHoldIsLtr?: boolean
  /** Supplied when known from elsewhere; left null rather than estimated. */
  appreciation3yrCagr?: number | null
  daysOnMarket?: number | null
  majorEmployerPresent?: boolean | null
}

export async function buildMarketInputs(req: MarketRequest): Promise<MarketInputs | null> {
  // Both sources in parallel; the index is cached after the first market, so a
  // whole watchlist run pays for one 4MB download.
  const [f, appreciation] = await Promise.all([
    fetchFundamentals(req.city, req.state).catch(() => null),
    appreciationFor(req.city, req.state).catch(() => null),
  ])
  if (!f) return null

  const state = req.state.toUpperCase()
  const law = LANDLORD_LAW[state]
  const tax = EFFECTIVE_PROPERTY_TAX[state] ?? null

  // Price-to-rent, measured on COMPARABLE housing.
  //
  // The first version divided median owner-occupied value by median gross rent,
  // and those describe different homes: the rent figure covers all rental stock
  // — studios and one-beds included, utilities bundled — while the value figure
  // is owner-occupied housing, which skews to family houses. Dividing one by
  // the other overstated the ratio by two to four points across the watchlist
  // (Sioux City 14.8 against 12.6, Oklahoma City 18.3 against 14.6), which is
  // the difference between failing criterion 1 and scoring most of it.
  //
  // A single-family investor rents out a three-bedroom house, so a
  // three-bedroom rent is the like-for-like denominator. Fixing the measurement
  // is the right move here rather than loosening the threshold: the spec's
  // PTR < 15 is a sound bar, it was simply being tested against the wrong rent.
  const comparableRent = f.rent3br ?? f.rent2br ?? f.medianRent
  const rentBasis = f.rent3br ? "3-bedroom" : f.rent2br ? "2-bedroom" : "median gross"

  const priceToRent = f.medianHomeValue !== null && comparableRent !== null && comparableRent > 0
    ? f.medianHomeValue / (comparableRent * 12)
    : null

  return {
    market: `${req.city}, ${state}`,
    metro: req.metro,
    priceToRent,
    popGrowthYoY: annualisePopGrowth(f),
    medianHomePrice: f.medianHomeValue,
    medianRent: f.medianRent,
    jobGrowthPct: f.jobGrowthPct,
    vacancyRate: f.vacancyRate,
    // The FHFA metropolitan index, keyless and quarterly. An explicit override
    // wins; otherwise the measured figure, and null when no metro covers the city.
    appreciation3yrCagr: req.appreciation3yrCagr ?? appreciation?.cagr3yr ?? null,
    unemploymentRate: f.unemploymentRate,
    landlordFriendly: law ? law.friendly : null,
    daysOnMarket: req.daysOnMarket ?? null,
    povertyRate: f.povertyRate,
    propertyTaxRateEffective: tax,
    majorEmployerPresent: req.majorEmployerPresent ?? null,
    rentControlActive: law ? law.rentControl : null,
    evictionTimelineMonths: law ? law.evictionMonths : null,
    nationalMedianHomePrice: NATIONAL_REFERENCE.medianHomePrice,
    nationalMedianRent: NATIONAL_REFERENCE.medianRent,
    targetHoldIsLtr: req.targetHoldIsLtr,
    greenFlags: req.greenFlags,
    // Only flagged as conservative when the fallback had to be used; a
    // three-bedroom rent is a fair comparison and needs no caveat.
    acsDerivedPriceToRent: priceToRent !== null && rentBasis === "median gross",
    priceToRentBasis: priceToRent !== null ? `${rentBasis} rent` : null,
  }
}

// §6.1 — the watchlist, with the qualitative notes from §6.2 carried as green
// flags. These are leads to be scored, never recommendations: a market only
// earns its tier from the rubric.
export const WATCHLIST: MarketRequest[] = [
  { city: "Columbus", state: "OH", greenFlags: ["Intel mega-site $20B", "Ohio State University anchor"] },
  { city: "Knoxville", state: "TN", greenFlags: ["University of Tennessee anchor", "No state income tax"] },
  { city: "Huntsville", state: "AL", greenFlags: ["NASA/DoD anchor", "Aerospace employment base"] },
  { city: "Indianapolis", state: "IN", greenFlags: ["Very landlord-friendly"] },
  { city: "Greenville", state: "SC", greenFlags: ["BMW plant nearby"] },
  { city: "Columbia", state: "SC", greenFlags: ["University of South Carolina anchor"] },
  { city: "Fort Wayne", state: "IN", greenFlags: ["Growing manufacturing base"] },
  { city: "Oklahoma City", state: "OK", greenFlags: ["Landlord-friendly", "Low cost of living"] },
  { city: "Des Moines", state: "IA", greenFlags: ["Insurance and finance hub"] },
  { city: "Louisville", state: "KY", greenFlags: ["Healthcare hub"] },
  { city: "Greensboro", state: "NC", greenFlags: ["Airport expansion"] },
  { city: "Winston-Salem", state: "NC", greenFlags: ["Wake Forest anchor"] },
  { city: "Montgomery", state: "AL", greenFlags: ["Maxwell AFB anchor"] },
  { city: "San Antonio", state: "TX", greenFlags: ["Multiple military bases", "No state income tax"] },
  { city: "Fort Worth", state: "TX", greenFlags: ["Strong job growth", "No state income tax"] },
  { city: "McKinney", state: "TX", greenFlags: ["Dallas suburb", "No state income tax"] },
  { city: "Kansas City", state: "MO", greenFlags: ["Bioscience push"] },
  { city: "Colorado Springs", state: "CO", greenFlags: ["Fort Carson and NORAD anchors"] },
  { city: "Cincinnati", state: "OH", greenFlags: ["P&G anchor"] },
  { city: "Durham", state: "NC", greenFlags: ["Research Triangle", "Biotech employment"] },
  { city: "Rochester", state: "NY", greenFlags: ["U of R and RIT anchors", "Medical anchor"] },
  { city: "Buffalo", state: "NY", greenFlags: ["Strong rent demand"] },
  { city: "Philadelphia", state: "PA", greenFlags: ["Large distressed row-home inventory"] },
  { city: "Minneapolis", state: "MN", greenFlags: ["Score the numbers, but tenant-favourable law"] },
  { city: "Chicago", state: "IL", greenFlags: ["Strong rental demand"] },
  { city: "Peoria", state: "IL", greenFlags: ["Very affordable"] },
  { city: "Rockford", state: "IL", greenFlags: ["Deep affordability — watch vacancy"] },
  { city: "Hartford", state: "CT", greenFlags: ["Insurance hub", "Distressed inventory"] },
  { city: "Tuscaloosa", state: "AL", greenFlags: ["University of Alabama — game-day STR demand"] },
  { city: "Morgantown", state: "WV", greenFlags: ["WVU anchor", "Captive tenant base"] },
  { city: "Ocala", state: "FL", greenFlags: ["Landlord-friendly", "STR-eligible"] },
  { city: "Twin Falls", state: "ID", greenFlags: ["Inbound migration from CA/OR"] },
  { city: "Sioux City", state: "IA", greenFlags: ["Very affordable, low competition"] },
  { city: "Hattiesburg", state: "MS", greenFlags: ["Southern Miss anchor"] },
  { city: "Sherman", state: "TX", greenFlags: ["Texas Instruments $30B plant nearby", "No state income tax"] },
]
