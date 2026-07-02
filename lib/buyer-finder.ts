// Cash Buyer Finder — our own keyless way to find the actual buyers for your
// deals. We query a county's public assessor data grouped by owner: whoever
// owns MANY properties in the area is an active investor/landlord — i.e. a cash
// buyer. We filter out government/institutional holders and keep private
// investors, then pull their mailing address so you can reach them. Never throws.

import { normCounty } from "@/lib/area-scope"

export interface CashBuyer {
  owner:   string
  count:   number   // properties they own in the county
  mailing: string | null
}

interface BuyerLayer {
  url: string; owner: string
  mailAddr: string; mailCity: string; mailState: string; mailZip: string
  label: string
}

// Assessor layers that expose owner (taxpayer) name — same sources as the
// parcel engine. Add counties as their owner fields are verified.
const BUYER_LAYERS: Record<string, BuyerLayer> = {
  "wayne:mi": {
    url: "https://services2.arcgis.com/qvkbeam7Wirps6zC/arcgis/rest/services/parcel_file_current/FeatureServer/0/query",
    owner: "taxpayer_1", mailAddr: "taxpayer_address", mailCity: "taxpayer_city", mailState: "taxpayer_state", mailZip: "taxpayer_zip_code",
    label: "Wayne County, MI",
  },
}

// Names that are NOT private cash buyers (government / institutional / lenders).
const INSTITUTIONAL = /\b(city|county|state|u ?s|usa|federal|gov|dept|department|authority|land ?bank|\bbank\b|mortgage|hud|fannie|freddie|redevelop|housing|parks|recreation|transport|dot|school|univ|college|church|diocese|treasurer|secretary|llc holdings inc)\b/i

export function buyerCountySupported(county: string, state: string): boolean {
  return Boolean(BUYER_LAYERS[`${normCounty(county)}:${(state || "").toLowerCase().trim()}`])
}

const enc = encodeURIComponent

export async function findCashBuyers(county: string, state: string, limit = 40): Promise<CashBuyer[]> {
  const layer = BUYER_LAYERS[`${normCounty(county)}:${(state || "").toLowerCase().trim()}`]
  if (!layer) return []
  try {
    const stats = enc('[{"statisticType":"count","onStatisticField":"objectid","outStatisticFieldName":"cnt"}]')
    const url = `${layer.url}?where=${enc(`${layer.owner} IS NOT NULL`)}&groupByFieldsForStatistics=${layer.owner}&outStatistics=${stats}&having=${enc("count(objectid)>=3")}&orderByFields=${enc("cnt DESC")}&resultRecordCount=800&f=json`
    const res = await fetch(url, { signal: AbortSignal.timeout(14000) })
    if (!res.ok) return []
    const data = (await res.json()) as { features?: Array<{ attributes?: Record<string, unknown> }> }
    const rows = data.features ?? []

    const buyers: CashBuyer[] = []
    for (const r of rows) {
      const a = r.attributes ?? {}
      const owner = typeof a[layer.owner] === "string" ? (a[layer.owner] as string).trim() : ""
      const count = Number(a.cnt)
      if (!owner || owner.toUpperCase() === "TAXPAYER") continue
      if (!Number.isFinite(count) || count < 3 || count > 300) continue  // private investors, not mega-institutions
      if (INSTITUTIONAL.test(owner)) continue
      buyers.push({ owner, count, mailing: null })
      if (buyers.length >= limit) break
    }

    // Pull each buyer's mailing address (bounded concurrency) so you can reach them.
    let i = 0
    const worker = async () => {
      while (i < buyers.length) {
        const b = buyers[i++]
        try {
          const u = `${layer.url}?where=${enc(`${layer.owner}='${b.owner.replace(/'/g, "''")}'`)}&outFields=${[layer.mailAddr, layer.mailCity, layer.mailState, layer.mailZip].join(",")}&resultRecordCount=1&returnGeometry=false&f=json`
          const rr = await fetch(u, { signal: AbortSignal.timeout(8000) })
          if (!rr.ok) continue
          const dd = (await rr.json()) as { features?: Array<{ attributes?: Record<string, unknown> }> }
          const at = dd.features?.[0]?.attributes ?? {}
          const s = (k: string) => (typeof at[k] === "string" ? (at[k] as string).trim() : "")
          const parts = [s(layer.mailAddr), [s(layer.mailCity), s(layer.mailState), s(layer.mailZip)].filter(Boolean).join(", ")].filter(Boolean)
          if (parts.length) b.mailing = parts.join(", ")
        } catch { /* skip */ }
      }
    }
    await Promise.race([
      Promise.all(Array.from({ length: 6 }, worker)),
      new Promise<void>((r) => setTimeout(r, 15000)),
    ])
    return buyers
  } catch {
    return []
  }
}
