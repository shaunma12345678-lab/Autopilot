// Direct pre-foreclosure data scrapers — no API key required for any source.
//
// Sources:
//   Zillow        — internal search API with isPreForeclosure filter
//   Redfin        — internal GIS API, pre-foreclosure/distressed status
//   ArcGIS Hub    — official county open-data REST APIs (NOD, lien, recorder data)
//   auction.com   — public foreclosure auction listings
//
// All sources run in parallel. Results are deduplicated by normalized address.

import type { FreeLead } from "@/lib/free-foreclosure-scraper"
import { geocodeArea, type GeoBox } from "@/lib/geocoding"

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

// ── Zillow pre-foreclosure ────────────────────────────────────────────────────

async function scrapeZillow(box: GeoBox): Promise<FreeLead[]> {
  try {
    const searchQueryState = JSON.stringify({
      pagination:    { currentPage: 1 },
      mapBounds:     { west: box.west, east: box.east, south: box.south, north: box.north },
      filterState: {
        isPreForeclosure:     { value: true  },
        isForSaleByAgent:     { value: false },
        isForSaleByOwner:     { value: false },
        isNewConstruction:    { value: false },
        isComingSoon:         { value: false },
        isAuction:            { value: false },
        isForSaleForeclosure: { value: false },
        sortSelection:        { value: "globalrelevanceex" },
      },
      isMapVisible:  true,
      isListVisible: true,
    })

    const params = new URLSearchParams({
      searchQueryState,
      wants:          JSON.stringify({ cat1: ["mapResults"], cat2: ["total"] }),
      requestId:      "3",
      isDebugRequest: "false",
    })

    const res = await fetch(
      `https://www.zillow.com/async-create-search-page-state?${params}`,
      {
        headers: {
          "User-Agent":      UA,
          "Accept":          "*/*",
          "Accept-Language": "en-US,en;q=0.9",
          "Referer":         "https://www.zillow.com/homes/pre-foreclosure/",
          "DNT":             "1",
        },
        signal: AbortSignal.timeout(15000),
      }
    )
    if (!res.ok) return []
    const data = await res.json()

    // Zillow wraps results in cat1.searchResults — try both mapResults and listResults
    const results: Record<string, unknown>[] =
      data?.cat1?.searchResults?.mapResults ??
      data?.cat1?.searchResults?.listResults ??
      []

    return results.slice(0, 150).flatMap((r) => {
      // Field names differ between API versions — try all known patterns
      const info = (r.hdpData as Record<string, unknown>)?.homeInfo as Record<string, unknown> | undefined
      const address = String(info?.streetAddress ?? r.address ?? r.streetAddress ?? "").trim()
      if (!address) return []

      const city  = String(info?.city     ?? r.addressCity     ?? r.city     ?? "")
      const state = String(info?.state    ?? r.addressState    ?? r.state    ?? "")
      const zip   = String(info?.zipcode  ?? r.addressZipcode  ?? r.zipcode  ?? "")
      const price = Number(info?.price    ?? r.price           ?? 0)  || null
      const zest  = Number(info?.zestimate ?? r.zestimate      ?? 0)  || null
      const zpid  = String(r.zpid ?? "")

      const listingType = String(
        info?.contingentListingType ?? r.listingType ?? "PRE_FORECLOSURE"
      ).toUpperCase()

      return [{
        address,
        city,
        state,
        zip,
        ownerName:        "",
        foreclosureStage: listingType.includes("AUCTION") ? "AUCTION" : "PRE_FORECLOSURE",
        recordingDate:    "",
        defaultAmount:    price,
        lender:           null,
        auctionDate:      null,
        estimatedValue:   zest ?? price,
        sourceUrl:        zpid
          ? `https://www.zillow.com/homedetails/${zpid}_zpid/`
          : `https://www.zillow.com/homes/pre-foreclosure/`,
        rawSignals: ["Zillow pre-foreclosure listing"],
      } as FreeLead]
    })
  } catch {
    return []
  }
}

// ── Redfin pre-foreclosure / distressed ──────────────────────────────────────

async function scrapeRedfin(box: GeoBox): Promise<FreeLead[]> {
  try {
    // Redfin polygon: "lng lat,lng lat,..." (5 points, closed ring, counter-clockwise)
    const poly = [
      `${box.west} ${box.south}`,
      `${box.east} ${box.south}`,
      `${box.east} ${box.north}`,
      `${box.west} ${box.north}`,
      `${box.west} ${box.south}`,
    ].join(",")

    const params = new URLSearchParams({
      al:          "1",
      market:      "national",
      num_homes:   "200",
      ord:         "redfin-recommended-asc",
      page_number: "1",
      poly,
      sf:          "1,2,3,4,5,6,7",
      start:       "0",
      status:      "9",        // pre-foreclosure / distressed
      uipt:        "1,2,3,4,5,6,7,8",
      v:           "8",
      iss:         "false",
    })

    const res = await fetch(
      `https://www.redfin.com/stingray/api/gis?${params}`,
      {
        headers: {
          "User-Agent":      UA,
          "Accept":          "*/*",
          "Accept-Language": "en-US,en;q=0.9",
          "Referer":         "https://www.redfin.com/",
        },
        signal: AbortSignal.timeout(12000),
      }
    )
    if (!res.ok) return []

    // Redfin prefixes JSON with "{}&&\n" to prevent eval-based CSRF attacks
    const text   = await res.text()
    const jsonStr = text.replace(/^[^{[]*/, "")
    if (!jsonStr) return []
    const data = JSON.parse(jsonStr)

    const homes: Record<string, unknown>[] =
      data?.payload?.homes ?? data?.homes ?? []

    return homes.slice(0, 150).flatMap((h) => {
      const addr  = h.streetLine  as Record<string, unknown> | undefined
      const loc   = h.cityStateZip as Record<string, unknown> | undefined
      const info  = h.address     as Record<string, unknown> | undefined

      const address = String(addr?.value ?? info?.streetAddress ?? "").trim()
      if (!address) return []

      const cityStateZip = String(loc?.value ?? "")
      const cityPart  = cityStateZip.split(",")?.[0]?.trim() ?? String(info?.city  ?? "")
      const statePart = String(info?.state ?? "")
      const zipPart   = String(info?.zip   ?? "")
      const price     = Number((h.price as Record<string, unknown>)?.value ?? 0) || null
      const url       = String(h.url ?? "")

      return [{
        address,
        city:             cityPart,
        state:            statePart,
        zip:              zipPart,
        ownerName:        "",
        foreclosureStage: "PRE_FORECLOSURE",
        recordingDate:    "",
        defaultAmount:    null,
        lender:           null,
        auctionDate:      null,
        estimatedValue:   price,
        sourceUrl:        url ? `https://www.redfin.com${url}` : "https://www.redfin.com/",
        rawSignals:       ["Redfin pre-foreclosure/distressed listing"],
      } as FreeLead]
    })
  } catch {
    return []
  }
}

// ── ArcGIS Hub — official county open-data REST APIs ─────────────────────────

async function queryArcGISHub(box: GeoBox, areaLabel: string): Promise<FreeLead[]> {
  try {
    const bboxStr    = `${box.west},${box.south},${box.east},${box.north}`
    const searchUrl  = `https://hub.arcgis.com/api/v3/datasets?q=${encodeURIComponent(
      `notice of default foreclosure ${areaLabel}`
    )}&fields[datasets]=id,name,url,extent,slug&page[size]=6&filter[bbox]=${bboxStr}`

    const searchRes = await fetch(searchUrl, {
      headers: { Accept: "application/json" },
      signal:  AbortSignal.timeout(8000),
    })
    if (!searchRes.ok) return []
    const searchData = await searchRes.json()

    // Filter to datasets whose name suggests foreclosure/NOD/lien records
    const serviceUrls: string[] = (searchData.data ?? [])
      .filter((d: Record<string, unknown>) => {
        const name = String(
          (d.attributes as Record<string, unknown>)?.name ?? ""
        ).toLowerCase()
        return (
          name.includes("foreclosure") || name.includes("default") ||
          name.includes(" nod") || name.includes("lien") ||
          name.includes("trustee") || name.includes("recorder")
        )
      })
      .map((d: Record<string, unknown>) =>
        String((d.attributes as Record<string, unknown>)?.url ?? "")
      )
      .filter((u: string) => u.includes("FeatureServer") || u.includes("MapServer"))
      .slice(0, 4)

    if (serviceUrls.length === 0) return []

    const allLeads: FreeLead[] = []

    await Promise.allSettled(
      serviceUrls.map(async (serviceUrl) => {
        try {
          const base     = serviceUrl.replace(/\/$/, "")
          const queryUrl = /\/\d+$/.test(base) ? `${base}/query` : `${base}/0/query`

          const qParams = new URLSearchParams({
            where:             "1=1",
            outFields:         "*",
            resultRecordCount: "100",
            geometry:          bboxStr,
            geometryType:      "esriGeometryEnvelope",
            spatialRel:        "esriSpatialRelIntersects",
            f:                 "json",
          })

          const qRes = await fetch(`${queryUrl}?${qParams}`, {
            signal: AbortSignal.timeout(10000),
          })
          if (!qRes.ok) return

          const qData = await qRes.json()
          const features: Record<string, unknown>[] = qData.features ?? []

          for (const f of features.slice(0, 60)) {
            const a = (f.attributes ?? {}) as Record<string, unknown>

            // Address field name varies by county — try known patterns
            const address = String(
              a.SITE_ADDR ?? a.PropertyAddress ?? a.PROPERTY_ADDRESS ??
              a.situs_address ?? a.StreetAddress ?? a.STREET_ADDR ??
              a.ADDRESS ?? a.address ?? ""
            ).trim()
            if (!address) continue

            // Recording / filing date
            const rawDate = a.RecordingDate ?? a.RECORDING_DATE ?? a.FilingDate ??
              a.FILING_DATE ?? a.DOC_DATE ?? ""
            let recordingDate = ""
            if (rawDate) {
              try {
                recordingDate = new Date(
                  typeof rawDate === "number" ? rawDate : String(rawDate)
                ).toISOString().slice(0, 10)
              } catch { /* skip */ }
            }

            allLeads.push({
              address,
              city:  String(a.CITY ?? a.PropertyCity ?? a.SITUS_CITY ?? a.city ?? ""),
              state: String(a.STATE ?? a.PropertyState ?? a.state ?? ""),
              zip:   String(a.ZIP ?? a.PropertyZip ?? a.ZIP_CODE ?? a.zip ?? ""),
              ownerName: String(
                a.OWNER_NAME ?? a.OwnerName ?? a.GRANTEE ?? a.owner ?? a.BORROWER ?? ""
              ),
              foreclosureStage: "NOTICE_OF_DEFAULT",
              recordingDate,
              defaultAmount: Number(
                a.AMOUNT ?? a.DefaultAmount ?? a.LOAN_AMOUNT ?? a.UNPAID_BAL ?? 0
              ) || null,
              lender: String(
                a.BENEFICIARY ?? a.Lender ?? a.TRUSTEE ?? a.LENDER ?? a.lender ?? ""
              ) || null,
              auctionDate:    null,
              estimatedValue: null,
              sourceUrl:      serviceUrl,
              rawSignals:     ["Notice of Default — official county records (ArcGIS Hub)"],
            })
          }
        } catch { /* skip this dataset, try others */ }
      })
    )

    return allLeads
  } catch {
    return []
  }
}

// ── auction.com — public foreclosure auction listings ─────────────────────────

async function scrapeAuctionCom(params: {
  searchType: string
  zipCode?:   string
  city?:      string
  state?:     string
  county?:    string
}): Promise<FreeLead[]> {
  try {
    const qs: Record<string, string> = { pageNum: "1", pageSize: "50" }

    if (params.searchType === "zip" && params.zipCode) {
      qs.zip    = params.zipCode
      qs.radius = "25"
    } else if (params.searchType === "city" && params.city && params.state) {
      qs.city  = params.city
      qs.state = params.state
    } else if (params.searchType === "county" && params.county && params.state) {
      qs.county = params.county
      qs.state  = params.state
    }

    const res = await fetch(
      `https://www.auction.com/search/results.json?${new URLSearchParams(qs)}`,
      {
        headers: {
          "User-Agent":      UA,
          "Accept":          "application/json, text/javascript, */*",
          "Accept-Language": "en-US,en;q=0.9",
          "Referer":         "https://www.auction.com/",
        },
        signal: AbortSignal.timeout(12000),
      }
    )
    if (!res.ok) return []

    const data = await res.json()
    const listings: Record<string, unknown>[] =
      data?.results ?? data?.properties ?? data?.listings ?? data?.assets ?? []

    return listings.slice(0, 60).flatMap((l) => {
      const address = String(
        l.address ?? l.streetAddress ?? l.propertyAddress ?? l.streetAddr ?? ""
      ).trim()
      if (!address) return []

      const rawDate = l.auctionDate ?? l.saleDate ?? l.eventDate ?? l.scheduledDate ?? null
      let auctionDate: string | null = null
      if (rawDate) {
        try { auctionDate = new Date(String(rawDate)).toISOString().slice(0, 10) } catch { /* skip */ }
      }

      return [{
        address,
        city:   String(l.city   ?? ""),
        state:  String(l.state  ?? ""),
        zip:    String(l.zip ?? l.zipCode ?? l.postalCode ?? ""),
        ownerName: String(l.ownerName ?? l.borrowerName ?? l.trustorName ?? ""),
        foreclosureStage: "AUCTION",
        recordingDate:   "",
        defaultAmount:   Number(l.openingBid ?? l.startingBid ?? l.loanBalance ?? 0) || null,
        lender: String(
          l.lender ?? l.beneficiary ?? l.trustee ?? l.sellerName ?? ""
        ) || null,
        auctionDate,
        estimatedValue: Number(
          l.estimatedValue ?? l.marketValue ?? l.appraisedValue ?? l.bpoValue ?? 0
        ) || null,
        sourceUrl: String(l.url ?? l.propertyUrl ?? "")
          ? `https://www.auction.com${l.url ?? l.propertyUrl}`
          : "https://www.auction.com/",
        rawSignals: [
          `Foreclosure auction listing on auction.com${auctionDate ? ` — sale date ${auctionDate}` : ""}`,
        ],
      } as FreeLead]
    })
  } catch {
    return []
  }
}

// ── Public interface ──────────────────────────────────────────────────────────

export interface DirectSourceResult {
  leads:         FreeLead[]
  sourceCounts:  Record<string, number>
  geocoded:      boolean
}

export async function searchDirectSources(params: {
  searchType: string
  zipCode?:   string
  city?:      string
  state?:     string
  county?:    string
}): Promise<DirectSourceResult> {
  const areaLabel =
    params.searchType === "zip"    ? `ZIP ${params.zipCode}` :
    params.searchType === "city"   ? `${params.city} ${params.state}` :
    `${params.county} County ${params.state}`

  // Geocode the search area to a bounding box for map-based APIs
  const box = await geocodeArea(params)

  // All sources run in parallel — failures are isolated per source
  const [zillowLeads, redfinLeads, arcgisLeads, auctionLeads] =
    await Promise.all([
      box ? scrapeZillow(box)               : Promise.resolve([]),
      box ? scrapeRedfin(box)               : Promise.resolve([]),
      box ? queryArcGISHub(box, areaLabel)  : Promise.resolve([]),
      scrapeAuctionCom(params),
    ])

  const sourceCounts: Record<string, number> = {}
  if (zillowLeads.length)  sourceCounts["Zillow"]        = zillowLeads.length
  if (redfinLeads.length)  sourceCounts["Redfin"]        = redfinLeads.length
  if (arcgisLeads.length)  sourceCounts["County records"] = arcgisLeads.length
  if (auctionLeads.length) sourceCounts["auction.com"]   = auctionLeads.length

  // Merge and deduplicate across all sources by normalized address+city
  const seen = new Set<string>()
  const leads = [...zillowLeads, ...redfinLeads, ...arcgisLeads, ...auctionLeads]
    .filter((l) => {
      if (!l.address?.trim()) return false
      const key = (l.address + l.city).toLowerCase().replace(/[\s,#.-]/g, "")
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

  return { leads, sourceCounts, geocoded: !!box }
}
