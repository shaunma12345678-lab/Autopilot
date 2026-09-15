// What is it worth? Answered from county assessor records rather than a portal.
//
// WHY NOT ZILLOW. It answers HTTP 403 to datacenter IPs, so the scraper that
// depended on it was never going to work from a server. But the deeper problem
// is that a single portal estimate is one opinion with no provenance — you
// cannot see what it was built from, and you cannot tell a confident number
// from a guess.
//
// WHAT THIS USES INSTEAD. Every county publishes its assessor roll as a map
// layer: one record per parcel, carrying assessed value, land value, improvement
// value and often the last sale price. It is authoritative, it is free, it needs
// no key, and it covers the whole country. Discovery goes through the same
// ArcGIS Hub mechanism the lead sourcing already uses.
//
// THE MISTAKE THIS AVOIDS. Assessed value is NOT market value. Counties assess
// at a ratio — Ohio is nominally 35% — and ratios drift between reassessments,
// so an assumed multiplier is a guess dressed as arithmetic. Where a layer
// carries both an assessed value and a recent sale price, the ratio is MEASURED
// from those pairs instead. Where it does not, the assessed value is reported as
// an assessed value and never silently promoted to market.
//
// Nothing here invents a number. Every figure carries where it came from, and a
// blended estimate is only produced when there is something to blend.

import type { GeoBox } from "@/lib/geocoding"

export type ValueKind =
  /** The county's assessed value, at whatever ratio it assesses. */
  | "assessed"
  /** The county's own market/appraised value, already at full value. */
  | "market"
  /** A recorded sale price — the strongest evidence there is. */
  | "sale"
  /** Assessed value converted using a ratio measured from local sales. */
  | "assessed-adjusted"

export interface ValueObservation {
  kind: ValueKind
  value: number
  /** The layer it came from, so a figure can always be traced. */
  source: string
  field: string
}

export interface ValuationRead {
  observations: ValueObservation[]
  /** Best single number, or null when there is nothing to base one on. */
  estimate: number | null
  /** Median assessed-to-sale ratio measured locally, not assumed. */
  assessmentRatio: number | null
  ratioSampleSize: number
  confidence: "high" | "medium" | "low" | "none"
  /** Plain-language account of how the estimate was reached. */
  basis: string
  /** Median price per square foot across the sampled parcels, when available. */
  areaPricePerSqft: number | null
  parcelsSampled: number
  /** Parcels confirmed residential by their own use code. */
  residentialParcels: number
  /** Parcels with no use code — possibly commercial, counted separately. */
  unknownUseParcels: number
}

// Field names are MATCHED, not listed.
//
// The first version of this carried a list of exact names and found nothing,
// because assessor layers do not agree on spelling: Harris County publishes
// tot_mkt_val on one layer and total_market_val on another, next to assessed_val
// and total_appraised_val. Across three thousand counties an exact list cannot
// win. Patterns can.
//
// The grouping matters more than the matching. An assessed value and a market
// value are different quantities, and land_value is neither — it is the dirt
// without the house. Averaging them produces a number that is wrong in a
// direction nobody can see, so each is recognised separately and LAND-only and
// IMPROVEMENT-only fields are deliberately excluded from both.
const LAND_OR_IMPROVEMENT = /\b(land|lot|impr|improvement|bld|bldg|building|ag|productivity)\b/i

const VALUE_PATTERNS = {
  market: /(?:tot|total|full)?_?(?:mkt|market|appr|apprais\w*)_?val|market_?value|appraised_?value|full_?value|total_?value/i,
  assessed: /assess\w*_?val|^assessment\w*$|^assessed$|av_?total|tax_?value/i,
  sale: /sale\w*_?(?:price|amt|amount)|last_?sale|^saleprice$|consideration/i,
  sqft: /sq_?ft|living_?area|finished_?area|bldg_?sq|heated_?area|gross_?area|total_?area/i,
} as const

// Which parcels are houses.
//
// THE ERROR THIS PREVENTS. Valuing a downtown box without this gave a median of
// $9,468,388 off a $424,967,080 parcel — correct arithmetic over office towers.
// Fed into an offer for a house, that number is not slightly wrong, it is
// catastrophic. Assessor layers almost always carry a use or class code, so the
// filter is available; where it is not, the estimate says so rather than
// pretending.
const USE_FIELD = /class|land_?use|use_?code|prop\w*_?type|prop_?use|assess\w*_?abbrev|dor_?uc|occupancy/i
// Single-family and small residential only. "Apartment" is deliberately absent:
// a downtown high-rise is residential by use code and a $45,000,000 asset, and
// including it moved a Houston estimate from $9.4M to $49M. An after-repair
// value applies to a house, so the filter has to mean a house.
const RESIDENTIAL_TEXT = /single.?fam|duplex|triplex|fourplex|townhouse|town.?home|condo|^sfr$|residential\s*(?:1|single)?$|dwelling/i
const LARGE_RESIDENTIAL = /apartment|high.?rise|multi.?fam|mfr|complex|\b\d{2,}\s*unit/i
// Texas state classes: A is single-family, B multi-family. Florida DOR 001-009
// are residential. A bare number is inconclusive rather than disqualifying.
const RESIDENTIAL_CODE = /^(a\d?|b\d?|r\d?|00[1-9])$/i

// A single-family house is not worth this much, anywhere in the country.
//
// THE LESSON BEHIND THIS CONSTANT. A hand-verified Harris County layer was
// pinned after reading one record and confirming it carried tot_mkt_val and
// assessed_val. The field names were right and the meaning was not: the values
// on that layer run to $45,000,000 on parcels coded residential, so it is
// evidently aggregated by account or district rather than by house. Verifying
// the SHAPE of data is not verifying the DATA.
//
// So magnitude is checked as well as provenance. A figure outside this band is
// refused rather than returned, because a wrong after-repair value does not
// produce a slightly wrong offer — it produces a confident, catastrophic one.
export const PLAUSIBLE_HOME_MIN = 5_000
export const PLAUSIBLE_HOME_MAX = 20_000_000

export function isPlausibleHomeValue(value: number): boolean {
  return Number.isFinite(value) && value >= PLAUSIBLE_HOME_MIN && value <= PLAUSIBLE_HOME_MAX
}

export type UseVerdict = "residential" | "not-residential" | "unknown"

export function classifyUse(attrs: Record<string, unknown>): UseVerdict {
  let sawUseField = false
  for (const [key, raw] of Object.entries(attrs)) {
    if (!USE_FIELD.test(key) || raw == null) continue
    const text = String(raw).trim()
    if (!text) continue
    sawUseField = true
    if (LARGE_RESIDENTIAL.test(text)) return "not-residential"
    if (RESIDENTIAL_TEXT.test(text) || RESIDENTIAL_CODE.test(text)) return "residential"
  }
  return sawUseField ? "not-residential" : "unknown"
}

/**
 * The first numeric attribute whose NAME matches, skipping land- and
 * improvement-only fields for the value kinds where they would mislead.
 */
export function matchField(
  attrs: Record<string, unknown>,
  pattern: RegExp,
  { allowLandOrImprovement = false } = {},
): { value: number; field: string } | null {
  for (const [key, raw] of Object.entries(attrs)) {
    if (!pattern.test(key)) continue
    if (!allowLandOrImprovement && LAND_OR_IMPROVEMENT.test(key)) continue
    if (raw == null) continue
    const n = typeof raw === "number" ? raw : Number(String(raw).replace(/[$,\s]/g, ""))
    if (Number.isFinite(n) && n > 0) return { value: n, field: key }
  }
  return null
}

// Below this, a "sale price" is a transfer between relatives, a quitclaim, or a
// clerical placeholder — not evidence of market value.
export const MIN_CREDIBLE_SALE = 10_000
// A ratio outside this range means the two fields are not what their names say.
const RATIO_FLOOR = 0.05
const RATIO_CEILING = 2.5
// Fewer pairs than this and the median is noise rather than a measurement.
export const MIN_RATIO_SAMPLE = 8

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * Median of the middle 80%, so a handful of records from a different asset
 * class cannot set the number.
 *
 * A use code is not a complete defence — mislabelled parcels, land assembled
 * under one account, and apartment blocks coded "residential" all survive it.
 * Trimming is the second line: it needs no field to exist and no code to be
 * correct. Below ten values there is nothing to trim, so the plain median
 * stands rather than discarding most of a small sample.
 */
export function trimmedMedian(values: number[]): number | null {
  if (values.length < 10) return median(values)
  const sorted = [...values].sort((a, b) => a - b)
  const cut = Math.floor(sorted.length * 0.1)
  return median(sorted.slice(cut, sorted.length - cut))
}

/**
 * The local assessed-to-market ratio, measured from parcels that carry both.
 *
 * Pure, so the thing the whole valuation hangs on can be tested directly.
 * Returns null rather than a default when the evidence is too thin — an
 * invented ratio is worse than no ratio, because everything downstream would
 * inherit it without knowing.
 */
export function deriveAssessmentRatio(
  pairs: Array<{ assessed: number; sale: number }>,
): { ratio: number | null; sampleSize: number } {
  const usable = pairs
    .filter(p => p.assessed > 0 && p.sale >= MIN_CREDIBLE_SALE)
    .map(p => p.assessed / p.sale)
    .filter(r => r >= RATIO_FLOOR && r <= RATIO_CEILING)

  if (usable.length < MIN_RATIO_SAMPLE) return { ratio: null, sampleSize: usable.length }
  return { ratio: median(usable), sampleSize: usable.length }
}

/**
 * One number from several observations, preferring the strongest evidence.
 *
 * A recorded sale outranks a county market value, which outranks an assessed
 * value converted by a measured ratio, which outranks a bare assessed value.
 * Averaging across those kinds would blur a fact into an estimate, so the
 * ranking picks rather than mixes.
 */
export function blendValuations(observations: ValueObservation[]): {
  estimate: number | null
  confidence: ValuationRead["confidence"]
  basis: string
} {
  // Implausible figures are dropped before anything is computed from them.
  const of = (kind: ValueKind) =>
    observations.filter(o => o.kind === kind && isPlausibleHomeValue(o.value)).map(o => o.value)

  const rejected = observations.filter(o => !isPlausibleHomeValue(o.value)).length

  const sales = of("sale")
  if (sales.length) {
    return {
      estimate: Math.round(trimmedMedian(sales)!),
      confidence: sales.length >= 3 ? "high" : "medium",
      basis: `Median of ${sales.length} recorded sale price(s) on comparable parcels — the strongest evidence available.`,
    }
  }

  const market = of("market")
  if (market.length) {
    return {
      estimate: Math.round(trimmedMedian(market)!),
      confidence: market.length >= 3 ? "high" : "medium",
      basis: `Median of ${market.length} county market/appraised value(s), which are already stated at full value.`,
    }
  }

  const adjusted = of("assessed-adjusted")
  if (adjusted.length) {
    return {
      estimate: Math.round(trimmedMedian(adjusted)!),
      confidence: "medium",
      basis: `Median of ${adjusted.length} assessed value(s), converted using an assessed-to-sale ratio measured from local sales rather than assumed.`,
    }
  }

  const assessed = of("assessed")
  if (assessed.length) {
    return {
      estimate: Math.round(trimmedMedian(assessed)!),
      confidence: "low",
      basis: `Median of ${assessed.length} ASSESSED value(s) only. Counties assess below market and the local ratio could not be measured, so this understates market value by an unknown amount — treat it as a floor, not an estimate.`,
    }
  }

  return {
    estimate: null,
    confidence: "none",
    basis: rejected > 0
      ? `No usable value. ${rejected} record(s) carried figures outside any plausible range for a home ` +
        `($${PLAUSIBLE_HOME_MIN.toLocaleString()}–$${PLAUSIBLE_HOME_MAX.toLocaleString()}), which means that layer ` +
        `aggregates by account or district rather than by property — it was refused rather than averaged.`
      : "No assessor record carried a usable value for this area.",
  }
}

// ── Live lookup ───────────────────────────────────────────────────────────────

interface ParcelLayer { name: string; url: string }

// Hand-verified assessor layers, checked to carry real per-parcel VALUES rather
// than just parcel outlines.
//
// WHY PINNED AND NOT DISCOVERED. Discovery through ArcGIS Hub was tried first
// and does not work reliably: the search has no spatial filter, so a query for
// "parcels Ohio" returns Buffalo, Boston and Harris County Texas; which of them
// come back changes between calls; and most of what passes a geographic check
// turns out to be parcel GEOMETRY with no assessed value attached. Ten
// discovered layers for Los Angeles yielded nine parcels and not one value.
//
// The same lesson the recorder feeds taught: a source verified once works every
// time, and an unverified source that returns nothing is indistinguishable from
// an area with no data. Discovery is kept as a supplement, never the foundation.
//
// Each entry below was confirmed by reading a live record from it.
// EMPTY ON PURPOSE.
//
// Harris County TX was pinned here and then removed. It carries the right field
// names — tot_mkt_val, assessed_val, total_appraised_val — and reading one
// record looked like verification. It was not: the figures run to tens of
// millions on parcels coded residential, so the layer aggregates by account or
// district rather than by house. Every estimate built from it was wrong by two
// orders of magnitude while reporting "high" confidence.
//
// A verified-bad source is worse than no source, so it is gone. Adding an entry
// here requires checking that the MAGNITUDES are plausible for individual homes
// in that county, not merely that the columns exist.
const PINNED_LAYERS: Array<ParcelLayer & { region: { west: number; south: number; east: number; north: number } }> = []

function pinnedFor(box: GeoBox): ParcelLayer[] {
  return PINNED_LAYERS
    .filter(l => l.region.west <= box.east && l.region.east >= box.west
              && l.region.south <= box.north && l.region.north >= box.south)
    .map(({ name, url }) => ({ name, url }))
}

// Keyed by the AREA, not the state: the whole point is that a layer is kept
// only if it actually covers the box being valued.
const layerCache = new Map<string, { at: number; layers: ParcelLayer[] }>()
const LAYER_TTL_MS = 6 * 60 * 60 * 1000

/** Does a layer's own declared extent contain any of the box we care about? */
function extentCovers(extent: unknown, box: GeoBox): boolean {
  if (!extent || typeof extent !== "object") return false
  const e = extent as { xmin?: number; ymin?: number; xmax?: number; ymax?: number; spatialReference?: { wkid?: number; latestWkid?: number } }
  if (![e.xmin, e.ymin, e.xmax, e.ymax].every(v => typeof v === "number" && Number.isFinite(v))) return false

  const wkid = e.spatialReference?.latestWkid ?? e.spatialReference?.wkid
  let { xmin, ymin, xmax, ymax } = e as { xmin: number; ymin: number; xmax: number; ymax: number }

  // Web Mercator, which most hosted layers report. Converted rather than
  // rejected, since rejecting it would discard most of the country.
  if (wkid === 102100 || wkid === 3857) {
    const toLng = (x: number) => (x / 20037508.34) * 180
    const toLat = (y: number) => {
      const lat = (y / 20037508.34) * 180
      return (180 / Math.PI) * (2 * Math.atan(Math.exp((lat * Math.PI) / 180)) - Math.PI / 2)
    }
    ;[xmin, xmax] = [toLng(xmin), toLng(xmax)]
    ;[ymin, ymax] = [toLat(ymin), toLat(ymax)]
  } else if (wkid && wkid !== 4326) {
    // A projected system we cannot convert. Kept rather than guessed at — the
    // feature query will settle it.
    return true
  }

  // A layer claiming to cover most of the planet is a basemap, not a county roll.
  if (xmax - xmin > 60 || ymax - ymin > 30) return false

  return xmin <= box.east && xmax >= box.west && ymin <= box.north && ymax >= box.south
}

function metadataUrl(serviceUrl: string): string {
  const base = serviceUrl.replace(/\/$/, "")
  return /\/\d+$/.test(base) ? `${base}?f=json` : `${base}/0?f=json`
}

/**
 * Assessor layers that actually cover the area being valued.
 *
 * THE PROBLEM THIS SOLVES. ArcGIS Hub has no working spatial filter — a search
 * for "parcels Ohio" returns St Mary's Maryland, Buffalo, Boston and Harris
 * County Texas, and which of them come back varies between calls. Taking the
 * first handful and hoping meant the right county's layer was present by luck,
 * and a valuation that silently found nothing looked identical to an area with
 * no records.
 *
 * So the candidate pool is widened, and every candidate is checked against its
 * OWN declared extent before a single feature is requested. That turns luck
 * into a deterministic filter, and costs one cheap metadata call per candidate.
 */
export async function findAssessorLayers(box: GeoBox, state: string): Promise<ParcelLayer[]> {
  const key = `${state}|${box.west.toFixed(2)},${box.south.toFixed(2)},${box.east.toFixed(2)},${box.north.toFixed(2)}`
  const hit = layerCache.get(key)
  if (hit && Date.now() - hit.at < LAYER_TTL_MS) return hit.layers

  const queries = [
    `parcels property assessment ${state}`,
    `parcel assessed value ${state}`,
    `tax parcels ${state}`,
    `parcels ${state}`,
    `property appraisal parcels ${state}`,
  ]

  const candidates = new Map<string, ParcelLayer>()
  await Promise.allSettled(queries.map(async q => {
    const url = `https://hub.arcgis.com/api/v3/datasets?q=${encodeURIComponent(q)}` +
                `&fields[datasets]=name,url&page[size]=40`
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(9000) })
    if (!res.ok) return
    const body = await res.json()
    for (const item of (body.data ?? []) as Array<{ attributes?: Record<string, unknown> }>) {
      const a = item.attributes ?? {}
      const serviceUrl = String(a.url ?? "")
      // Tile services serve pictures of parcels, not their attributes.
      if (serviceUrl.includes("tiles.arcgis.com")) continue
      if (!serviceUrl.includes("FeatureServer") && !serviceUrl.includes("MapServer")) continue
      candidates.set(serviceUrl, { name: String(a.name ?? "parcel layer"), url: serviceUrl })
    }
  }))

  const checked = await Promise.allSettled([...candidates.values()].slice(0, 60).map(async layer => {
    const res = await fetch(metadataUrl(layer.url), { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const meta = await res.json()
    return extentCovers(meta?.extent, box) ? layer : null
  }))

  const discovered = checked
    .map(r => (r.status === "fulfilled" ? r.value : null))
    .filter((l): l is ParcelLayer => l !== null)

  // Verified layers first, so a good answer is not crowded out by ten
  // speculative ones.
  const pinned = pinnedFor(box)
  const seen = new Set(pinned.map(l => l.url))
  const layers = [...pinned, ...discovered.filter(l => !seen.has(l.url))].slice(0, 12)

  layerCache.set(key, { at: Date.now(), layers })
  return layers
}

function queryUrl(serviceUrl: string): string {
  const base = serviceUrl.replace(/\/$/, "")
  return /\/\d+$/.test(base) ? `${base}/query` : `${base}/0/query`
}

/**
 * Value the area inside a box from whatever assessor records can be reached.
 *
 * Deliberately area-level rather than per-address: a single parcel's record is
 * often stale or missing, while the surrounding fifty tell you what the street
 * is worth — which is what an after-repair value actually needs.
 */
export async function valueArea(box: GeoBox, state: string): Promise<ValuationRead> {
  const layers = await findAssessorLayers(box, state)
  const bbox = `${box.west},${box.south},${box.east},${box.north}`

  const observations: ValueObservation[] = []
  const ratioPairs: Array<{ assessed: number; sale: number }> = []
  const perSqft: number[] = []
  let parcelsSampled = 0
  let residentialParcels = 0
  let unknownUseParcels = 0

  await Promise.allSettled(layers.map(async layer => {
    try {
      const qs = new URLSearchParams({
        where: "1=1", outFields: "*", resultRecordCount: "300", f: "json",
        geometry: bbox, geometryType: "esriGeometryEnvelope",
        spatialRel: "esriSpatialRelIntersects", returnGeometry: "false",
        // inSR declares that the envelope above is in degrees. Without it a
        // layer stored in State Plane feet interprets the numbers in its own
        // units, which lands the search in the middle of nowhere and quietly
        // returns almost nothing.
        inSR: "4326", outSR: "4326",
      })
      const res = await fetch(`${queryUrl(layer.url)}?${qs}`, { signal: AbortSignal.timeout(10000) })
      if (!res.ok) return
      const body = await res.json()
      if (body.error) return

      for (const feature of (body.features ?? []) as Array<{ attributes?: Record<string, unknown> }>) {
        const a = feature.attributes ?? {}
        parcelsSampled++

        // Commercial parcels are excluded outright. Parcels whose use cannot be
        // determined are counted and reported, so a mixed figure is never
        // presented as a clean one.
        const use = classifyUse(a)
        if (use === "not-residential") continue
        if (use === "residential") residentialParcels++
        else unknownUseParcels++

        const market = matchField(a, VALUE_PATTERNS.market)
        const assessed = matchField(a, VALUE_PATTERNS.assessed)
        const sale = matchField(a, VALUE_PATTERNS.sale)
        // Square footage IS a building measure, so the land/improvement guard
        // must not apply to it.
        const sqft = matchField(a, VALUE_PATTERNS.sqft, { allowLandOrImprovement: true })

        if (sale && sale.value >= MIN_CREDIBLE_SALE) {
          observations.push({ kind: "sale", value: sale.value, source: layer.name, field: sale.field })
        }
        if (market) {
          observations.push({ kind: "market", value: market.value, source: layer.name, field: market.field })
        }
        if (assessed) {
          observations.push({ kind: "assessed", value: assessed.value, source: layer.name, field: assessed.field })
        }
        // The pair that lets the ratio be measured instead of assumed.
        if (assessed && sale && sale.value >= MIN_CREDIBLE_SALE) {
          ratioPairs.push({ assessed: assessed.value, sale: sale.value })
        }

        const full = market?.value ?? sale?.value
        if (full && sqft && sqft.value > 200) perSqft.push(full / sqft.value)
      }
    } catch { /* one dead layer must not sink the valuation */ }
  }))

  const { ratio, sampleSize } = deriveAssessmentRatio(ratioPairs)

  // Only now, with a measured ratio, may an assessed value be converted.
  if (ratio && ratio > 0) {
    for (const o of observations.filter(o => o.kind === "assessed")) {
      observations.push({
        kind: "assessed-adjusted",
        value: o.value / ratio,
        source: `${o.source} (÷ measured ratio ${ratio.toFixed(3)})`,
        field: o.field,
      })
    }
  }

  const { estimate, confidence, basis } = blendValuations(observations)

  return {
    observations: observations.slice(0, 40),
    estimate,
    assessmentRatio: ratio,
    ratioSampleSize: sampleSize,
    confidence,
    basis: parcelsSampled === 0
      ? `No assessor layer answered for ${state}. Discovery found ${layers.length} candidate layer(s).`
      : `${basis} Drawn from ${residentialParcels} residential parcel(s)` +
        (unknownUseParcels > 0
          ? ` plus ${unknownUseParcels} whose use code was absent — those may include commercial property, so treat the figure as mixed`
          : "") +
        ` out of ${parcelsSampled} sampled across ${layers.length} assessor layer(s).`,
    areaPricePerSqft: trimmedMedian(perSqft),
    parcelsSampled,
    residentialParcels,
    unknownUseParcels,
  }
}
