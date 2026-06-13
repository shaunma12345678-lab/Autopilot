// Direct pre-foreclosure data sources — no API key required.
//
// Sources:
//   Zillow        — tiled bounding-box queries (pre-foreclosure filter)
//   Redfin        — tiled bounding-box queries (distressed status)
//   HUD REO       — official HUD home store API (government REO listings)
//   USDA RD       — USDA rural development REO (public API)
//   ArcGIS Hub    — official county open-data REST (NOD, lien, recorder)
//   auction.com   — public foreclosure auction listings
//
// All sources run in parallel. Results are deduplicated by normalized address.
// Accepts maxLeads to scale tile count — more tiles = more results per county.

import type { FreeLead } from "@/lib/free-foreclosure-scraper"
import { geocodeArea, type GeoBox } from "@/lib/geocoding"
import { COUNTY_BOXES, tileBox, tilesForTarget, withConcurrency } from "@/lib/geo-tiles"

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

// ── Zillow — tiled pre-foreclosure ───────────────────────────────────────────

async function fetchZillowTile(tile: GeoBox): Promise<FreeLead[]> {
  const searchQueryState = JSON.stringify({
    pagination:    { currentPage: 1 },
    mapBounds:     { west: tile.west, east: tile.east, south: tile.south, north: tile.north },
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

  try {
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

    const results: Record<string, unknown>[] =
      data?.cat1?.searchResults?.mapResults ??
      data?.cat1?.searchResults?.listResults ??
      []

    return results.flatMap((r) => {
      const info = (r.hdpData as Record<string, unknown>)?.homeInfo as Record<string, unknown> | undefined
      const address = String(info?.streetAddress ?? r.address ?? r.streetAddress ?? "").trim()
      if (!address) return []

      const city  = String(info?.city    ?? r.addressCity    ?? r.city    ?? "")
      const state = String(info?.state   ?? r.addressState   ?? r.state   ?? "")
      const zip   = String(info?.zipcode ?? r.addressZipcode ?? r.zipcode ?? "")
      const price = Number(info?.price   ?? r.price          ?? 0) || null
      const zest  = Number(info?.zestimate ?? r.zestimate    ?? 0) || null
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

async function scrapeZillowTiled(box: GeoBox, maxLeads: number): Promise<FreeLead[]> {
  const { cols, rows } = tilesForTarget(maxLeads)
  const tiles = tileBox(box, cols, rows)
  const batches = await withConcurrency(
    tiles.map(t => () => fetchZillowTile(t)),
    4
  )
  return batches.flat()
}

// ── Redfin — tiled distressed listings ───────────────────────────────────────

async function fetchRedfinTile(tile: GeoBox): Promise<FreeLead[]> {
  const poly = [
    `${tile.west} ${tile.south}`,
    `${tile.east} ${tile.south}`,
    `${tile.east} ${tile.north}`,
    `${tile.west} ${tile.north}`,
    `${tile.west} ${tile.south}`,
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
    status:      "9",
    uipt:        "1,2,3,4,5,6,7,8",
    v:           "8",
    iss:         "false",
  })

  try {
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

    const text    = await res.text()
    const jsonStr = text.replace(/^[^{[]*/, "")
    if (!jsonStr) return []
    const data = JSON.parse(jsonStr)

    const homes: Record<string, unknown>[] =
      data?.payload?.homes ?? data?.homes ?? []

    return homes.flatMap((h) => {
      const addr = h.streetLine  as Record<string, unknown> | undefined
      const loc  = h.cityStateZip as Record<string, unknown> | undefined
      const info = h.address     as Record<string, unknown> | undefined

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

async function scrapeRedfinTiled(box: GeoBox, maxLeads: number): Promise<FreeLead[]> {
  const { cols, rows } = tilesForTarget(maxLeads)
  const tiles = tileBox(box, cols, rows)
  const batches = await withConcurrency(
    tiles.map(t => () => fetchRedfinTile(t)),
    4
  )
  return batches.flat()
}

// ── HUD REO — government foreclosure property listings ───────────────────────

async function scrapeHudReo(params: {
  state?: string
  county?: string
}): Promise<FreeLead[]> {
  try {
    const state  = params.state ?? "CA"
    const qs = new URLSearchParams({
      states:    state,
      county:    params.county ?? "",
      pageSize:  "100",
      pageNum:   "1",
    })

    const res = await fetch(
      `https://www.hudhomestore.gov/Listing/PropertySearchResult.aspx?${qs}`,
      {
        headers: {
          "User-Agent":      UA,
          "Accept":          "application/json, text/html, */*",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: AbortSignal.timeout(12000),
      }
    )
    if (!res.ok) return []

    // HUD site returns HTML — try to parse property data from JSON embedded in page
    const html = await res.text()

    // HUD embeds property data as JSON in a script tag
    const jsonMatches = [
      html.match(/window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});/),
      html.match(/var\s+propertiesData\s*=\s*(\[[\s\S]*?\]);/),
      html.match(/"properties"\s*:\s*(\[[\s\S]*?\])\s*[,}]/),
    ]

    for (const m of jsonMatches) {
      if (!m) continue
      try {
        const raw = JSON.parse(m[1])
        const listings: Record<string, unknown>[] =
          Array.isArray(raw) ? raw :
          (raw?.properties ?? raw?.listings ?? raw?.data ?? [])

        if (listings.length === 0) continue

        return listings.slice(0, 100).flatMap((l) => {
          const address = String(
            l.propertyAddress ?? l.address ?? l.streetAddress ?? l.street ?? ""
          ).trim()
          if (!address) return []

          return [{
            address,
            city:             String(l.propertyCity ?? l.city ?? ""),
            state:            String(l.propertyState ?? l.state ?? state),
            zip:              String(l.propertyZip ?? l.zip ?? l.zipCode ?? ""),
            ownerName:        "HUD / FHA",
            foreclosureStage: "PRE_FORECLOSURE" as const,
            recordingDate:    String(l.listingDate ?? l.caseApprovalDate ?? ""),
            defaultAmount:    Number(l.listPrice ?? l.askingPrice ?? 0) || null,
            lender:           "HUD / FHA",
            auctionDate:      null,
            estimatedValue:   Number(l.listPrice ?? 0) || null,
            sourceUrl:        `https://www.hudhomestore.gov/Listing/PropertyDetails.aspx?caseNumber=${l.caseNumber ?? ""}`,
            rawSignals:       ["HUD REO — FHA-insured foreclosure"],
          } as FreeLead]
        })
      } catch {
        continue
      }
    }

    // Fallback: parse HTML table rows if JSON extraction failed
    const rowMatches = html.matchAll(
      /PropertyDetails\.aspx[^"]*caseNumber=([^"&]+)[^>]*>[\s\S]*?(\d+\s+[A-Z][^<]{5,60})</gi
    )
    const htmlLeads: FreeLead[] = []
    for (const row of rowMatches) {
      const address = row[2]?.trim()
      if (address) {
        htmlLeads.push({
          address,
          city: "", state: state, zip: "",
          ownerName:        "HUD / FHA",
          foreclosureStage: "PRE_FORECLOSURE",
          recordingDate:    "",
          defaultAmount:    null,
          lender:           "HUD / FHA",
          auctionDate:      null,
          estimatedValue:   null,
          sourceUrl:        `https://www.hudhomestore.gov/`,
          rawSignals:       ["HUD REO — FHA-insured foreclosure"],
        })
      }
    }
    return htmlLeads.slice(0, 60)
  } catch {
    return []
  }
}

// ── USDA Rural Development REO ────────────────────────────────────────────────

async function scrapeUsda(state: string): Promise<FreeLead[]> {
  try {
    const qs = new URLSearchParams({
      stateCode: state,
      pageSize:  "100",
      pageIndex: "1",
    })
    const res = await fetch(
      `https://rdapps.sc.egov.usda.gov/RDDirectSales/api/properties?${qs}`,
      {
        headers: { "User-Agent": UA, "Accept": "application/json" },
        signal:  AbortSignal.timeout(10000),
      }
    )
    if (!res.ok) return []
    const data = await res.json()
    const items: Record<string, unknown>[] = data?.data ?? data?.properties ?? data ?? []

    return items.slice(0, 80).flatMap((p) => {
      const address = String(
        p.propertyAddress ?? p.address ?? p.streetAddress ?? ""
      ).trim()
      if (!address) return []

      return [{
        address,
        city:             String(p.city ?? ""),
        state:            String(p.state ?? state),
        zip:              String(p.zip ?? p.zipCode ?? ""),
        ownerName:        "USDA Rural Development",
        foreclosureStage: "PRE_FORECLOSURE" as const,
        recordingDate:    String(p.listDate ?? p.availableDate ?? ""),
        defaultAmount:    Number(p.listPrice ?? p.askingPrice ?? 0) || null,
        lender:           "USDA RD",
        auctionDate:      null,
        estimatedValue:   Number(p.listPrice ?? 0) || null,
        sourceUrl:        `https://rdapps.sc.egov.usda.gov/RDDirectSales/`,
        rawSignals:       ["USDA Rural Development REO property"],
      } as FreeLead]
    })
  } catch {
    return []
  }
}

// ── ArcGIS Hub — official county open-data ────────────────────────────────────

async function queryArcGISHub(box: GeoBox, areaLabel: string): Promise<FreeLead[]> {
  try {
    const bboxStr   = `${box.west},${box.south},${box.east},${box.north}`
    const searchUrl = `https://hub.arcgis.com/api/v3/datasets?q=${encodeURIComponent(
      `notice of default foreclosure lien ${areaLabel}`
    )}&fields[datasets]=id,name,url,extent,slug&page[size]=8&filter[bbox]=${bboxStr}`

    const searchRes = await fetch(searchUrl, {
      headers: { Accept: "application/json" },
      signal:  AbortSignal.timeout(8000),
    })
    if (!searchRes.ok) return []
    const searchData = await searchRes.json()

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
      .slice(0, 5)

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
            resultRecordCount: "200",
            geometry:          bboxStr,
            geometryType:      "esriGeometryEnvelope",
            spatialRel:        "esriSpatialRelIntersects",
            f:                 "json",
          })

          const qRes = await fetch(`${queryUrl}?${qParams}`, {
            signal: AbortSignal.timeout(12000),
          })
          if (!qRes.ok) return

          const qData = await qRes.json()
          const features: Record<string, unknown>[] = qData.features ?? []

          for (const f of features) {
            const a = (f.attributes ?? {}) as Record<string, unknown>

            const address = String(
              a.SITE_ADDR ?? a.PropertyAddress ?? a.PROPERTY_ADDRESS ??
              a.situs_address ?? a.StreetAddress ?? a.STREET_ADDR ??
              a.ADDRESS ?? a.address ?? ""
            ).trim()
            if (!address) continue

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
        } catch { /* skip this dataset */ }
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
    const qs: Record<string, string> = { pageNum: "1", pageSize: "100" }

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

    return listings.flatMap((l) => {
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
        lender: String(l.lender ?? l.beneficiary ?? l.trustee ?? l.sellerName ?? "") || null,
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

// ── Bid4Assets — public county tax deed / foreclosure auctions ───────────────

async function scrapeBid4Assets(state: string): Promise<FreeLead[]> {
  try {
    const res = await fetch(
      `https://www.bid4assets.com/search#q/asset_types=real_estate&state=${state}&page_size=100`,
      {
        headers: {
          "User-Agent":      UA,
          "Accept":          "application/json, text/html, */*",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: AbortSignal.timeout(12000),
      }
    )
    if (!res.ok) return []

    const text = await res.text()

    // Bid4Assets embeds listings as JSON in a script tag
    const match = text.match(/window\.__reactAppState\s*=\s*({[\s\S]*?});/) ??
                  text.match(/"assets"\s*:\s*(\[[\s\S]*?\])\s*[,}]/)
    if (!match) return []

    let listings: Record<string, unknown>[] = []
    try {
      const parsed = JSON.parse(match[1])
      listings = Array.isArray(parsed)
        ? parsed
        : (parsed?.assets ?? parsed?.listings ?? parsed?.results ?? [])
    } catch {
      return []
    }

    return listings.slice(0, 80).flatMap((l) => {
      const address = String(
        l.address ?? l.propertyAddress ?? l.streetAddress ?? l.location ?? ""
      ).trim()
      if (!address) return []

      return [{
        address,
        city:             String(l.city    ?? ""),
        state:            String(l.state   ?? state),
        zip:              String(l.zip     ?? l.zipCode ?? ""),
        ownerName:        String(l.seller  ?? l.owner   ?? ""),
        foreclosureStage: "AUCTION" as const,
        recordingDate:    "",
        defaultAmount:    Number(l.openingBid ?? l.currentBid ?? 0) || null,
        lender:           String(l.agency ?? l.authority ?? "") || null,
        auctionDate:      String(l.auctionDate ?? l.endDate ?? "") || null,
        estimatedValue:   Number(l.assessedValue ?? l.marketValue ?? 0) || null,
        sourceUrl:        l.url
          ? `https://www.bid4assets.com${l.url}`
          : "https://www.bid4assets.com/",
        rawSignals: ["Bid4Assets tax deed / county auction listing"],
      } as FreeLead]
    })
  } catch {
    return []
  }
}

// ── Public interface ──────────────────────────────────────────────────────────

export interface DirectSourceResult {
  leads:        FreeLead[]
  sourceCounts: Record<string, number>
  geocoded:     boolean
}

export async function searchDirectSources(params: {
  searchType: string
  zipCode?:   string
  city?:      string
  state?:     string
  county?:    string
  maxLeads?:  number
  countyId?:  string   // e.g. "san-diego" — uses hardcoded box, faster than geocoding
}): Promise<DirectSourceResult> {
  const maxLeads = params.maxLeads ?? 100
  const state    = params.state ?? "CA"

  const areaLabel =
    params.searchType === "zip"    ? `ZIP ${params.zipCode}` :
    params.searchType === "city"   ? `${params.city} ${state}` :
    `${params.county} County ${state}`

  // Resolve bounding box — prefer hardcoded county box (instant), fall back to geocoding
  let box: GeoBox | null = null
  if (params.countyId && COUNTY_BOXES[params.countyId]) {
    box = COUNTY_BOXES[params.countyId]
  } else {
    box = await geocodeArea(params)
  }

  // Run all sources in parallel — failures isolated per source
  const [zillowLeads, redfinLeads, arcgisLeads, auctionLeads, hudLeads, usdaLeads, bid4Leads] =
    await Promise.all([
      box ? scrapeZillowTiled(box, maxLeads) : Promise.resolve([]),
      box ? scrapeRedfinTiled(box, maxLeads) : Promise.resolve([]),
      box ? queryArcGISHub(box, areaLabel)   : Promise.resolve([]),
      scrapeAuctionCom(params),
      scrapeHudReo({ state, county: params.county }),
      scrapeUsda(state),
      scrapeBid4Assets(state),
    ])

  const sourceCounts: Record<string, number> = {}
  if (zillowLeads.length)  sourceCounts["Zillow"]           = zillowLeads.length
  if (redfinLeads.length)  sourceCounts["Redfin"]           = redfinLeads.length
  if (arcgisLeads.length)  sourceCounts["County records"]   = arcgisLeads.length
  if (auctionLeads.length) sourceCounts["auction.com"]      = auctionLeads.length
  if (hudLeads.length)     sourceCounts["HUD REO"]          = hudLeads.length
  if (usdaLeads.length)    sourceCounts["USDA RD"]          = usdaLeads.length
  if (bid4Leads.length)    sourceCounts["Bid4Assets"]       = bid4Leads.length

  // Merge and deduplicate by normalized address+city
  const seen = new Set<string>()
  const leads = [
    ...zillowLeads,
    ...redfinLeads,
    ...arcgisLeads,
    ...auctionLeads,
    ...hudLeads,
    ...usdaLeads,
    ...bid4Leads,
  ].filter((l) => {
    if (!l.address?.trim()) return false
    const key = (l.address + l.city).toLowerCase().replace(/[\s,#.-]/g, "")
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  return { leads, sourceCounts, geocoded: !!box }
}
