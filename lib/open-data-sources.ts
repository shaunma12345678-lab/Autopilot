// Free government OPEN-DATA sources (ArcGIS Hub / Esri Feature Services).
// Unlike county court sites, these are built FOR API access and serve plain
// JSON from datacenter IPs — so they actually respond from our servers. They
// surface real distress categories that the listing sources don't carry:
// code-violation, vacant/abandoned, tax-delinquent, and liens. Each lead is
// tagged with the category signal so classifyLead recognizes it.
//
// Coverage depends on whether the searched jurisdiction publishes open data
// (many US cities/counties do). Best-effort: every failure is swallowed.

import type { FreeLead } from "@/lib/free-foreclosure-scraper"
import type { GeoBox } from "@/lib/geocoding"

// Category → (ArcGIS search keywords, signal tag, occupancy hint).
interface Category {
  q: string
  signal: string
  vacant?: boolean
  /** Government-owned inventory, where a parcel number can stand in for a
   *  street address and a listed price is the cost to acquire. */
  cheap?: boolean
}

const CATEGORY: Record<string, Category> = {
  code:        { q: "code enforcement violation",          signal: "Code violation (open data)" },
  vacant:      { q: "vacant abandoned property registry",  signal: "Vacant / abandoned (open data)", vacant: true },
  taxdelq:     { q: "tax delinquent property",             signal: "Tax delinquent (open data)" },
  liens:       { q: "property lien special assessment",    signal: "Lien / assessment (open data)" },
  foreclosure: { q: "foreclosure notice of default",       signal: "Foreclosure record (open data)" },
  // Court-adjacent: only some jurisdictions publish these as open data, but we
  // try — where it exists, it surfaces (best-effort).
  probate:     { q: "probate estate decedent property",    signal: "Probate / inherited estate (open data)" },
  eviction:    { q: "eviction unlawful detainer filing",   signal: "Eviction / tired landlord (open data)" },

  // ── Government-owned inventory: where the genuinely cheap stock lives ──────
  //
  // These are the categories behind properties that sell for hundreds or low
  // thousands rather than a discount off market. A land bank exists to move
  // vacant parcels off the public books; a forfeited-land sale is what happens
  // after tax foreclosure runs its course; a side-lot programme sells the empty
  // parcel next door to the neighbour for a nominal sum.
  //
  // They were absent entirely. "Land bank" appeared once in the whole codebase —
  // inside a prompt suggesting a model go and search for one.
  landbank: { q: "land bank inventory available property", signal: "Land bank inventory (open data)", vacant: true, cheap: true },
  surplus:  { q: "surplus property for sale",              signal: "Government surplus (open data)", cheap: true },
  taxdeed:  { q: "tax deed forfeited land sale",           signal: "Tax deed / forfeited land (open data)", cheap: true },
  sidelot:  { q: "side lot vacant lot program",            signal: "Side lot programme (open data)", vacant: true, cheap: true },
  countyown: { q: "county owned property for sale",        signal: "County-owned for sale (open data)", cheap: true },
}
// Broad sweep when no specific type is requested.
const BROAD = [CATEGORY.code, CATEGORY.vacant, CATEGORY.taxdelq]

// The sweep for cheap inventory specifically.
const CHEAP = [CATEGORY.landbank, CATEGORY.taxdeed, CATEGORY.surplus, CATEGORY.sidelot, CATEGORY.countyown]

const ADDR_FIELDS = ["SITE_ADDR", "SITUS_ADDR", "situs_address", "PropertyAddress", "PROPERTY_ADDRESS", "StreetAddress", "STREET_ADDR", "ADDRESS", "Address", "address", "FULL_ADDR", "ADDR"]
const CITY_FIELDS = ["CITY", "SITUS_CITY", "PropertyCity", "city", "City", "CITY_TWP_V", "TOWNSHIP"]
const ZIP_FIELDS  = ["ZIP", "ZIP_CODE", "SITUS_ZIP", "PropertyZip", "zip", "Zip"]
const OWNER_FIELDS = ["OWNER_NAME", "OwnerName", "OWNER", "owner", "Owner", "GRANTEE", "TAXPAYER", "OWNER1"]

// The field that makes "cheap" findable at all.
//
// estimatedValue was hard-coded to null on every open-data lead, so a $1,200
// side lot and a $400,000 house arrived indistinguishable. Land bank, surplus
// and forfeited-land datasets nearly always carry an asking price or an
// assessed value — it was simply never read.
// Names taken from the live datasets rather than guessed at. Lorain County's
// forfeited-land service calls the acquisition cost "BID" and the arrears
// "TAXES_OWED"; neither was in the first draft of this list, which is why every
// lead came back unpriced.
export const PRICE_FIELDS = [
  "PRICE", "Price", "price", "SALE_PRICE", "SalePrice", "SALEPRICE", "ASKING_PRICE", "AskingPrice",
  "LIST_PRICE", "ListPrice", "BID", "Bid", "MIN_BID", "MinBid", "MINIMUM_BID", "MinimumBid",
  "OPENING_BID", "OpeningBid", "STARTING_BID", "BID_AMOUNT", "BidAmount",
  "COST", "AMOUNT_DUE", "TAXES_DUE", "TAXES_OWED", "TaxesOwed", "TAX_OWED", "DELINQUENT_AMT",
]
const VALUE_FIELDS = [
  "ASSESSED_VALUE", "AssessedValue", "ASSESSEDVAL", "APPRAISED_VALUE", "AppraisedValue",
  "MARKET_VALUE", "MarketValue", "TOTAL_VALUE", "TotalValue", "TOTALVAL", "LAND_VALUE", "LandValue",
  "VALUE", "Value",
]
// Vacant parcels are frequently identified by parcel number rather than a
// street address, which is exactly the inventory being hunted here.
const PARCEL_FIELDS = ["PARCEL_ID", "ParcelID", "PARCELID", "APN", "Apn", "apn", "PIN", "Pin",
                       "PARCEL_NUM", "ParcelNumber", "PPN", "PROPERTY_ID", "TAX_ID", "TaxID"]

/**
 * Whether a returned feature really sits inside the area that was searched.
 *
 * The geometry filter is sent, and several services simply ignore it. Checking
 * here costs nothing and turns "leads from the wrong city" into "no leads",
 * which is the honest outcome. A feature with no usable geometry is KEPT — some
 * services return attributes only, and dropping those would discard good leads
 * to fix a different problem.
 */
export type BoxCheck = "inside" | "outside" | "unknown"

export function withinBox(geometry: unknown, box: GeoBox): BoxCheck {
  if (!geometry || typeof geometry !== "object") return "unknown"
  const g = geometry as { x?: number; y?: number; rings?: number[][][]; paths?: number[][][] }

  const inside = (x: number, y: number) =>
    x >= box.west && x <= box.east && y >= box.south && y <= box.north

  if (typeof g.x === "number" && typeof g.y === "number") {
    return inside(g.x, g.y) ? "inside" : "outside"
  }

  const shape = g.rings ?? g.paths
  if (Array.isArray(shape)) {
    for (const ring of shape) {
      for (const point of ring) {
        if (Array.isArray(point) && point.length >= 2 && inside(point[0], point[1])) return "inside"
      }
    }
    return "outside"
  }
  return "unknown"
}

export function pickNumber(attrs: Record<string, unknown>, fields: string[]): number | null {
  for (const f of fields) {
    const raw = attrs[f]
    if (raw == null) continue
    const n = typeof raw === "number" ? raw : Number(String(raw).replace(/[$,\s]/g, ""))
    if (Number.isFinite(n) && n > 0) return n
  }
  return null
}

function pick(attrs: Record<string, unknown>, fields: string[]): string {
  for (const f of fields) { const v = attrs[f]; if (v != null && String(v).trim()) return String(v).trim() }
  return ""
}

async function queryHub(box: GeoBox, kw: Category, state: string): Promise<FreeLead[]> {
  const bbox = `${box.west},${box.south},${box.east},${box.north}`
  try {
    // THE BUG THIS FIXES. The search carried `filter[bbox]`, which the Hub API
    // rejects outright — "'bbox' is an invalid 'filter' parameter key for the
    // 'datasets' resource" — and answers with zero results. Every category here
    // was therefore returning nothing, for every search, and saying nothing about
    // it, because this file swallows failures by design.
    //
    // There is no working spatial filter to swap in: `filter[extent]` is accepted
    // and then ignored, returning identical datasets for Ohio, Los Angeles and
    // Miami. The spatial work does not belong at this stage anyway — the feature
    // query below already restricts to the box, and correctly.
    //
    // The state goes into the search TEXT instead, which measurably changes what
    // comes back ("Land Bank Parcels", "Forfeited Land Sale" for Ohio).
    //
    // page[size] is 20 rather than 6 because most results are web apps and
    // viewers rather than queryable services — typically only one in four can be
    // queried at all.
    const terms = state ? `${kw.q} ${state}` : kw.q
    const searchUrl = `https://hub.arcgis.com/api/v3/datasets?q=${encodeURIComponent(terms)}` +
                      `&fields[datasets]=name,url&page[size]=20`
    const res = await fetch(searchUrl, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(7000) })
    if (!res.ok) return []
    const data = await res.json()
    const services: string[] = (data.data ?? [])
      .map((d: Record<string, unknown>) => String((d.attributes as Record<string, unknown>)?.url ?? ""))
      .filter((u: string) => u.includes("FeatureServer") || u.includes("MapServer"))
      .slice(0, 6)
    if (services.length === 0) return []

    const out: FreeLead[] = []
    await Promise.allSettled(services.map(async (serviceUrl) => {
      try {
        const base     = serviceUrl.replace(/\/$/, "")
        const queryUrl = /\/\d+$/.test(base) ? `${base}/query` : `${base}/0/query`
        const qs = new URLSearchParams({
          where: "1=1", outFields: "*", resultRecordCount: "200",
          geometry: bbox, geometryType: "esriGeometryEnvelope",
          spatialRel: "esriSpatialRelIntersects", f: "json",
          // Returned so the box can be enforced here as well. Not every service
          // honours the geometry filter — a search for Toledo was coming back
          // with Cleveland addresses, which is worse than returning nothing.
          returnGeometry: "true", outSR: "4326",
        })
        const qRes = await fetch(`${queryUrl}?${qs}`, { signal: AbortSignal.timeout(7000) })
        if (!qRes.ok) return
        const qData = await qRes.json()
        for (const f of (qData.features ?? []) as Record<string, unknown>[]) {
          const a = (f.attributes ?? {}) as Record<string, unknown>

          // Some services ignore the geometry filter AND return no coordinates:
          // the same Ohio parcels came back for Toledo, Cleveland and Miami
          // alike. Those leads are real and often the cheapest ones, so they are
          // kept — but they are marked, because a lead whose location could not
          // be confirmed must never look like one that was.
          const placement = withinBox(f.geometry, box)
          if (placement === "outside") continue
          const street = pick(a, ADDR_FIELDS)
          const parcel = pick(a, PARCEL_FIELDS)

          // A street number is the right test for a house and the wrong one for
          // a vacant parcel, which is often identified only by parcel number —
          // and vacant parcels are the whole point of the cheap categories. So
          // government inventory may identify by parcel instead; everything else
          // still needs a real street address.
          let address = street
          if (!address || !/^\d/.test(address)) {
            if (!kw.cheap || !parcel) continue
            address = street || `Parcel ${parcel}`
          }

          const askingPrice = pickNumber(a, PRICE_FIELDS)
          const assessed = pickNumber(a, VALUE_FIELDS)

          const signals = [kw.signal]
          if (placement === "unknown") {
            signals.push("⚠ Location not confirmed — this dataset publishes no coordinates, so check the parcel is in your area")
          }
          if (parcel) signals.push(`Parcel ${parcel}`)
          if (askingPrice !== null) signals.push(`Asking $${Math.round(askingPrice).toLocaleString()}`)
          else if (assessed !== null) signals.push(`Assessed $${Math.round(assessed).toLocaleString()}`)

          out.push({
            address,
            city:  pick(a, CITY_FIELDS),
            state: state || "CA",
            zip:   pick(a, ZIP_FIELDS),
            ownerName: pick(a, OWNER_FIELDS),
            foreclosureStage: "PRE_FORECLOSURE",
            recordingDate: "",
            // An asking price on government inventory IS the cost to acquire,
            // which is a different fact from a market value estimate and is
            // recorded as such.
            defaultAmount: askingPrice,
            lender: null,
            auctionDate: null,
            estimatedValue: assessed ?? askingPrice,
            sourceUrl: serviceUrl,
            rawSignals: signals,
            occupancy: kw.vacant ? "vacant" : null,
          })
        }
      } catch { /* skip this dataset */ }
    }))
    return out
  } catch {
    return []
  }
}

// Fetch open-data leads for a box. If leadType maps to a category, hunt that;
// otherwise sweep the broad distress set.
export async function fetchOpenDataLeads(
  box: GeoBox | null,
  state: string,
  leadType?: string,
  options: { maxPrice?: number } = {},
): Promise<FreeLead[]> {
  if (!box) return []
  const targets = leadType === "cheap"
    ? CHEAP
    : leadType && CATEGORY[leadType] ? [CATEGORY[leadType]] : BROAD
  const batches = await Promise.all(targets.map((t) => queryHub(box, t, state)))
  // Dedupe by address+city.
  const seen = new Set<string>()
  const out: FreeLead[] = []
  for (const lead of batches.flat()) {
    const key = (lead.address + (lead.city ?? "")).toLowerCase().replace(/[\s,#.-]/g, "")
    if (seen.has(key)) continue
    seen.add(key)

    // A price ceiling drops anything known to cost more, and keeps anything
    // whose price is unknown — an unpriced parcel is a lead to check, not a
    // lead to discard.
    if (options.maxPrice != null) {
      const cost = lead.defaultAmount ?? lead.estimatedValue
      if (cost != null && cost > options.maxPrice) continue
    }
    out.push(lead)
  }

  // Cheapest first when a price is known, so the bargains are not buried under
  // the unpriced majority.
  out.sort((a, b) => {
    const pa = a.defaultAmount ?? a.estimatedValue
    const pb = b.defaultAmount ?? b.estimatedValue
    if (pa == null && pb == null) return 0
    if (pa == null) return 1
    if (pb == null) return -1
    return pa - pb
  })
  return out
}
