// Recorder-grade DIRECT ingestion — pinned, hand-verified official datasets
// pulled straight from government portals the moment we search (no scraping,
// no keyword guessing). Unlike catalog discovery, each feed here has an exact
// resource id, exact field mapping, a recency filter, and an honest stage tag —
// so the leads are current, precise, and carry data nobody else surfaces
// (e.g. the LA foreclosure registry includes the LENDER's name and phone).
//
// Speed is the moat: these registries update as filings happen, days before
// listing sites notice. Best-effort throughout — a dead feed never breaks a
// search. Verified live 2026-07: data.lacity.org 2qnc-kq4g / q3ak-s5hy / u82d-eh7z.

import type { FreeLead } from "@/lib/free-foreclosure-scraper"
import type { GeoBox } from "@/lib/geocoding"

interface PinnedFeed {
  id: string
  label: string
  url: (limit: number) => string
  // Which searches this feed applies to (bbox intersect keeps it local).
  region: { south: number; north: number; west: number; east: number }
  map: (row: Record<string, unknown>) => FreeLead | null
}

const str = (v: unknown): string => (v == null || typeof v === "object" ? "" : String(v).trim())

function monthsAgoIso(months: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - months)
  return d.toISOString().slice(0, 10)
}

// Greater LA (city feeds; generous box so LA County searches catch them).
const LA_REGION = { south: 33.60, north: 34.90, west: -119.00, east: -117.55 }
// Prince George's County, Maryland — the DC eastern suburbs.
const PG_REGION = { south: 38.53, north: 39.05, west: -77.10, east: -76.65 }

const FEEDS: PinnedFeed[] = [
  {
    // LAHD's CURRENT registration year. The older 2qnc-kq4g feed below still
    // carries history, but this is where a filing lands first — and it publishes
    // the servicer's name AND contact, which is the difference between a lead
    // and a lead you can act on today.
    //
    // Verified live 2026-09: newest registration 2026-01-06.
    id: "la-foreclosure-registry-2026",
    label: "LA foreclosure registry 2026 (LAHD)",
    url: (limit) =>
      `https://data.lacity.org/resource/5nzp-isg9.json?$order=registered_date DESC&$limit=${limit}` +
      `&$where=registered_date > '${monthsAgoIso(18)}'`,
    region: LA_REGION,
    map: (r) => {
      const address = str(r.propertyaddress)
      if (!address || !/^\d/.test(address)) return null
      const lender = str(r.lender)
      const contact = str(r.lendercontact)
      return {
        address,
        city: str(r.propertycity) || "Los Angeles",
        state: str(r.propertystate) || "CA",
        zip: str(r.propertyzip).slice(0, 5),
        ownerName: "",
        foreclosureStage: "NOTICE_OF_DEFAULT",
        recordingDate: str(r.registered_date).slice(0, 10),
        defaultAmount: null,
        lender: lender || null,
        auctionDate: null,
        estimatedValue: null,
        sourceUrl: "https://data.lacity.org/d/5nzp-isg9",
        rawSignals: [
          "Registered foreclosure — lender filed a notice of default (LAMC 164.00)",
          ...(contact ? [`Lender contact: ${contact}`] : []),
          ...(str(r.property_type) ? [str(r.property_type)] : []),
        ],
        occupancy: null,
      }
    },
  },
  {
    // Prince George's County, MD publishes foreclosure filings with a full
    // street address. Verified live 2026-09: newest filing 2026-07-28.
    //
    // The sort matters more than it looks: unsorted, this dataset hands back
    // 2009 records first, which is how it reads as a dead archive.
    id: "pg-county-foreclosures",
    label: "Prince George's County MD foreclosures",
    url: (limit) =>
      `https://data.princegeorgescountymd.gov/resource/mnie-hrv7.json?$order=submitteddate DESC` +
      `&$limit=${limit}&$where=submitteddate > '${monthsAgoIso(18)}'`,
    region: PG_REGION,
    map: (r) => {
      const address = str(r.street_address)
      if (!address || !/^\d/.test(address)) return null
      const occupied = str(r.addressoccupied).toLowerCase()
      return {
        address,
        city: str(r.city),
        state: str(r.state) || "MD",
        zip: str(r.zip_code).slice(0, 5),
        ownerName: "",
        foreclosureStage: "PRE_FORECLOSURE",
        recordingDate: str(r.submitteddate).slice(0, 10),
        defaultAmount: null,
        lender: null,
        auctionDate: null,
        estimatedValue: null,
        sourceUrl: "https://data.princegeorgescountymd.gov/d/mnie-hrv7",
        rawSignals: [
          "County foreclosure filing (Prince George's County MD)",
          ...(str(r.propertydescription) && str(r.propertydescription) !== "Unavailable"
            ? [str(r.propertydescription)] : []),
        ],
        // The county records occupancy, which is the single most useful field
        // on a distressed lead and is usually missing entirely.
        occupancy: occupied.includes("vacant") || occupied === "no" ? "vacant"
                 : occupied === "yes" || occupied.includes("occupied") ? "occupied"
                 : null,
      }
    },
  },
  {
    // LAHD Registered Foreclosure Properties — lenders MUST register properties
    // when a notice of default records (LAMC 164.00). Fresh NODs with the
    // servicer's name and phone attached: recorder-grade, zero-day leads.
    id: "la-foreclosure-registry",
    label: "LA foreclosure registry (LAHD)",
    url: (limit) =>
      `https://data.lacity.org/resource/2qnc-kq4g.json?$order=registered_date DESC&$limit=${limit}&$where=registered_date > '${monthsAgoIso(18)}'`,
    region: LA_REGION,
    map: (r) => {
      const address = str(r.propertyaddress)
      if (!address || !/^\d/.test(address)) return null
      return {
        address,
        city: str(r.propertycity) || "Los Angeles",
        state: str(r.propertystate) || "CA",
        zip: str(r.propertyzip).slice(0, 5),
        ownerName: "",
        foreclosureStage: "NOTICE_OF_DEFAULT",
        recordingDate: str(r.registered_date).slice(0, 10),
        defaultAmount: null,
        lender: str(r.lender) || null,
        auctionDate: null,
        estimatedValue: null,
        sourceUrl: "https://data.lacity.org/d/2qnc-kq4g",
        rawSignals: [
          "Registered foreclosure — LAHD lender registry (recorded default)",
          str(r.lender) && `Servicer: ${str(r.lender)}${str(r.lendercontactphone) ? ` ${str(r.lendercontactphone)}` : ""}`,
          str(r.property_type) && `Type: ${str(r.property_type)}`,
        ].filter(Boolean) as string[],
        propertyType: str(r.property_type) || null,
      }
    },
  },
  {
    // Building & Safety Vacant Building Abatement — officially declared vacant
    // structures. Vacancy + enforcement = classic pre-foreclosure motivation.
    id: "la-vacant-abatement",
    label: "LA vacant-building abatement",
    url: (limit) => `https://data.lacity.org/resource/q3ak-s5hy.json?$order=abate_effective DESC&$limit=${limit}`,
    region: LA_REGION,
    map: (r) => {
      const address = str(r.address)
      if (!address || !/^\d/.test(address)) return null
      return {
        address,
        city: "Los Angeles",
        state: "CA",
        zip: "",
        ownerName: "",
        foreclosureStage: "PRE_FORECLOSURE",
        recordingDate: str(r.abate_effective).slice(0, 10),
        defaultAmount: null,
        lender: null,
        auctionDate: null,
        estimatedValue: null,
        sourceUrl: "https://data.lacity.org/d/q3ak-s5hy",
        rawSignals: ["Vacant building — official abatement case (LA Building & Safety)", "vacant abandoned"],
        occupancy: "vacant",
      }
    },
  },
  {
    // Open code-enforcement cases — address is split across columns; recent
    // cases only so the distress is live, not decades old.
    id: "la-code-enforcement",
    label: "LA code enforcement (open cases)",
    url: (limit) => `https://data.lacity.org/resource/u82d-eh7z.json?$order=adddttm DESC&$limit=${limit}&$where=adddttm > '${monthsAgoIso(24)}'`,
    region: LA_REGION,
    map: (r) => {
      const address = [str(r.stno), str(r.predir), str(r.stname), str(r.suffix)].filter(Boolean).join(" ")
      if (!address || !/^\d/.test(address)) return null
      return {
        address,
        city: "Los Angeles",
        state: "CA",
        zip: str(r.zip).replace(/[^0-9]/g, "").slice(0, 5),
        ownerName: "",
        foreclosureStage: "PRE_FORECLOSURE",
        recordingDate: str(r.adddttm).slice(0, 10),
        defaultAmount: null,
        lender: null,
        auctionDate: null,
        estimatedValue: null,
        sourceUrl: "https://data.lacity.org/d/u82d-eh7z",
        rawSignals: ["Open code-enforcement case (LA Building & Safety)", "code violation"],
      }
    },
  },
]

// ── ArcGIS feeds ──────────────────────────────────────────────────────────────
//
// The pinned feeds above are Socrata, which hands back a plain JSON array. A
// great deal of county data lives on ArcGIS instead, which wraps rows in
// {features:[{attributes}]} and needs its own path rather than a bent version
// of the Socrata one.
//
// The layer number is discovered rather than hardcoded. Dakota County files
// each year's sheriff sales as a SEPARATE layer and the index moves — 2024 is
// layer 77, 2025 is layer 80 — so a pinned number works until January and then
// silently serves last year's sales as if they were current. The service is
// asked which layers it has and the highest year wins.

interface ArcGisFeed {
  id: string
  label: string
  /** MapServer or FeatureServer root, without a layer number. */
  service: string
  /** Matches the layer to read; capture group 1 is the year, and the latest wins. */
  layerNamePattern: RegExp
  region: { south: number; north: number; west: number; east: number }
  map: (row: Record<string, unknown>) => FreeLead | null
}

/** Epoch milliseconds, which is how ArcGIS returns every date. */
function esriDate(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return ""
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10)
}

const ARCGIS_FEEDS: ArcGisFeed[] = [
  {
    // Verified 2026-09: newest sale 2025-12-23, 110 sales in the 2025 layer,
    // each with a street address, a city and the amount it sold for.
    id: "dakota-mn-sheriff-sales",
    label: "Dakota County MN sheriff foreclosure sales",
    service: "https://gis2.co.dakota.mn.us/arcgis/rest/services/DCGIS_OL_PropertyInformation/MapServer",
    // The service calls it "Foreclosure Sales (2025)"; the ArcGIS Hub catalogue
    // prepends "Sheriff". Matching on the catalogue's wording found nothing.
    layerNamePattern: /(?:sheriff'?s?\s+)?foreclosure sales\s*\((\d{4})\)/i,
    region: { south: 44.47, north: 44.81, west: -93.34, east: -92.78 },
    map: (r) => {
      const address = str(r.GeoAddress)
      if (!address || !/^\d/.test(address)) return null
      const amount = typeof r.SaleAmount === "number" ? r.SaleAmount : null
      return {
        address,
        city: str(r.CITYNAME),
        state: "MN",
        zip: str(r.ZIPCODE).replace(/[^0-9]/g, "").slice(0, 5),
        ownerName: "",
        // A scheduled sheriff sale is the last stage before the property is
        // gone, which is why the spec rates it PT-1.
        foreclosureStage: "NOTICE_OF_SALE",
        recordingDate: esriDate(r.SaleDate),
        defaultAmount: amount,
        lender: null,
        auctionDate: esriDate(r.SaleDate),
        estimatedValue: null,
        sourceUrl: "https://gis2.co.dakota.mn.us/arcgis/rest/services/DCGIS_OL_PropertyInformation/MapServer",
        rawSignals: [
          "Sheriff sale scheduled (Dakota County MN)",
          ...(amount ? [`Sale amount $${Math.round(amount).toLocaleString()}`] : []),
        ],
      }
    },
  },
]

// Layer lists change once a year at most.
const LAYER_CACHE = new Map<string, { at: number; layer: number | null }>()
const LAYER_TTL_MS = 12 * 60 * 60 * 1000

// How far above the highest listed layer id to look. Dakota's root reports ids
// up to 82 while listing only forty of them, so the newest year sits in the gap.
const LAYER_PROBE_WINDOW = 12

/**
 * Find the layer holding the most recent year.
 *
 * TWO SURPRISES MADE THIS MORE THAN A LOOKUP. The service root lists forty
 * layers with ids running to 82 — the newest year is simply NOT in the list, so
 * reading only what the root advertises finds nothing. And each layer knows its
 * own name at /<id>?f=json, which is how the gap gets searched: a bounded probe
 * across the top of the id range, cached for half a day, rather than a hardcoded
 * number that would silently serve last year's sales every January.
 */
async function resolveLayer(feed: ArcGisFeed): Promise<number | null> {
  const cached = LAYER_CACHE.get(feed.id)
  if (cached && Date.now() - cached.at < LAYER_TTL_MS) return cached.layer

  const pick = (candidates: Array<{ id: number; name: string }>): number | null => {
    let best: { id: number; year: number } | null = null
    for (const c of candidates) {
      const m = feed.layerNamePattern.exec(c.name ?? "")
      if (!m) continue
      const year = Number(m[1])
      if (!Number.isFinite(year)) continue
      if (!best || year > best.year) best = { id: c.id, year }
    }
    return best?.id ?? null
  }

  try {
    const res = await fetch(`${feed.service}?f=json`, { signal: AbortSignal.timeout(9000) })
    if (!res.ok) return cached?.layer ?? null
    const meta = await res.json() as { layers?: Array<{ id: number; name: string }> }
    const listed = meta.layers ?? []

    let layer = pick(listed)

    if (layer === null && listed.length > 0) {
      const top = Math.max(...listed.map(l => l.id))
      const ids = Array.from({ length: LAYER_PROBE_WINDOW }, (_, i) => top + 3 - i)
        .filter(id => id >= 0 && !listed.some(l => l.id === id))

      const probed = await Promise.all(ids.map(async id => {
        try {
          const r = await fetch(`${feed.service}/${id}?f=json`, { signal: AbortSignal.timeout(7000) })
          if (!r.ok) return null
          const m = await r.json() as { name?: string; error?: unknown }
          return m.error || !m.name ? null : { id, name: m.name }
        } catch { return null }
      }))
      layer = pick(probed.filter((p): p is { id: number; name: string } => p !== null))
    }

    LAYER_CACHE.set(feed.id, { at: Date.now(), layer })
    return layer
  } catch {
    return cached?.layer ?? null
  }
}

async function fetchArcGisFeed(feed: ArcGisFeed, limit: number): Promise<FreeLead[]> {
  const cached = FEED_CACHE.get(feed.id)
  if (cached && Date.now() - cached.at < FEED_TTL_MS && cached.rows.length > 0) return cached.rows

  const layer = await resolveLayer(feed)
  if (layer === null) return cached?.rows ?? []

  try {
    const qs = new URLSearchParams({
      where: "1=1", outFields: "*", f: "json", returnGeometry: "false",
      resultRecordCount: String(limit),
    })
    const res = await fetch(`${feed.service}/${layer}/query?${qs}`, { signal: AbortSignal.timeout(12000) })
    if (!res.ok) return cached?.rows ?? []
    const data = await res.json() as { features?: Array<{ attributes?: Record<string, unknown> }>; error?: unknown }
    if (data.error || !Array.isArray(data.features)) return cached?.rows ?? []

    const rows: FreeLead[] = []
    for (const feature of data.features) {
      try { const lead = feed.map(feature.attributes ?? {}); if (lead) rows.push(lead) } catch { /* skip bad row */ }
    }
    FEED_CACHE.set(feed.id, { at: Date.now(), rows })
    return rows
  } catch {
    return cached?.rows ?? []
  }
}

// In-module cache: registries don't change minute-to-minute, so repeat searches
// reuse the rows instead of re-hitting the portal (warm-instance scoped).
const FEED_CACHE = new Map<string, { at: number; rows: FreeLead[] }>()
const FEED_TTL_MS = 2 * 60 * 60 * 1000

function boxesIntersect(a: GeoBox, b: { south: number; north: number; west: number; east: number }): boolean {
  return a.south <= b.north && a.north >= b.south && a.west <= b.east && a.east >= b.west
}

async function fetchFeed(feed: PinnedFeed, limit: number): Promise<FreeLead[]> {
  const cached = FEED_CACHE.get(feed.id)
  if (cached && Date.now() - cached.at < FEED_TTL_MS && cached.rows.length > 0) return cached.rows
  try {
    const res = await fetch(feed.url(limit), { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(9000) })
    if (!res.ok) return cached?.rows ?? []
    const data = await res.json()
    if (!Array.isArray(data)) return cached?.rows ?? []
    const rows: FreeLead[] = []
    for (const raw of data as Record<string, unknown>[]) {
      try { const lead = feed.map(raw); if (lead) rows.push(lead) } catch { /* skip bad row */ }
    }
    FEED_CACHE.set(feed.id, { at: Date.now(), rows })
    return rows
  } catch {
    return cached?.rows ?? []
  }
}

// All pinned feeds whose region intersects the searched box, in parallel.
export async function fetchRecorderDirect(box: GeoBox | null, maxPerFeed = 200): Promise<FreeLead[]> {
  if (!box) return []
  const applicable = FEEDS.filter((f) => boxesIntersect(box, f.region))
  const applicableArcGis = ARCGIS_FEEDS.filter((f) => boxesIntersect(box, f.region))
  if (applicable.length === 0 && applicableArcGis.length === 0) return []

  const results = await Promise.allSettled([
    ...applicable.map((f) => fetchFeed(f, maxPerFeed)),
    ...applicableArcGis.map((f) => fetchArcGisFeed(f, maxPerFeed)),
  ])
  const out: FreeLead[] = []
  for (const r of results) if (r.status === "fulfilled") out.push(...r.value)
  return out
}
