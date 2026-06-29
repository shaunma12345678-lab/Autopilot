// County/city distress-data connectors — our own keyless index of distress
// signals BEYOND foreclosure: code violations, vacant/abandoned registries, tax
// delinquency, etc., pulled straight from government open-data (Socrata/ArcGIS).
// Each city has a small registry of datasets + a row→lead builder. This is the
// framework that grows the "owned index" one record-type at a time. Never throws.

import type { FreeLead } from "@/lib/free-foreclosure-scraper"

type Row = Record<string, unknown>
interface BuiltLead { address: string; date?: string; signal: string; vacant?: boolean; zip?: string }

interface DistressDataset {
  domain:      string   // Socrata host, e.g. data.cityofchicago.org
  resource:    string   // dataset id
  vector:      string   // human label, e.g. "Code violation"
  city:        string
  state:       string
  where?:      string   // optional Socrata $where filter (active/open only)
  recentField?: string  // date field to constrain to recent records (actionable only)
  zipField?:   string   // dataset field holding the ZIP (enables ZIP search)
  build:       (r: Row) => BuiltLead | null
}

// Only pull records from the last ~18 months so leads are actionable, not stale.
const RECENT_CUTOFF = new Date(Date.now() - 548 * 86400_000).toISOString().slice(0, 10) + "T00:00:00"

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "")

// Verified keyless distress datasets, keyed by "city:state".
const DISTRESS: Record<string, DistressDataset[]> = {
  "chicago:il": [
    {
      domain: "data.cityofchicago.org", resource: "22u3-xenr", vector: "Code violation",
      city: "Chicago", state: "IL", where: "violation_status='OPEN'", recentField: "violation_date",
      build: (r) => { const a = str(r.address); return a ? { address: a, date: str(r.violation_date).slice(0, 10), signal: `Code violation — ${str(r.violation_description) || "open"}` } : null },
    },
    {
      // Only buildings reported as CURRENTLY vacant. A vacancy is a standing
      // status, so no recent-date filter — but we do have a ZIP field.
      domain: "data.cityofchicago.org", resource: "7nii-7srd", vector: "Vacant/abandoned",
      city: "Chicago", state: "IL", where: "is_the_building_currently_vacant_or_occupied_='Vacant'", zipField: "zip_code",
      build: (r) => {
        const a = [str(r.address_street_number), str(r.address_street_direction), str(r.address_street_name), str(r.address_street_suffix)].filter(Boolean).join(" ")
        if (!a) return null
        const fire = str(r.is_the_building_vacant_due_to_fire_).toLowerCase() === "true"
        // No date — vacancy is a standing status, not a dated "filing" that ages out.
        return { address: a, zip: str(r.zip_code), signal: fire ? "Vacant building — FIRE-DAMAGED (city registry)" : "Vacant/abandoned building (city registry)", vacant: true }
      },
    },
  ],
}

// Datasets that apply to a search: by city (all vectors) or by ZIP (only the
// zip-capable datasets in that state).
function datasetsFor(opts: { city?: string; state: string; zip?: string }): DistressDataset[] {
  const st = (opts.state || "").toLowerCase().trim()
  if (opts.zip) {
    return Object.entries(DISTRESS).filter(([k]) => k.endsWith(`:${st}`)).flatMap(([, v]) => v).filter((d) => d.zipField)
  }
  return DISTRESS[`${(opts.city || "").toLowerCase().trim()}:${st}`] ?? []
}

export function distressVectorsFor(city: string, state: string, zip?: string): string[] {
  return Array.from(new Set(datasetsFor({ city, state, zip }).map((d) => d.vector)))
}

export async function fetchDistressLeads(opts: { city?: string; state: string; zip?: string; limit?: number }): Promise<FreeLead[]> {
  const sets = datasetsFor(opts)
  if (!sets.length) return []
  const zip = (opts.zip || "").trim()
  const limit = Math.min(Math.max(opts.limit ?? 200, 50), 500)
  const out: FreeLead[] = []
  await Promise.all(sets.map(async (ds) => {
    try {
      const clauses = [
        ds.where,
        ds.recentField ? `${ds.recentField} > '${RECENT_CUTOFF}'` : null,
        zip && ds.zipField ? `${ds.zipField}='${zip}'` : null,
      ].filter(Boolean)
      const where = clauses.length ? `&$where=${encodeURIComponent(clauses.join(" AND "))}` : ""
      const order = ds.recentField ? `&$order=${encodeURIComponent(ds.recentField)}+DESC` : ""
      const url = `https://${ds.domain}/resource/${ds.resource}.json?$limit=${limit}${where}${order}`
      const res = await fetch(url, { signal: AbortSignal.timeout(12000) })
      if (!res.ok) return
      const rows = (await res.json()) as Row[]
      for (const r of rows) {
        const b = ds.build(r)
        if (!b || !b.address) continue
        out.push({
          address: b.address, city: ds.city, state: ds.state, zip: b.zip ?? "",
          ownerName: "", foreclosureStage: "PRE_FORECLOSURE",
          recordingDate: b.date ?? "", defaultAmount: null, lender: null, auctionDate: null, estimatedValue: null,
          sourceUrl: `https://${ds.domain}/resource/${ds.resource}`, rawSignals: [b.signal],
          ...(b.vacant ? { occupancy: "vacant" as const } : {}),
        })
      }
    } catch { /* skip dataset */ }
  }))
  // Dedupe by address.
  const seen = new Set<string>()
  const dedup: FreeLead[] = []
  for (const l of out) {
    const k = l.address.toLowerCase().replace(/[\s,.#-]/g, "")
    if (!k || seen.has(k)) continue
    seen.add(k)
    dedup.push(l)
  }
  return dedup
}
