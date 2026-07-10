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

const FEEDS: PinnedFeed[] = [
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
  if (applicable.length === 0) return []
  const results = await Promise.allSettled(applicable.map((f) => fetchFeed(f, maxPerFeed)))
  const out: FreeLead[] = []
  for (const r of results) if (r.status === "fulfilled") out.push(...r.value)
  return out
}
