// The AutoPilot Property Index — OUR database. Every source that touches a
// property (registries, parcels, listings, open data, enrichment, AI) writes
// an OBSERVATION into one canonical record per address instead of a throwaway
// lead. Fields carry provenance: {value, source, trust, seenAt} — a higher-
// trust source overwrites a lower one; equal trust refreshes staleness. Records
// never expire; they accumulate signal history, a data-confidence score, and
// the versioned Potential Score. Server-only. Bulk I/O (2 REST calls per batch:
// one select-in, one upsert) so feeding the index never slows a search.

import { getAdminClient } from "@/lib/supabase/admin"
import type { ForeclosureLead } from "@/lib/agents/foreclosure-agent"
import { potentialScore, zipDensityMap, POTENTIAL_VERSION, type PotentialContext } from "@/lib/potential-score"

// ── Source trust ranking — the heart of "quality of info" ────────────────────
// County assessor beats recorder registry beats gov open data beats listings
// beats AI web extraction. Unknown sources get a cautious default.
export const SOURCE_TRUST: Record<string, number> = {
  "county-assessor": 95,   // parcel layers (LA/Wayne/Maricopa/Marion)
  "recorder-direct": 90,   // pinned registries (LAHD foreclosure registry, …)
  "ca-doj": 88,
  "gov-open-data": 80,     // ArcGIS/Socrata connectors
  "hud-reo": 78,
  "census-geocode": 76,    // canonical city/zip/county resolution
  "listing": 68,           // Redfin/Zillow payloads
  "auction-site": 62,
  "legal-notice": 60,
  "rentcast": 85,          // paid AVM when keyed
  "comp-model": 55,        // our computed values
  "web-ai": 40,            // AI-extracted from web pages
  "inbound-seller": 92,    // the homeowner told us themselves
  "unknown": 45,
}

export interface FieldObs { v: string | number | boolean; src: string; t: number; at: string }
export type IndexFields = Record<string, FieldObs>

export interface IndexRecord {
  id: string
  sig: string
  address: string
  city: string | null
  state: string | null
  zip: string | null
  county: string | null
  fields: IndexFields
  signals: Array<{ s: string; src: string; at: string }>
  stage: string | null
  potential: number | null
  potentialV: string | null
  confidence: number | null
  firstSeen: string
  lastSeen: string
  seenCount: number
}

export function indexSig(address: string, zip?: string | null): string {
  const a = (address || "").toLowerCase().replace(/[^a-z0-9]/g, "")
  return `${a}|${String(zip ?? "").slice(0, 5)}`
}

// Which lead fields we track with provenance (only real, useful facts).
const TRACKED: Array<keyof ForeclosureLead> = [
  "ownerName", "mailingAddress", "phone", "email", "beds", "baths", "sqft",
  "yearBuilt", "propertyType", "estimatedValue", "avmValue", "rentEstimate",
  "purchasePrice", "purchaseDate", "lender", "auctionDate", "defaultAmount",
  "equityPercent", "totalLiens",
]

// Data confidence 0-100 = completeness of the core facts × the trust of what
// filled them. "87% — assessor-verified" vs "34% — mostly AI-extracted".
const CORE_FIELDS = ["ownerName", "sqft", "yearBuilt", "estimatedValue", "beds"]
export function computeConfidence(fields: IndexFields, hasLocation: boolean): number {
  let pts = hasLocation ? 12 : 0
  const max = 12 + CORE_FIELDS.length * 14 + 18
  for (const f of CORE_FIELDS) {
    const o = fields[f]
    if (o) pts += 14 * (o.t / 100)
  }
  // Extra facts beyond the core add a little.
  const extras = Object.keys(fields).filter((k) => !CORE_FIELDS.includes(k)).length
  pts += Math.min(18, extras * 3)
  return Math.max(0, Math.min(100, Math.round((pts / max) * 100)))
}

function mergeField(fields: IndexFields, key: string, value: unknown, src: string, nowIso: string): void {
  if (value == null) return
  if (typeof value === "string" && !value.trim()) return
  if (typeof value === "number" && !Number.isFinite(value)) return
  const trust = SOURCE_TRUST[src] ?? SOURCE_TRUST.unknown
  const cur = fields[key]
  // Overwrite when: no current value, higher trust, or same-or-higher trust and
  // the current observation is stale (>120 days).
  const staleMs = 120 * 86400000
  if (!cur || trust > cur.t || (trust >= cur.t && Date.now() - Date.parse(cur.at) > staleMs)) {
    fields[key] = { v: value as string | number | boolean, src, t: trust, at: nowIso }
  }
}

const STAGE_RANK: Record<string, number> = { PRE_FORECLOSURE: 1, NOTICE_OF_DEFAULT: 2, LIS_PENDENS: 2, NOTICE_OF_SALE: 3, AUCTION: 4 }

// Map a lead's sourceUrl/signals to a trust-registry source id.
export function sourceIdFor(lead: ForeclosureLead): string {
  const u = ((lead as unknown as { sourceUrl?: string }).sourceUrl ?? "").toLowerCase()
  const sig = (lead.distressSignals ?? []).join(" ").toLowerCase()
  if (u.includes("data.lacity.org")) return "recorder-direct"
  if (u.includes("oag.ca.gov")) return "ca-doj"
  if (u.includes("redfin") || u.includes("zillow")) return "listing"
  if (u.includes("auction.com") || u.includes("bid4assets")) return "auction-site"
  if (u.includes("hud") || u.includes("homepath") || u.includes("homesteps")) return "hud-reo"
  if (u.includes("arcgis") || u.includes("socrata") || sig.includes("open data")) return "gov-open-data"
  if (sig.includes("legal notice") || sig.includes("public notice")) return "legal-notice"
  return "unknown"
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = () => (getAdminClient() as any).from("PropertyIndex")

// ── The write path: fold a batch of leads into the index ────────────────────
export interface ObserveResult { observed: number; created: number; updated: number }

export async function observeLeads(
  leads: ForeclosureLead[],
  opts?: { source?: string; ctx?: PotentialContext; cap?: number },
): Promise<ObserveResult> {
  const cap = opts?.cap ?? 250
  const batch = leads.filter((l) => l.address && l.address.trim().length > 5).slice(0, cap)
  if (!batch.length) return { observed: 0, created: 0, updated: 0 }
  const nowIso = new Date().toISOString()
  const density = zipDensityMap(leads)

  try {
    // 1) One bulk read of everything we already know.
    const sigs = [...new Set(batch.map((l) => indexSig(l.address, l.zip)))]
    const { data: existing } = await table().select("*").in("sig", sigs)
    const bySig = new Map<string, IndexRecord>()
    for (const r of (existing ?? []) as IndexRecord[]) bySig.set(r.sig, r)

    // 2) Merge in memory.
    const rows: Record<string, unknown>[] = []
    const seen = new Set<string>()
    let created = 0, updated = 0
    for (const lead of batch) {
      const sig = indexSig(lead.address, lead.zip)
      if (seen.has(sig)) continue
      seen.add(sig)
      const src = opts?.source ?? sourceIdFor(lead)
      const cur = bySig.get(sig)
      const fields: IndexFields = cur?.fields && typeof cur.fields === "object" ? { ...cur.fields } : {}
      for (const key of TRACKED) mergeField(fields, key, lead[key], src, nowIso)

      // Signal history: append new distress signals (dedup by text), cap 40.
      const signals = Array.isArray(cur?.signals) ? [...cur.signals] : []
      const have = new Set(signals.map((s) => s.s.toLowerCase()))
      for (const s of lead.distressSignals ?? []) {
        const t = s.trim()
        if (t && !have.has(t.toLowerCase())) { signals.push({ s: t.slice(0, 160), src, at: nowIso }); have.add(t.toLowerCase()) }
      }

      // Stage only advances (a property can't un-file), unless none stored.
      const newStage = lead.foreclosureStage ?? null
      const stage = cur?.stage && newStage
        ? ((STAGE_RANK[newStage] ?? 0) >= (STAGE_RANK[cur.stage] ?? 0) ? newStage : cur.stage)
        : (newStage ?? cur?.stage ?? null)

      const ctx: PotentialContext = {
        ...opts?.ctx,
        zipDistressDensity: lead.zip ? density.get((lead.zip || "").slice(0, 5)) ?? opts?.ctx?.zipDistressDensity ?? null : opts?.ctx?.zipDistressDensity ?? null,
      }
      const pot = potentialScore(lead, ctx)
      const confidence = computeConfidence(fields, Boolean((lead.city || cur?.city) && (lead.zip || cur?.zip)))

      if (cur) updated++; else created++
      rows.push({
        id: cur?.id ?? crypto.randomUUID(),
        sig,
        address: lead.address.trim().slice(0, 160),
        city: lead.city?.trim() || cur?.city || null,
        state: (lead.state?.trim() || cur?.state || null)?.toUpperCase?.() ?? null,
        zip: (lead.zip || cur?.zip || "").slice(0, 5) || null,
        county: cur?.county ?? null,
        fields,
        signals: signals.slice(-40),
        stage,
        potential: pot.score,
        potentialV: POTENTIAL_VERSION,
        confidence,
        firstSeen: cur?.firstSeen ?? nowIso,
        lastSeen: nowIso,
        seenCount: (cur?.seenCount ?? 0) + 1,
        updatedAt: nowIso,
      })
    }

    // 3) One bulk upsert.
    if (rows.length) {
      const { error } = await table().upsert(rows, { onConflict: "sig" })
      if (error) throw error
    }
    return { observed: rows.length, created, updated }
  } catch {
    return { observed: 0, created: 0, updated: 0 }  // best-effort — never break a search
  }
}

// ── Read paths ────────────────────────────────────────────────────────────────
export interface IndexStats {
  total: number
  withOwner: number
  assessorVerified: number
  avgConfidence: number | null
  avgPotential: number | null
  prime: number            // potential ≥ 75
  cities: number
  newest: string | null
}

export async function indexStats(): Promise<IndexStats | null> {
  try {
    const { count: total } = await table().select("*", { count: "exact", head: true })
    const { count: prime } = await table().select("*", { count: "exact", head: true }).gte("potential", 75)
    const { data: sample } = await table().select("city,state,confidence,potential,fields,lastSeen").order("lastSeen", { ascending: false }).limit(1000)
    const rows = (sample ?? []) as Array<{ city: string | null; state: string | null; confidence: number | null; potential: number | null; fields: IndexFields; lastSeen: string }>
    const cities = new Set(rows.filter((r) => r.city).map((r) => `${r.city}|${r.state}`)).size
    const confs = rows.map((r) => r.confidence).filter((c): c is number => c != null)
    const pots = rows.map((r) => r.potential).filter((p): p is number => p != null)
    const withOwner = rows.filter((r) => r.fields?.ownerName).length
    const assessorVerified = rows.filter((r) => Object.values(r.fields ?? {}).some((f) => f.src === "county-assessor")).length
    return {
      total: total ?? 0,
      withOwner,
      assessorVerified,
      avgConfidence: confs.length ? Math.round(confs.reduce((s, c) => s + c, 0) / confs.length) : null,
      avgPotential: pots.length ? Math.round(pots.reduce((s, p) => s + p, 0) / pots.length) : null,
      prime: prime ?? 0,
      cities,
      newest: rows[0]?.lastSeen ?? null,
    }
  } catch {
    return null
  }
}

export async function queryIndex(q: { city?: string; state?: string; zip?: string; minPotential?: number; limit?: number }): Promise<IndexRecord[]> {
  try {
    let sel = table().select("*")
    if (q.zip) sel = sel.eq("zip", q.zip.slice(0, 5))
    else if (q.city) {
      sel = sel.ilike("city", `%${q.city.trim()}%`)
      if (q.state) sel = sel.eq("state", q.state.trim().toUpperCase())
    }
    if (q.minPotential) sel = sel.gte("potential", q.minPotential)
    sel = sel.order("potential", { ascending: false, nullsFirst: false }).limit(Math.min(q.limit ?? 50, 200))
    const { data } = await sel
    return ((data ?? []) as IndexRecord[])
  } catch {
    return []
  }
}

// Thin, high-potential records — the nightly backfill works these first.
export async function thinHighPotential(limit = 12): Promise<IndexRecord[]> {
  try {
    const { data } = await table()
      .select("*")
      .gte("potential", 55)
      .lt("confidence", 60)
      .order("potential", { ascending: false, nullsFirst: false })
      .limit(limit)
    return ((data ?? []) as IndexRecord[])
  } catch {
    return []
  }
}

// Patch one record after enrichment (assessor-trust fields).
export async function patchRecord(rec: IndexRecord, patch: Record<string, unknown>, src: string): Promise<void> {
  try {
    const nowIso = new Date().toISOString()
    const fields: IndexFields = { ...(rec.fields ?? {}) }
    for (const [k, v] of Object.entries(patch)) mergeField(fields, k, v, src, nowIso)
    const confidence = computeConfidence(fields, Boolean(rec.city && rec.zip))
    await table().update({ fields, confidence, updatedAt: nowIso }).eq("id", rec.id)
  } catch { /* best-effort */ }
}

export async function setRecordLocation(rec: IndexRecord, loc: { city?: string | null; zip?: string | null; county?: string | null }): Promise<void> {
  try {
    const upd: Record<string, unknown> = { updatedAt: new Date().toISOString() }
    if (loc.city && !rec.city) upd.city = loc.city
    if (loc.zip && !rec.zip) upd.zip = loc.zip.slice(0, 5)
    if (loc.county && !rec.county) upd.county = loc.county
    if (Object.keys(upd).length > 1) await table().update(upd).eq("id", rec.id)
  } catch { /* best-effort */ }
}
