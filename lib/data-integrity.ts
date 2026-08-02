// Data Integrity Layer for the markets module.
//
// Ports the discipline from DEEP_RISK_DATA_INTEGRITY_SPEC.md to stocks/crypto:
// every data point carries where it came from, when it was fetched, and whether
// it's a verified figure or an inference. No silent estimates — an inferred
// value must never render identically to a filed/quoted one.
//
// Deliberately dependency-free and synchronous so it can wrap any adapter
// without changing that adapter's shape.

export type SourceId =
  | "sec-edgar-xbrl"
  | "sec-edgar-submissions"
  | "sec-edgar-fulltext"
  | "stooq-quote"
  | "stooq-history"
  | "coingecko"
  | "defillama"
  | "github"
  | "goplus"
  | "exchange-orderbook"
  | "derived"          // computed by us from other sourced fields
  | "sector-benchmark" // computed from our own accumulated dataset

// How reliable a source is on its own terms. Filed regulatory data outranks
// a scraped quote, which outranks a heuristic we computed ourselves.
const SOURCE_RELIABILITY: Record<SourceId, "verified" | "quoted" | "derived"> = {
  "sec-edgar-xbrl": "verified",
  "sec-edgar-submissions": "verified",
  "sec-edgar-fulltext": "verified",
  "stooq-quote": "quoted",
  "stooq-history": "quoted",
  coingecko: "quoted",
  defillama: "quoted",
  github: "quoted",
  goplus: "quoted",
  "exchange-orderbook": "quoted",
  derived: "derived",
  "sector-benchmark": "derived",
}

// Freshness windows, in hours, past which a field should be treated as stale.
// Market prices go stale in a day; an annual filing does not.
const FRESHNESS_HOURS: Record<SourceId, number> = {
  "sec-edgar-xbrl": 24 * 45,        // quarterly filers — 45 days is a reasonable re-check
  "sec-edgar-submissions": 24 * 30,
  "sec-edgar-fulltext": 24 * 7,
  "stooq-quote": 24,
  "stooq-history": 24,
  coingecko: 6,
  defillama: 24 * 3,
  github: 24 * 7,
  goplus: 24 * 14,                  // contract properties change rarely, but not never
  "exchange-orderbook": 6,
  derived: 24,
  "sector-benchmark": 24 * 7,
}

export interface FieldProvenance {
  source: SourceId
  fetchedAt: string        // ISO timestamp
  isEstimate: boolean
  note?: string
}

export type ProvenanceMap = Record<string, FieldProvenance>

export function provenance(source: SourceId, opts?: { isEstimate?: boolean; note?: string }): FieldProvenance {
  return {
    source,
    fetchedAt: new Date().toISOString(),
    isEstimate: opts?.isEstimate ?? SOURCE_RELIABILITY[source] === "derived",
    note: opts?.note,
  }
}

// Stamps the same provenance across a group of fields produced by one adapter call.
export function stampFields(fields: string[], source: SourceId, opts?: { isEstimate?: boolean; note?: string }): ProvenanceMap {
  const p = provenance(source, opts)
  const map: ProvenanceMap = {}
  for (const f of fields) map[f] = p
  return map
}

export function isStale(entry: FieldProvenance, now = Date.now()): boolean {
  const window = FRESHNESS_HOURS[entry.source]
  if (window === undefined) return false
  const age = now - new Date(entry.fetchedAt).getTime()
  if (!isFinite(age)) return false
  return age > window * 3600_000
}

export interface IntegrityReport {
  totalFields: number
  verifiedFields: number
  estimatedFields: number
  staleFields: string[]
  verifiedPct: number
  summary: string
}

export function assessIntegrity(map: ProvenanceMap | null | undefined, now = Date.now()): IntegrityReport {
  const entries = Object.entries(map ?? {})
  if (entries.length === 0) {
    return {
      totalFields: 0, verifiedFields: 0, estimatedFields: 0, staleFields: [],
      verifiedPct: 0, summary: "No source attribution recorded for this asset yet.",
    }
  }

  const staleFields: string[] = []
  let verified = 0
  let estimated = 0

  for (const [field, entry] of entries) {
    if (entry.isEstimate || SOURCE_RELIABILITY[entry.source] === "derived") estimated++
    else if (SOURCE_RELIABILITY[entry.source] === "verified") verified++
    if (isStale(entry, now)) staleFields.push(field)
  }

  const verifiedPct = Math.round((verified / entries.length) * 100)
  const summary = staleFields.length > 0
    ? `${verifiedPct}% of fields come from filed regulatory data. ${staleFields.length} field(s) are past their freshness window and may be outdated.`
    : `${verifiedPct}% of fields come from filed regulatory data; ${estimated} value(s) are computed estimates rather than reported figures.`

  return { totalFields: entries.length, verifiedFields: verified, estimatedFields: estimated, staleFields, verifiedPct, summary }
}

// Fallback hierarchy: try sources in priority order, return the first that
// yields a usable value along with its provenance. Never throws — a source
// that errors is simply skipped, so the system degrades instead of failing.
export async function firstAvailable<T>(
  candidates: Array<{ source: SourceId; fetch: () => Promise<T | null>; isEstimate?: boolean }>
): Promise<{ value: T; provenance: FieldProvenance } | null> {
  for (const candidate of candidates) {
    try {
      const value = await candidate.fetch()
      if (value !== null && value !== undefined) {
        return { value, provenance: provenance(candidate.source, { isEstimate: candidate.isEstimate }) }
      }
    } catch {
      // try the next source
    }
  }
  return null
}

// Cross-source reconciliation: when two sources report the same fact, agree
// within tolerance or flag the conflict rather than silently picking one.
export interface Reconciliation {
  value: number | null
  agreed: boolean
  conflict: string | null
}

export function reconcileNumeric(
  a: { value: number | null; source: SourceId },
  b: { value: number | null; source: SourceId },
  tolerancePct = 5
): Reconciliation {
  if (a.value === null && b.value === null) return { value: null, agreed: false, conflict: null }
  if (a.value === null) return { value: b.value, agreed: false, conflict: null }
  if (b.value === null) return { value: a.value, agreed: false, conflict: null }

  const denominator = Math.abs(a.value) || Math.abs(b.value) || 1
  const diffPct = (Math.abs(a.value - b.value) / denominator) * 100
  if (diffPct <= tolerancePct) return { value: a.value, agreed: true, conflict: null }

  return {
    value: a.value, // prefer the higher-priority source, but say so
    agreed: false,
    conflict: `${a.source} reports ${a.value} but ${b.source} reports ${b.value} (${diffPct.toFixed(1)}% apart) — using ${a.source}.`,
  }
}
