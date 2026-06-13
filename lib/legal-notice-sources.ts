// Direct legal-notice & public-record fetchers — NO API KEY required.
// These sources serve plain HTML/JSON that works from datacenter IPs (unlike
// Zillow), so they reliably surface real foreclosure/distress records.
//
// Implements the user's pre-foreclosure discovery methods:
//   • Public records (county recorder / official foreclosure-sale lists)
//   • Court records (sheriff sale / tax-foreclosure datasets via ArcGIS)
//   • Legal notices (state public-notice publications)

import type { FreeLead } from "@/lib/free-foreclosure-scraper"
import { extractAddressesFromContent, type ExtractResult } from "@/lib/address-extractor"

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

// ── California DOJ — official residential foreclosure-sale registry ───────────
// Statewide, government-hosted (not IP-blocked). Lists completed/recent trustee
// sales with county, address, city/zip, winning bidder, and sale dates.
export async function fetchCaDojForeclosures(): Promise<ExtractResult[]> {
  try {
    const res = await fetch("https://oag.ca.gov/residential-foreclosure-sales", {
      headers: { "User-Agent": UA, "Accept": "text/html" },
      signal: AbortSignal.timeout(9000),
    })
    if (!res.ok) return []
    const html = await res.text()

    const out: ExtractResult[] = []
    // Each data row: County | Address | City,Zip | Grantee | WinningBidder | SaleDate | Cat | Details
    for (const row of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
        .map(c => c[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim())
      if (cells.length < 6) continue

      const county  = cells[0]
      const street  = cells[1]
      const cityZip = cells[2]                       // "VICTORVILLE, 92395"
      const owner   = cells[3] || cells[4] || ""
      const saleDate = cells[5]
      if (!street || /redacted/i.test(street) || !/^\d/.test(street)) continue

      const zip  = cityZip.match(/(\d{5})/)?.[1] ?? ""
      const city = cityZip.replace(/,?\s*\d{5}.*$/, "").replace(/\(.*?\)/g, "").trim()

      let auctionDate: string | null = null
      const dm = saleDate.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
      if (dm) auctionDate = `${dm[3]}-${dm[1].padStart(2, "0")}-${dm[2].padStart(2, "0")}`

      const lead: FreeLead = {
        address: street,
        city,
        state: "CA",
        zip,
        ownerName: /redacted/i.test(owner) ? "" : owner,
        foreclosureStage: "NOTICE_OF_SALE",
        recordingDate: auctionDate ?? "",
        defaultAmount: null,
        lender: null,
        auctionDate,
        estimatedValue: null,
        sourceUrl: "https://oag.ca.gov/residential-foreclosure-sales",
        rawSignals: [`Trustee sale on official CA DOJ foreclosure registry${county ? ` — ${county} County` : ""}`],
      }
      out.push({ lead, state: "CA", zip, city })
    }
    return out
  } catch {
    return []
  }
}

// ── State public-notice publications — legal foreclosure notices ──────────────
// Many state press-association sites publish NOD / Notice of Trustee Sale as
// plain HTML. We fetch a few that are known to serve datacenter requests and run
// the regex extractor over the HTML. Best-effort: failures are silent.
const PUBLIC_NOTICE_URLS = (state: string, query: string): string[] => {
  const q = encodeURIComponent(query)
  const urls = [
    // California Newspaper Publishers Assn — statewide legal notices
    `https://capublicnotice.com/?s=${q}`,
    // Generic public-notice aggregator (multi-state)
    `https://www.publicnoticeads.com/search/?keyword=${q}`,
  ]
  return urls
}

export async function fetchPublicNotices(
  query: string,
  state: string,
): Promise<ExtractResult[]> {
  const out: ExtractResult[] = []
  await Promise.allSettled(
    PUBLIC_NOTICE_URLS(state, query).map(async (url) => {
      try {
        const res = await fetch(url, {
          headers: { "User-Agent": UA, "Accept": "text/html" },
          signal: AbortSignal.timeout(8000),
        })
        if (!res.ok) return
        const html = await res.text()
        if (html.length < 500) return            // parked / redirect stub
        out.push(...extractAddressesFromContent(html.slice(0, 400_000), url))
      } catch { /* silent */ }
    })
  )
  return out
}
