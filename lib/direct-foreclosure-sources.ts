// Direct pre-foreclosure data sources — no paid API key required.
//
// Sources (all run in parallel):
//   Zillow        — tiled bounding-box map search (pre-foreclosure filter)
//   Redfin        — tiled GIS search (distressed/foreclosure status)
//   HomePath      — Fannie Mae official REO listings (government JSON feed)
//   HomeSteps     — Freddie Mac official REO listings (government JSON feed)
//   HUD REO       — HUD Home Store API (government REO)
//   USDA RD       — USDA Rural Development REO (public API)
//   auction.com   — public foreclosure auction HTML search
//   Bid4Assets    — county tax deed / government auction listings
//   Foreclosure.com — pre-foreclosure listing HTML search
//   LegalNotices  — CA legal notice publications (publicnoticeads.com + legalnewsonline.com)
//   ArcGIS Hub    — official county open-data recorder REST API

import type { FreeLead } from "@/lib/free-foreclosure-scraper"
import { geocodeArea, type GeoBox } from "@/lib/geocoding"
import { COUNTY_BOXES, tileBox, tilesForTarget, withConcurrency } from "@/lib/geo-tiles"
import { fetchOpenDataLeads } from "@/lib/open-data-sources"
import { fetchCountyRecords } from "@/lib/county-data"

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
    wants:          JSON.stringify({ cat1: ["mapResults", "listResults"], cat2: ["total"] }),
    requestId:      "3",
    isDebugRequest: "false",
  })

  try {
    const res = await fetch(
      `https://www.zillow.com/async-create-search-page-state?${params}`,
      {
        headers: {
          "User-Agent":      UA,
          "Accept":          "application/json, */*",
          "Accept-Language": "en-US,en;q=0.9",
          "Referer":         "https://www.zillow.com/homes/pre-foreclosure/",
          "DNT":             "1",
          "Sec-Fetch-Site":  "same-origin",
          "Sec-Fetch-Mode":  "cors",
        },
        signal: AbortSignal.timeout(7000),
      }
    )
    if (!res.ok) return []
    const data = await res.json()

    const results: Record<string, unknown>[] =
      data?.cat1?.searchResults?.mapResults ??
      data?.cat1?.searchResults?.listResults ??
      data?.searchResults?.mapResults ??
      data?.mapResults ??
      []

    return results.flatMap((r) => {
      const info    = (r.hdpData as Record<string, unknown>)?.homeInfo as Record<string, unknown> | undefined
      const address = String(
        info?.streetAddress ?? r.streetAddress ?? r.address ?? r.addressStreet ?? ""
      ).trim()
      if (!address) return []

      const city  = String(info?.city    ?? r.addressCity    ?? r.city    ?? "")
      const state = String(info?.state   ?? r.addressState   ?? r.state   ?? "CA")
      const zip   = String(info?.zipcode ?? r.addressZipcode ?? r.zipcode ?? r.zip ?? "")
      const price = Number(info?.price   ?? r.price          ?? r.listPrice ?? 0) || null
      const zest  = Number(info?.zestimate ?? r.zestimate    ?? 0) || null
      const zpid  = String(r.zpid ?? "")

      const posNum = (v: unknown): number | null => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null }
      const beds      = posNum(info?.bedrooms  ?? r.beds)
      const baths     = posNum(info?.bathrooms ?? r.baths)
      const sqft      = posNum(info?.livingArea ?? info?.livingAreaValue ?? r.area)
      const yearBuilt = posNum(info?.yearBuilt)
      const lotSize   = posNum(info?.lotAreaValue)
      const propType  = String(info?.homeType ?? "").replace(/_/g, " ").toLowerCase() || null

      return [{
        address,
        city,
        state,
        zip,
        ownerName:        "",
        foreclosureStage: "PRE_FORECLOSURE",
        recordingDate:    "",
        defaultAmount:    price,
        lender:           null,
        auctionDate:      null,
        estimatedValue:   zest ?? price,
        sourceUrl:        zpid
          ? `https://www.zillow.com/homedetails/${zpid}_zpid/`
          : `https://www.zillow.com/homes/pre-foreclosure/`,
        rawSignals: ["Zillow pre-foreclosure listing"],
        beds, baths, sqft, yearBuilt, lotSize, propertyType: propType,
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
    6
  )
  return batches.flat()
}

// ── Redfin — tiled distressed listings ───────────────────────────────────────

async function fetchRedfinTile(tile: GeoBox, fallbackState = "CA"): Promise<FreeLead[]> {
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
    num_homes:   "350",
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
          "X-Requested-With": "XMLHttpRequest",
        },
        signal: AbortSignal.timeout(7000),
      }
    )
    if (!res.ok) return []

    const text    = await res.text()
    const jsonStr = text.startsWith("{}&&") ? text.slice(4) : text.replace(/^[^{[]*/, "")
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

      // cityStateZip.value looks like "San Diego, CA 92101" — parse all three.
      const cityStateZip = String(loc?.value ?? "")
      const csz = cityStateZip.match(/^(.*?),\s*([A-Z]{2})\s+(\d{5})/)
      const cityPart  = csz ? csz[1].trim() : (cityStateZip.split(",")[0]?.trim() ?? String(info?.city ?? ""))
      const statePart = csz ? csz[2] : (String(info?.state ?? "") || fallbackState)
      const zipPart   = csz ? csz[3] : String(info?.zip ?? "")
      const price     = Number((h.price as Record<string, unknown>)?.value ?? 0) || null
      const url       = String(h.url ?? "")

      // Property facts (Redfin GIS nests most values as { value: n }).
      const numOf = (v: unknown): number | null => {
        const n = Number((v as Record<string, unknown>)?.value ?? v)
        return Number.isFinite(n) && n > 0 ? n : null
      }
      const beds      = numOf(h.beds)
      const baths     = numOf(h.baths)
      const sqft      = numOf(h.sqFt)
      const yearBuilt = numOf(h.yearBuilt)
      const lotSize   = numOf(h.lotSize)
      const propType  = String((h.propertyType as Record<string, unknown>)?.value ?? h.propertyType ?? "") || null

      // Distress signals from the GIS payload → motivated-seller detection.
      const dom       = Number((h.dom as Record<string, unknown>)?.value ?? 0) || 0
      const mlsStatus = String(h.mlsStatus ?? "").toLowerCase()
      const blob      = JSON.stringify(h).toLowerCase()
      const isForeclosure = /foreclos|bank.?owned|\breo\b|short sale|auction|trustee/.test(blob)

      const signals: string[] = []
      let stage: FreeLead["foreclosureStage"] = "PRE_FORECLOSURE"
      if (isForeclosure) {
        stage = /auction|trustee/.test(blob) ? "AUCTION" : "NOTICE_OF_SALE"
        signals.push("Redfin distressed listing — foreclosure / REO / short-sale flagged")
      } else {
        signals.push("Redfin active listing")
      }
      if (dom >= 90) signals.push(`On market ${dom} days — likely motivated seller`)
      else if (dom >= 45) signals.push(`On market ${dom} days`)

      return [{
        address,
        city:             cityPart,
        state:            statePart || fallbackState,
        zip:              zipPart,
        ownerName:        "",
        foreclosureStage: stage,
        recordingDate:    "",
        defaultAmount:    null,
        lender:           null,
        auctionDate:      null,
        estimatedValue:   price,
        sourceUrl:        url ? `https://www.redfin.com${url}` : "https://www.redfin.com/",
        rawSignals:       signals,
        beds, baths, sqft, yearBuilt, lotSize, propertyType: propType,
      } as FreeLead]
    })
  } catch {
    return []
  }
}

async function scrapeRedfinTiled(box: GeoBox, maxLeads: number, fallbackState = "CA"): Promise<FreeLead[]> {
  const { cols, rows } = tilesForTarget(maxLeads)
  const tiles = tileBox(box, cols, rows)
  const batches = await withConcurrency(
    tiles.map(t => () => fetchRedfinTile(t, fallbackState)),
    6
  )
  return batches.flat()
}

// ── HomePath — Fannie Mae official REO listings ───────────────────────────────

async function scrapeHomePath(box: GeoBox): Promise<FreeLead[]> {
  try {
    // Fannie Mae HomePath public listing search — bounding box
    const params = new URLSearchParams({
      listingType:   "HomePath",
      searchType:    "BoundingBox",
      north:         String(box.north),
      south:         String(box.south),
      east:          String(box.east),
      west:          String(box.west),
      sortBy:        "LargestSquareFootage",
      startIndex:    "0",
      pageSize:      "100",
    })

    const res = await fetch(
      `https://www.homepath.com/listings.json?${params}`,
      {
        headers: {
          "User-Agent":      UA,
          "Accept":          "application/json, */*",
          "Accept-Language": "en-US,en;q=0.9",
          "Referer":         "https://www.homepath.com/",
        },
        signal: AbortSignal.timeout(7000),
      }
    )
    if (!res.ok) return []
    const data = await res.json()

    const listings: Record<string, unknown>[] =
      data?.listings ?? data?.properties ?? data?.data ?? data?.results ?? []

    return listings.flatMap((l) => {
      const address = String(
        l.propertyStreetAddress ?? l.streetAddress ?? l.address ?? l.street ?? ""
      ).trim()
      if (!address) return []

      return [{
        address,
        city:             String(l.city ?? l.propertyCity ?? ""),
        state:            String(l.stateCode ?? l.state ?? "CA"),
        zip:              String(l.postalCode ?? l.zip ?? l.zipCode ?? ""),
        ownerName:        "Fannie Mae / HomePath",
        foreclosureStage: "PRE_FORECLOSURE" as const,
        recordingDate:    String(l.listingDate ?? l.availableDate ?? ""),
        defaultAmount:    Number(l.listPrice ?? l.askingPrice ?? 0) || null,
        lender:           "Fannie Mae",
        auctionDate:      null,
        estimatedValue:   Number(l.listPrice ?? 0) || null,
        sourceUrl:        l.propertyUrl
          ? `https://www.homepath.com${l.propertyUrl}`
          : `https://www.homepath.com/listing/${l.listingId ?? ""}`,
        rawSignals:       ["Fannie Mae HomePath REO — bank-owned foreclosure"],
      } as FreeLead]
    })
  } catch {
    return []
  }
}

// ── HomeSteps — Freddie Mac official REO listings ─────────────────────────────

async function scrapeHomeSteps(box: GeoBox): Promise<FreeLead[]> {
  try {
    const params = new URLSearchParams({
      north:    String(box.north),
      south:    String(box.south),
      east:     String(box.east),
      west:     String(box.west),
      limit:    "100",
      page:     "1",
    })

    const res = await fetch(
      `https://www.homesteps.com/api/v3/listings/search?${params}`,
      {
        headers: {
          "User-Agent":      UA,
          "Accept":          "application/json",
          "Referer":         "https://www.homesteps.com/",
        },
        signal: AbortSignal.timeout(7000),
      }
    )
    if (!res.ok) return []
    const data = await res.json()

    const listings: Record<string, unknown>[] =
      data?.listings ?? data?.properties ?? data?.data ?? []

    return listings.flatMap((l) => {
      const address = String(
        l.propertyAddress ?? l.streetAddress ?? l.address ?? ""
      ).trim()
      if (!address) return []

      return [{
        address,
        city:             String(l.city ?? ""),
        state:            String(l.stateCode ?? l.state ?? "CA"),
        zip:              String(l.postalCode ?? l.zip ?? ""),
        ownerName:        "Freddie Mac / HomeSteps",
        foreclosureStage: "PRE_FORECLOSURE" as const,
        recordingDate:    String(l.listDate ?? ""),
        defaultAmount:    Number(l.listPrice ?? 0) || null,
        lender:           "Freddie Mac",
        auctionDate:      null,
        estimatedValue:   Number(l.listPrice ?? 0) || null,
        sourceUrl:        l.detailUrl
          ? `https://www.homesteps.com${l.detailUrl}`
          : "https://www.homesteps.com/",
        rawSignals: ["Freddie Mac HomeSteps REO — bank-owned foreclosure"],
      } as FreeLead]
    })
  } catch {
    return []
  }
}

// ── HUD REO — government foreclosure property listings ───────────────────────

async function scrapeHudReo(params: {
  state?: string
  county?: string
}): Promise<FreeLead[]> {
  const state  = params.state ?? "CA"

  try {
    // Try HUD's XML data feed first (more reliable than HTML parsing)
    const xmlRes = await fetch(
      `https://www.hudhomestore.gov/Listing/PropertyListing.aspx?stateCode=${state}&zipCode=&county=${encodeURIComponent(params.county ?? "")}&city=&listingType=A&listingTypeArray=A&pageSize=100&pageNum=1&output=xml`,
      {
        headers: { "User-Agent": UA, "Accept": "application/xml, text/xml, */*" },
        signal:  AbortSignal.timeout(7000),
      }
    )

    if (xmlRes.ok) {
      const xml = await xmlRes.text()
      const leads: FreeLead[] = []
      const propMatches = xml.matchAll(/<Property>([\s\S]*?)<\/Property>/gi)
      for (const m of propMatches) {
        const block   = m[1]
        const extract = (tag: string) => block.match(new RegExp(`<${tag}>([^<]*)<\/${tag}>`))?.[1]?.trim() ?? ""
        const address = extract("PropertyAddress") || extract("StreetAddress") || extract("Address")
        if (!address) continue

        leads.push({
          address,
          city:             extract("City"),
          state:            extract("State") || state,
          zip:              extract("ZipCode") || extract("Zip"),
          ownerName:        "HUD / FHA",
          foreclosureStage: "PRE_FORECLOSURE",
          recordingDate:    extract("ListingDate") || extract("ApprovalDate"),
          defaultAmount:    Number(extract("ListPrice")) || null,
          lender:           "HUD / FHA",
          auctionDate:      null,
          estimatedValue:   Number(extract("ListPrice")) || null,
          sourceUrl:        `https://www.hudhomestore.gov/Listing/PropertyDetails.aspx?caseNumber=${extract("CaseNumber")}`,
          rawSignals:       ["HUD REO — FHA-insured foreclosure, government listing"],
        })
      }
      if (leads.length > 0) return leads
    }

    // Fallback: HTML scrape with regex for case number links + addresses
    const htmlRes = await fetch(
      `https://www.hudhomestore.gov/Listing/PropertySearchResult.aspx?stateCode=${state}&county=${encodeURIComponent(params.county ?? "")}&pageSize=100&pageNum=1`,
      {
        headers: { "User-Agent": UA, "Accept": "text/html" },
        signal:  AbortSignal.timeout(7000),
      }
    )
    if (!htmlRes.ok) return []
    const html = await htmlRes.text()

    const leads: FreeLead[] = []
    const rows = html.matchAll(/caseNumber=([^"&]+)[^>]*>[\s\S]*?(\d+\s+[A-Z][^<,]{4,50})[,<]/gi)
    for (const row of rows) {
      const address = row[2]?.trim()
      if (address) {
        leads.push({
          address,
          city: "", state, zip: "",
          ownerName:        "HUD / FHA",
          foreclosureStage: "PRE_FORECLOSURE",
          recordingDate:    "",
          defaultAmount:    null,
          lender:           "HUD / FHA",
          auctionDate:      null,
          estimatedValue:   null,
          sourceUrl:        `https://www.hudhomestore.gov/Listing/PropertyDetails.aspx?caseNumber=${row[1]}`,
          rawSignals:       ["HUD REO — FHA-insured foreclosure"],
        })
      }
    }
    return leads.slice(0, 160)
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
        signal:  AbortSignal.timeout(7000),
      }
    )
    if (!res.ok) return []
    const data = await res.json()
    const items: Record<string, unknown>[] = data?.data ?? data?.properties ?? (Array.isArray(data) ? data : [])

    return items.slice(0, 160).flatMap((p) => {
      const address = String(
        p.propertyAddress ?? p.address ?? p.streetAddress ?? p.street ?? ""
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
        rawSignals:       ["USDA Rural Development REO property — government listing"],
      } as FreeLead]
    })
  } catch {
    return []
  }
}

// ── Foreclosure.com — pre-foreclosure HTML listing search ─────────────────────

async function scrapeForeclosureCom(countyName: string, state: string): Promise<FreeLead[]> {
  try {
    // Encode county for URL
    const countySlug = countyName.toLowerCase().replace(/\s+/g, "+")
    const res = await fetch(
      `https://www.foreclosure.com/listing/results.html?qtype=search&st%5B%5D=${state.toLowerCase()}&county%5B%5D=${encodeURIComponent(countyName)}&ptypes%5B%5D=SFR&ptypes%5B%5D=CONDO&ptypes%5B%5D=MULTI`,
      {
        headers: {
          "User-Agent":      UA,
          "Accept":          "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
          "Referer":         "https://www.foreclosure.com/",
        },
        signal: AbortSignal.timeout(7000),
      }
    )
    if (!res.ok) return []
    const html = await res.text()

    const leads: FreeLead[] = []

    // Foreclosure.com embeds property data in listing rows
    // Address pattern: spans with class "address" or similar
    const addrMatches = html.matchAll(
      /(?:class="[^"]*address[^"]*"|class="[^"]*street[^"]*")[^>]*>([^<]{8,80})<\/(?:span|div|td)/gi
    )
    const priceMatches = [...html.matchAll(/\$\s*([\d,]+)/g)]
    let priceIdx = 0

    for (const m of addrMatches) {
      const raw = m[1].trim().replace(/&amp;/g, "&").replace(/&#\d+;/g, "")
      if (!raw || raw.length < 8 || /select|search|login|menu/i.test(raw)) continue

      const price = priceMatches[priceIdx]
        ? Number(priceMatches[priceIdx][1].replace(/,/g, "")) || null
        : null
      priceIdx++

      leads.push({
        address:          raw,
        city:             "",
        state,
        zip:              "",
        ownerName:        "",
        foreclosureStage: "PRE_FORECLOSURE",
        recordingDate:    "",
        defaultAmount:    price,
        lender:           null,
        auctionDate:      null,
        estimatedValue:   price,
        sourceUrl:        `https://www.foreclosure.com/listing/results.html?st%5B%5D=${state.toLowerCase()}&county%5B%5D=${encodeURIComponent(countySlug)}`,
        rawSignals:       ["Foreclosure.com pre-foreclosure listing"],
      })
      if (leads.length >= 120) break
    }

    return leads
  } catch {
    return []
  }
}

// ── Legal notice publications — CA legally-required NOD publications ───────────

async function scrapeLegalNotices(countyName: string): Promise<FreeLead[]> {
  const leads: FreeLead[] = []

  // publicnoticeads.com — California legal notice aggregator
  try {
    const res = await fetch(
      `https://www.publicnoticeads.com/CA/search/?type=NTS&county=${encodeURIComponent(countyName)}`,
      {
        headers: {
          "User-Agent":      UA,
          "Accept":          "text/html",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: AbortSignal.timeout(7000),
      }
    )
    if (res.ok) {
      const html = await res.text()

      // Extract addresses from notice listings
      const addressRx = /(\d+\s+[A-Z][a-zA-Z0-9\s]{5,60}(?:Street|St|Avenue|Ave|Boulevard|Blvd|Drive|Dr|Road|Rd|Lane|Ln|Court|Ct|Way|Circle|Cir|Place|Pl)[^<]{0,30})/gi
      const found = html.matchAll(addressRx)
      const ownerRx = /(?:Trustor|Owner|Borrower|Grantor):?\s*([A-Z][A-Za-z\s-]{3,40})/gi

      const owners: string[] = []
      for (const o of html.matchAll(ownerRx)) owners.push(o[1].trim())

      let idx = 0
      for (const m of found) {
        const address = m[1].trim().replace(/\s+/g, " ")
        if (!address || leads.some(l => l.address === address)) continue
        leads.push({
          address,
          city:             countyName.split(" ")[0],
          state:            "CA",
          zip:              "",
          ownerName:        owners[idx] ?? "",
          foreclosureStage: "NOTICE_OF_SALE",
          recordingDate:    new Date().toISOString().slice(0, 10),
          defaultAmount:    null,
          lender:           null,
          auctionDate:      null,
          estimatedValue:   null,
          sourceUrl:        `https://www.publicnoticeads.com/CA/search/?type=NTS&county=${encodeURIComponent(countyName)}`,
          rawSignals:       ["Notice of Trustee Sale — California legal notice publication (legally required)"],
        })
        idx++
        if (leads.length >= 100) break
      }
    }
  } catch { /* non-fatal */ }

  // legalnewsonline.com — another CA legal notice source
  try {
    const res = await fetch(
      `https://legalnewsonline.com/?s=${encodeURIComponent(`"notice of trustee sale" "${countyName} County"`)}&post_type=legalnotice`,
      {
        headers: {
          "User-Agent":      UA,
          "Accept":          "text/html",
        },
        signal: AbortSignal.timeout(7000),
      }
    )
    if (res.ok) {
      const html = await res.text()
      const addressRx = /(\d+\s+[A-Z][a-zA-Z0-9\s]{5,60}(?:Street|St|Avenue|Ave|Boulevard|Blvd|Drive|Dr|Road|Rd|Lane|Ln|Court|Ct|Way|Circle|Cir|Place|Pl)[^<]{0,30})/gi
      for (const m of html.matchAll(addressRx)) {
        const address = m[1].trim().replace(/\s+/g, " ")
        if (!address || leads.some(l => l.address === address)) continue
        leads.push({
          address,
          city:             "",
          state:            "CA",
          zip:              "",
          ownerName:        "",
          foreclosureStage: "NOTICE_OF_SALE",
          recordingDate:    new Date().toISOString().slice(0, 10),
          defaultAmount:    null,
          lender:           null,
          auctionDate:      null,
          estimatedValue:   null,
          sourceUrl:        `https://legalnewsonline.com/`,
          rawSignals:       ["Notice of Trustee Sale — California legal newspaper (legally required publication)"],
        })
        if (leads.length >= 120) break
      }
    }
  } catch { /* non-fatal */ }

  return leads
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
      signal:  AbortSignal.timeout(7000),
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
            signal: AbortSignal.timeout(7000),
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
              state: String(a.STATE ?? a.PropertyState ?? a.state ?? "CA"),
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

// ── auction.com — foreclosure auction listings ────────────────────────────────

async function scrapeAuctionCom(params: {
  searchType: string
  zipCode?:   string
  city?:      string
  state?:     string
  county?:    string
}): Promise<FreeLead[]> {
  const state  = params.state ?? "CA"
  const county = params.county ?? ""

  // Try their API endpoint — auction.com React app hits a REST API
  try {
    const apiQs = new URLSearchParams({
      stateCode:  state,
      county,
      pageNumber: "1",
      pageSize:   "100",
      assetType:  "REO",
    })
    if (params.searchType === "zip" && params.zipCode) {
      apiQs.set("zipCode", params.zipCode)
      apiQs.delete("county")
    }

    const apiRes = await fetch(
      `https://www.auction.com/api/v2/properties/search?${apiQs}`,
      {
        headers: {
          "User-Agent": UA,
          "Accept":     "application/json",
          "Referer":    "https://www.auction.com/",
        },
        signal: AbortSignal.timeout(7000),
      }
    )
    if (apiRes.ok) {
      const data = await apiRes.json()
      const listings: Record<string, unknown>[] =
        data?.results ?? data?.properties ?? data?.assets ?? data?.data ?? []

      if (listings.length > 0) {
        return listings.flatMap((l) => {
          const address = String(
            l.address ?? l.streetAddress ?? l.propertyAddress ?? l.streetAddr ?? ""
          ).trim()
          if (!address) return []

          const rawDate = l.auctionDate ?? l.saleDate ?? l.eventDate ?? null
          let auctionDate: string | null = null
          try { if (rawDate) auctionDate = new Date(String(rawDate)).toISOString().slice(0, 10) } catch { /* skip */ }

          return [{
            address,
            city:            String(l.city ?? ""),
            state:           String(l.state ?? state),
            zip:             String(l.zip ?? l.zipCode ?? l.postalCode ?? ""),
            ownerName:       String(l.ownerName ?? l.borrowerName ?? ""),
            foreclosureStage: "AUCTION",
            recordingDate:   "",
            defaultAmount:   Number(l.openingBid ?? l.startingBid ?? l.loanBalance ?? 0) || null,
            lender:          String(l.lender ?? l.beneficiary ?? "") || null,
            auctionDate,
            estimatedValue:  Number(l.estimatedValue ?? l.marketValue ?? 0) || null,
            sourceUrl:       l.url ? `https://www.auction.com${l.url}` : "https://www.auction.com/",
            rawSignals:      [`Foreclosure auction — auction.com${auctionDate ? ` sale ${auctionDate}` : ""}`],
          } as FreeLead]
        })
      }
    }
  } catch { /* fall through to HTML scrape */ }

  // HTML fallback — scrape public search page
  try {
    const htmlQs = new URLSearchParams({ state, county, page: "1" })
    if (params.searchType === "zip" && params.zipCode) {
      htmlQs.set("zip", params.zipCode)
    }
    const htmlRes = await fetch(
      `https://www.auction.com/search/real-estate-foreclosure/?${htmlQs}`,
      {
        headers: { "User-Agent": UA, "Accept": "text/html" },
        signal:  AbortSignal.timeout(7000),
      }
    )
    if (!htmlRes.ok) return []
    const html = await htmlRes.text()

    const leads: FreeLead[] = []
    const addrRx = /(\d+\s+[A-Z][a-zA-Z0-9\s]{5,60}(?:Street|St|Avenue|Ave|Boulevard|Blvd|Drive|Dr|Road|Rd|Lane|Ln|Court|Ct|Way|Circle|Cir|Place|Pl)[^<]{0,20})/gi
    for (const m of html.matchAll(addrRx)) {
      const address = m[1].trim().replace(/\s+/g, " ")
      if (!address || leads.some(l => l.address === address)) continue
      leads.push({
        address,
        city:             "",
        state,
        zip:              "",
        ownerName:        "",
        foreclosureStage: "AUCTION",
        recordingDate:    "",
        defaultAmount:    null,
        lender:           null,
        auctionDate:      null,
        estimatedValue:   null,
        sourceUrl:        `https://www.auction.com/search/real-estate-foreclosure/?state=${state}`,
        rawSignals:       ["Foreclosure auction listing — auction.com"],
      })
      if (leads.length >= 100) break
    }
    return leads
  } catch {
    return []
  }
}

// ── Bid4Assets — county tax deed / government auctions ───────────────────────

async function scrapeBid4Assets(state: string): Promise<FreeLead[]> {
  // Use their search page with proper query parameters (not hash-based URL)
  const attempts = [
    `https://www.bid4assets.com/auctions?page=1&items_per_page=100&state=${state}&property_type_ids=1`,
    `https://www.bid4assets.com/search?type=realestate&state=${state}&page=1`,
  ]

  for (const url of attempts) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent":      UA,
          "Accept":          "text/html, application/json, */*",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: AbortSignal.timeout(7000),
      })
      if (!res.ok) continue
      const text = await res.text()

      // Try JSON first
      if (res.headers.get("content-type")?.includes("json")) {
        const data = JSON.parse(text)
        const listings: Record<string, unknown>[] =
          data?.assets ?? data?.listings ?? data?.results ?? (Array.isArray(data) ? data : [])
        if (listings.length > 0) {
          return listings.slice(0, 160).flatMap((l) => {
            const address = String(
              l.address ?? l.propertyAddress ?? l.streetAddress ?? ""
            ).trim()
            if (!address) return []
            return [{
              address,
              city:             String(l.city ?? ""),
              state:            String(l.state ?? state),
              zip:              String(l.zip ?? l.zipCode ?? ""),
              ownerName:        String(l.seller ?? l.agency ?? ""),
              foreclosureStage: "AUCTION" as const,
              recordingDate:    "",
              defaultAmount:    Number(l.openingBid ?? l.currentBid ?? 0) || null,
              lender:           String(l.authority ?? l.agency ?? "") || null,
              auctionDate:      String(l.auctionDate ?? l.endDate ?? "") || null,
              estimatedValue:   Number(l.assessedValue ?? l.marketValue ?? 0) || null,
              sourceUrl:        l.url ? `https://www.bid4assets.com${l.url}` : "https://www.bid4assets.com/",
              rawSignals:       ["Bid4Assets tax deed / county auction listing"],
            } as FreeLead]
          })
        }
      }

      // HTML fallback
      const leads: FreeLead[] = []
      const addrRx = /(\d+\s+[A-Z][a-zA-Z0-9\s]{5,60}(?:Street|St|Avenue|Ave|Boulevard|Blvd|Drive|Dr|Road|Rd|Lane|Ln|Court|Ct|Way|Circle|Cir|Place|Pl)[^<]{0,20})/gi
      for (const m of text.matchAll(addrRx)) {
        const address = m[1].trim().replace(/\s+/g, " ")
        if (!address || leads.some(l => l.address === address)) continue
        leads.push({
          address,
          city: "", state, zip: "",
          ownerName:        "",
          foreclosureStage: "AUCTION",
          recordingDate:    "",
          defaultAmount:    null,
          lender:           null,
          auctionDate:      null,
          estimatedValue:   null,
          sourceUrl:        url,
          rawSignals:       ["Bid4Assets government auction listing"],
        })
        if (leads.length >= 100) break
      }
      if (leads.length > 0) return leads
    } catch { continue }
  }
  return []
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
  countyId?:  string
  leadType?:  string
}): Promise<DirectSourceResult> {
  const maxLeads  = params.maxLeads ?? 100
  const state     = params.state ?? "CA"
  const countyName = params.county ?? ""

  const areaLabel =
    params.searchType === "zip"    ? `ZIP ${params.zipCode}` :
    params.searchType === "city"   ? `${params.city} ${state}` :
    `${countyName} County ${state}`

  // Resolve bounding box
  let box: GeoBox | null = null
  if (params.countyId && COUNTY_BOXES[params.countyId]) {
    box = COUNTY_BOXES[params.countyId]
  } else {
    box = await geocodeArea(params)
  }

  // All sources in parallel
  const [
    zillowLeads, redfinLeads,
    homePathLeads, homeStepsLeads,
    arcgisLeads, openDataLeads, countyRecordsLeads,
    auctionLeads, hudLeads, usdaLeads, bid4Leads,
    fcComLeads, legalNoticeLeads,
  ] = await Promise.all([
    box ? scrapeZillowTiled(box, maxLeads)  : Promise.resolve([]),
    box ? scrapeRedfinTiled(box, maxLeads, state)  : Promise.resolve([]),
    box ? scrapeHomePath(box)               : Promise.resolve([]),
    box ? scrapeHomeSteps(box)              : Promise.resolve([]),
    box ? queryArcGISHub(box, areaLabel)    : Promise.resolve([]),
    fetchOpenDataLeads(box, state, params.leadType),   // gov open data (code/vacant/tax/lien)
    fetchCountyRecords({ countyId: params.countyId, county: countyName, city: params.city, state, zipCode: params.zipCode }), // county/city Socrata records
    scrapeAuctionCom(params),
    scrapeHudReo({ state, county: countyName }),
    scrapeUsda(state),
    scrapeBid4Assets(state),
    countyName ? scrapeForeclosureCom(countyName, state) : Promise.resolve([]),
    countyName ? scrapeLegalNotices(countyName)          : Promise.resolve([]),
  ])

  const sourceCounts: Record<string, number> = {}
  if (zillowLeads.length)       sourceCounts["Zillow"]           = zillowLeads.length
  if (redfinLeads.length)       sourceCounts["Redfin"]           = redfinLeads.length
  if (homePathLeads.length)     sourceCounts["HomePath (Fannie)"]= homePathLeads.length
  if (homeStepsLeads.length)    sourceCounts["HomeSteps (Freddie)"] = homeStepsLeads.length
  if (arcgisLeads.length)       sourceCounts["County records"]   = arcgisLeads.length
  if (openDataLeads.length)     sourceCounts["Gov open data"]    = openDataLeads.length
  if (countyRecordsLeads.length) sourceCounts["County records"]   = countyRecordsLeads.length
  if (auctionLeads.length)      sourceCounts["auction.com"]      = auctionLeads.length
  if (hudLeads.length)          sourceCounts["HUD REO"]          = hudLeads.length
  if (usdaLeads.length)         sourceCounts["USDA RD"]          = usdaLeads.length
  if (bid4Leads.length)         sourceCounts["Bid4Assets"]       = bid4Leads.length
  if (fcComLeads.length)        sourceCounts["Foreclosure.com"]  = fcComLeads.length
  if (legalNoticeLeads.length)  sourceCounts["Legal notices"]    = legalNoticeLeads.length

  // Merge and deduplicate by normalized address+city
  const seen = new Set<string>()
  const leads = [
    // Highest quality (have verified addresses) first
    ...countyRecordsLeads,
    ...openDataLeads,
    ...arcgisLeads,
    ...hudLeads,
    ...homePathLeads,
    ...homeStepsLeads,
    ...usdaLeads,
    ...legalNoticeLeads,
    ...zillowLeads,
    ...redfinLeads,
    ...auctionLeads,
    ...bid4Leads,
    ...fcComLeads,
  ].filter((l) => {
    if (!l.address?.trim()) return false
    const key = (l.address + l.city).toLowerCase().replace(/[\s,#.-]/g, "")
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  return { leads, sourceCounts, geocoded: !!box }
}
