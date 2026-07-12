// Cash Buyer Intelligence — our own keyless way to find the actual buyers for
// your deals AND everything about them. Public assessor data grouped by owner:
// whoever owns MANY properties is an active investor. For each buyer we pull
// the full picture — portfolio size and sample, where they buy (top ZIPs),
// what they buy (property class), how ACTIVE they are (recent purchases where
// the county publishes sale dates), portfolio value, entity type, absentee
// status, mailing address — and score them so the hottest buyers rise to the
// top. Verified layers: Wayne MI, Maricopa AZ, Marion IN. Never throws.

import { normCounty } from "@/lib/area-scope"

export interface BuyerProperty {
  address: string
  city: string
  zip: string
  value: number | null      // assessed / full-cash value
  salePrice: number | null
  saleDate: string | null   // ISO date when the county publishes it
  use: string | null
}

export interface CashBuyer {
  owner: string              // cleaned for display
  ownerRaw: string           // exactly as stored in the county data — REQUIRED for follow-up queries
  county: string             // which county's data this buyer came from (display)
  countyKey: string          // registry key, e.g. "wayne:mi" — the client passes it back for dossier/contact
  count: number              // properties they own in the searched area (county, city, or ZIP)
  mailing: string | null
  mailingState: string | null
  entity: "LLC" | "Trust" | "Company" | "Individual"
  absentee: boolean          // mails out-of-state → remote investor
  recentBuys: number         // purchases in the last 18 months (0 when county has no sale data)
  lastBuy: string | null     // most recent purchase date (ISO)
  hasSaleData: boolean       // county publishes sale dates/prices
  portfolioValue: number | null // sum of known values across the sampled portfolio
  avgValue: number | null
  topZips: string[]          // where they buy (up to 4)
  topUse: string | null      // what they buy most
  score: number              // 0-100: activity + scale + reachability
  sample: BuyerProperty[]    // portfolio sample (the dossier preview)
}

interface BuyerLayer {
  url: string
  owner: string
  mailAddr: string; mailCity: string; mailState?: string; mailZip: string
  situsAddr?: string; situsNum?: string; situsCity?: string; situsZip?: string
  saleDate?: string; salePrice?: string; value?: string; use?: string
  stateAbbr: string
  fixedCity?: string        // county layers without a situs-city column
  label: string
}

// Assessor layers with verified owner + detail fields (curl-checked live).
const BUYER_LAYERS: Record<string, BuyerLayer> = {
  "wayne:mi": {
    url: "https://services2.arcgis.com/qvkbeam7Wirps6zC/arcgis/rest/services/parcel_file_current/FeatureServer/0/query",
    owner: "taxpayer_1", mailAddr: "taxpayer_address", mailCity: "taxpayer_city", mailState: "taxpayer_state", mailZip: "taxpayer_zip_code",
    situsAddr: "address", situsZip: "zip_code",
    saleDate: "sale_date", salePrice: "amt_sale_price", value: "amt_assessed_value", use: "use_code_description",
    stateAbbr: "MI", fixedCity: "Detroit",
    label: "Wayne County, MI",
  },
  // NOTE: Maricopa AZ is deliberately NOT here — its assessor MapServer times
  // out on county-wide GROUP BY (1.6M parcels, verified live 2026-07). It stays
  // in parcel-enrich, where per-point lookups are fast.
  "marion:in": {
    url: "https://gis.indy.gov/server/rest/services/MapIndy/MapIndyProperty/MapServer/10/query",
    owner: "FULLOWNERNAME", mailAddr: "OWNERADDRESS", mailCity: "OWNERCITY", mailState: "OWNERSTATE", mailZip: "OWNERZIP",
    situsNum: "STNUMBER", situsAddr: "FULL_STNAME", situsCity: "CITY", situsZip: "ZIPCODE",
    value: "ASSESSORYEAR_TOTALAV", use: "PROPERTY_SUB_CLASS_DESCRIPTION",
    stateAbbr: "IN",
    label: "Marion County, IN (Indianapolis)",
  },
}

export const BUYER_COUNTIES = Object.values(BUYER_LAYERS).map((l) => l.label)
export const BUYER_STATES = [...new Set(Object.values(BUYER_LAYERS).map((l) => l.stateAbbr))]

// Names that are NOT private cash buyers (government / institutional / lenders).
const INSTITUTIONAL = /\b(city|county|state|u ?s|usa|federal|gov|dept|department|authority|land ?bank|\bbank\b|mortgage|hud|fannie|freddie|redevelop|housing|parks|recreation|transport|dot|school|univ|college|church|diocese|treasurer|secretary|llc holdings inc)\b/i

export function buyerCountySupported(county: string, state: string): boolean {
  return Boolean(BUYER_LAYERS[`${normCounty(county)}:${(state || "").toLowerCase().trim()}`])
}

export function buyerStateSupported(state: string): boolean {
  return BUYER_STATES.includes((state || "").toUpperCase().trim())
}

// Narrow a layer's query to a city or ZIP. Returns the extra WHERE clause,
// "" when no narrowing is needed, or null when this layer can't serve the area.
export interface BuyerArea { city?: string; zip?: string }
function areaClause(layer: BuyerLayer, area?: BuyerArea): string | null {
  const zip = (area?.zip ?? "").replace(/[^0-9]/g, "").slice(0, 5)
  const city = (area?.city ?? "").trim()
  if (zip) {
    if (!layer.situsZip) return null
    // LIKE handles both plain ZIPs and ZIP+4 strings.
    return `${layer.situsZip} LIKE '${zip}%'`
  }
  if (city) {
    if (layer.situsCity) return `UPPER(${layer.situsCity}) LIKE '${city.toUpperCase().replace(/'/g, "''")}%'`
    // Single-city files (e.g. Detroit's parcel file) match by name, no filter needed.
    if (layer.fixedCity && layer.fixedCity.toLowerCase().startsWith(city.toLowerCase())) return ""
    return null
  }
  return ""
}

const enc = encodeURIComponent
const RECENT_MS = 548 * 86400000 // ~18 months

const str = (v: unknown): string => (v == null || typeof v === "object" ? "" : String(v).trim())
const num = (v: unknown): number | null => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null }

// Esri dates arrive as epoch-ms numbers; some layers use strings.
function toIsoDate(v: unknown): string | null {
  if (v == null) return null
  const t = typeof v === "number" ? v : Date.parse(String(v))
  if (!Number.isFinite(t) || t <= 0) return null
  try { return new Date(t).toISOString().slice(0, 10) } catch { return null }
}

function entityOf(owner: string): CashBuyer["entity"] {
  if (/\bllc\b/i.test(owner)) return "LLC"
  if (/\btrust\b|\bttee\b|revocable/i.test(owner)) return "Trust"
  if (/\binc\b|\bcorp\b|properties|investment|invest\b|homes\b|holdings|ventures|capital|group\b|realty|partners/i.test(owner)) return "Company"
  return "Individual"
}

function rowToProperty(a: Record<string, unknown>, layer: BuyerLayer): BuyerProperty | null {
  const streetNum = layer.situsNum ? str(a[layer.situsNum]) : ""
  const addr = [streetNum, layer.situsAddr ? str(a[layer.situsAddr]) : ""].filter(Boolean).join(" ").trim()
  if (!addr) return null
  return {
    address: addr,
    city: (layer.situsCity ? str(a[layer.situsCity]) : "") || layer.fixedCity || "",
    zip: (layer.situsZip ? str(a[layer.situsZip]) : "").replace(/[^0-9]/g, "").slice(0, 5),
    value: layer.value ? num(a[layer.value]) : null,
    salePrice: layer.salePrice ? num(a[layer.salePrice]) : null,
    saleDate: layer.saleDate ? toIsoDate(a[layer.saleDate]) : null,
    use: layer.use ? str(a[layer.use]) || null : null,
  }
}

// The full picture for one buyer: their properties in the county (the dossier).
export async function buyerDossier(county: string, state: string, owner: string, cap = 200): Promise<BuyerProperty[]> {
  const layer = BUYER_LAYERS[`${normCounty(county)}:${(state || "").toLowerCase().trim()}`]
  if (!layer || !owner.trim()) return []
  try {
    const outFields = [layer.situsNum, layer.situsAddr, layer.situsCity, layer.situsZip, layer.saleDate, layer.salePrice, layer.value, layer.use].filter(Boolean).join(",")
    const u = `${layer.url}?where=${enc(`${layer.owner}='${owner.replace(/'/g, "''")}'`)}&outFields=${enc(outFields)}&resultRecordCount=${cap}&returnGeometry=false&f=json`
    const res = await fetch(u, { signal: AbortSignal.timeout(12000) })
    if (!res.ok) return []
    const data = (await res.json()) as { features?: Array<{ attributes?: Record<string, unknown> }> }
    const out: BuyerProperty[] = []
    for (const f of data.features ?? []) {
      const p = rowToProperty(f.attributes ?? {}, layer)
      if (p) out.push(p)
    }
    // Most recent purchases first when the county has sale data.
    out.sort((a, b) => (b.saleDate ?? "").localeCompare(a.saleDate ?? ""))
    return out
  } catch {
    return []
  }
}

function summarize(b: CashBuyer, props: BuyerProperty[], layer: BuyerLayer): void {
  b.sample = props.slice(0, 12)
  b.hasSaleData = Boolean(layer.saleDate)

  const zipCounts = new Map<string, number>()
  const useCounts = new Map<string, number>()
  let valueSum = 0, valueN = 0
  const cutoff = Date.now() - RECENT_MS

  for (const p of props) {
    if (p.zip) zipCounts.set(p.zip, (zipCounts.get(p.zip) ?? 0) + 1)
    if (p.use) useCounts.set(p.use, (useCounts.get(p.use) ?? 0) + 1)
    if (p.value != null) { valueSum += p.value; valueN++ }
    if (p.saleDate) {
      const t = Date.parse(p.saleDate)
      if (Number.isFinite(t) && t >= cutoff) b.recentBuys++
      if (!b.lastBuy || p.saleDate > b.lastBuy) b.lastBuy = p.saleDate
    }
  }

  b.topZips = [...zipCounts.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4).map(([z]) => z)
  b.topUse = [...useCounts.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null
  if (valueN) {
    b.avgValue = Math.round(valueSum / valueN)
    // Scale the sampled value to their full holding count for an honest estimate.
    b.portfolioValue = Math.round((valueSum / valueN) * b.count)
  }

  // Score: scale (log of holdings) + activity (recent buys) + reachability.
  let s = Math.min(30, Math.round(Math.log2(Math.max(2, b.count)) * 6))
  s += Math.min(40, b.recentBuys * 10)                    // actively buying = the signal that matters
  if (!b.hasSaleData) s += 10                             // no sale data published — don't punish
  if (b.mailing) s += 10
  if (b.entity === "LLC" || b.entity === "Company") s += 8 // professional operators close
  if (b.absentee) s += 4                                   // remote owners rely on wholesalers
  b.score = Math.max(0, Math.min(100, s))
}

async function findBuyersInLayer(key: string, layer: BuyerLayer, limit: number, area?: BuyerArea): Promise<CashBuyer[]> {
  const extra = areaClause(layer, area)
  if (extra === null) return []   // this layer can't serve the requested city/ZIP
  try {
    // 1) Group by owner — who holds multiple properties in the searched area?
    // A ZIP is a smaller universe, so 2+ already marks an active buyer there.
    const minHold = area?.zip ? 2 : 3
    const where = [`${layer.owner} IS NOT NULL`, extra].filter(Boolean).join(" AND ")
    const stats = enc('[{"statisticType":"count","onStatisticField":"objectid","outStatisticFieldName":"cnt"}]')
    const url = `${layer.url}?where=${enc(where)}&groupByFieldsForStatistics=${layer.owner}&outStatistics=${stats}&having=${enc(`count(objectid)>=${minHold}`)}&orderByFields=${enc("cnt DESC")}&resultRecordCount=800&f=json`
    const res = await fetch(url, { signal: AbortSignal.timeout(16000) })
    if (!res.ok) return []
    const data = (await res.json()) as { features?: Array<{ attributes?: Record<string, unknown> }> }

    const buyers: CashBuyer[] = []
    for (const r of data.features ?? []) {
      const a = r.attributes ?? {}
      // Group-by echoes the field under its own (case-varying) name — find it.
      const ownerKey = Object.keys(a).find((k) => k.toLowerCase() === layer.owner.toLowerCase())
      // Keep the RAW stored value for follow-up equality queries (some counties
      // pad names with ", , ") and a cleaned version for display.
      const ownerRaw = ownerKey ? str(a[ownerKey]) : ""
      const owner = ownerRaw.replace(/(\s*,\s*)+$/, "")
      const count = Number(a.cnt)
      if (!owner || /^(taxpayer|occupant|owner|unknown|current owner)$/i.test(owner)) continue
      // Multi-holdings = investor; big SFR funds (FirstKey/VineBrook-scale) are
      // real buyers too, so the cap only guards against data-error rollups.
      if (!Number.isFinite(count) || count < minHold || count > 2000) continue
      if (INSTITUTIONAL.test(owner)) continue
      buyers.push({
        owner, ownerRaw, county: layer.label, countyKey: key, count, mailing: null, mailingState: null,
        entity: entityOf(owner), absentee: false,
        recentBuys: 0, lastBuy: null, hasSaleData: Boolean(layer.saleDate),
        portfolioValue: null, avgValue: null, topZips: [], topUse: null,
        score: 0, sample: [],
      })
      if (buyers.length >= limit) break
    }

    // 2) Every aspect per buyer: portfolio sample + mailing + activity + values.
    let i = 0
    const worker = async () => {
      while (i < buyers.length) {
        const b = buyers[i++]
        try {
          const outFields = [
            layer.mailAddr, layer.mailCity, layer.mailState, layer.mailZip,
            layer.situsNum, layer.situsAddr, layer.situsCity, layer.situsZip,
            layer.saleDate, layer.salePrice, layer.value, layer.use,
          ].filter(Boolean).join(",")
          const u = `${layer.url}?where=${enc(`${layer.owner}='${b.ownerRaw.replace(/'/g, "''")}'`)}&outFields=${enc(outFields)}&resultRecordCount=60&returnGeometry=false&f=json`
          const rr = await fetch(u, { signal: AbortSignal.timeout(9000) })
          if (!rr.ok) continue
          const dd = (await rr.json()) as { features?: Array<{ attributes?: Record<string, unknown> }> }
          const rows = (dd.features ?? []).map((f) => f.attributes ?? {})
          if (!rows.length) continue

          const first = rows[0]
          const s = (k?: string) => (k ? str(first[k]) : "")
          const mParts = [s(layer.mailAddr), [s(layer.mailCity), s(layer.mailState), s(layer.mailZip)].filter(Boolean).join(", ")].filter(Boolean)
          if (mParts.length) b.mailing = mParts.join(", ")
          b.mailingState = (s(layer.mailState) || "").toUpperCase() || null
          b.absentee = Boolean(b.mailingState && b.mailingState !== layer.stateAbbr)

          const props = rows.map((row) => rowToProperty(row, layer)).filter((p): p is BuyerProperty => p !== null)
          props.sort((x, y) => (y.saleDate ?? "").localeCompare(x.saleDate ?? ""))
          summarize(b, props, layer)
        } catch { /* keep the buyer with whatever we have */ }
      }
    }
    await Promise.race([
      Promise.all(Array.from({ length: 6 }, worker)),
      new Promise<void>((r) => setTimeout(r, 24000)),
    ])

    // Hottest buyers first: actively-buying, reachable, at scale.
    buyers.sort((x, y) => y.score - x.score || y.count - x.count)
    return buyers
  } catch {
    return []
  }
}

// Area-aware search: county, city, or ZIP. With no county, every verified layer
// in the state is queried in parallel and results merge by score.
export async function findCashBuyersArea(
  p: { state: string; county?: string; city?: string; zip?: string },
  limit = 40,
): Promise<CashBuyer[]> {
  const st = (p.state || "").toLowerCase().trim()
  const entries = p.county
    ? Object.entries(BUYER_LAYERS).filter(([k]) => k === `${normCounty(p.county)}:${st}`)
    : Object.entries(BUYER_LAYERS).filter(([, l]) => l.stateAbbr.toLowerCase() === st)
  if (!entries.length) return []
  const area: BuyerArea | undefined = p.city || p.zip ? { city: p.city, zip: p.zip } : undefined
  const results = await Promise.allSettled(entries.map(([k, l]) => findBuyersInLayer(k, l, limit, area)))
  const merged: CashBuyer[] = []
  for (const r of results) if (r.status === "fulfilled") merged.push(...r.value)
  merged.sort((x, y) => y.score - x.score || y.count - x.count)
  return merged.slice(0, limit)
}

// Back-compatible county search (DealAnalysis buyer-match etc. call this).
export async function findCashBuyers(county: string, state: string, limit = 40): Promise<CashBuyer[]> {
  return findCashBuyersArea({ state, county }, limit)
}
