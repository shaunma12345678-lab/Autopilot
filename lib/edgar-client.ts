// SEC EDGAR client — free, no API key, but SEC requires a descriptive
// User-Agent on every request and caps requests at 10/sec.
// Docs: https://www.sec.gov/os/webmaster-faq#developers

const BASE_SUBMISSIONS = "https://data.sec.gov/submissions"
const BASE_XBRL = "https://data.sec.gov/api/xbrl"
const BASE_FULLTEXT = "https://efts.sec.gov/LATEST/search-index"
const TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"

function userAgent(): string {
  const ua = process.env.SEC_EDGAR_USER_AGENT
  if (!ua) {
    throw new Error(
      "SEC_EDGAR_USER_AGENT is not set. SEC requires a descriptive User-Agent " +
      'on every request (e.g. "AutoPilot contact@yourdomain.com"). Add it to .env.local and Vercel.'
    )
  }
  return ua
}

// Simple sequential throttle — SEC's hard limit is 10 req/sec; we floor at
// 120ms between requests to stay safely under it without a queue library.
let lastRequestAt = 0
export async function throttledFetch(url: string): Promise<Response> {
  const now = Date.now()
  const wait = Math.max(0, lastRequestAt + 120 - now)
  if (wait > 0) await new Promise(r => setTimeout(r, wait))
  lastRequestAt = Date.now()
  return fetch(url, {
    headers: { "User-Agent": userAgent(), Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  })
}

function padCik(cik: string): string {
  return cik.replace(/\D/g, "").padStart(10, "0")
}

export interface CompanyTickerEntry {
  cik: string
  symbol: string
  name: string
}

let tickerMapCache: CompanyTickerEntry[] | null = null
let tickerMapCachedAt = 0
const TICKER_MAP_TTL_MS = 7 * 24 * 60 * 60 * 1000 // weekly refresh

// Single-flight guard. Without it, concurrent callers each trigger their own
// fetch of the ~1MB ticker file: nothing is cached until one SUCCEEDS, so a
// burst produces a thundering herd, SEC throttles it, every call returns empty,
// and no cache is ever populated to stop the cycle.
//
// This was not theoretical. Parallelising the refresh cron to 4 workers turned
// a working run into 60 consecutive "not a known SEC-registered ticker" errors
// in 2.2 seconds — on MPC, BEN, APD and FCX, all obviously registered. Sharing
// one in-flight promise makes concurrency safe.
let tickerMapInFlight: Promise<CompanyTickerEntry[]> | null = null

export async function getCompanyTickers(): Promise<CompanyTickerEntry[]> {
  if (tickerMapCache && Date.now() - tickerMapCachedAt < TICKER_MAP_TTL_MS) {
    return tickerMapCache
  }
  if (tickerMapInFlight) return tickerMapInFlight

  tickerMapInFlight = fetchTickerMap().finally(() => { tickerMapInFlight = null })
  return tickerMapInFlight
}

async function fetchTickerMap(): Promise<CompanyTickerEntry[]> {
  try {
    const res = await throttledFetch(TICKERS_URL)
    if (!res.ok) return tickerMapCache ?? []
    const data = await res.json() as Record<string, { cik_str: number; ticker: string; title: string }>
    const entries = Object.values(data).map(e => ({
      cik: padCik(String(e.cik_str)),
      symbol: e.ticker.toUpperCase(),
      name: e.title,
    }))
    tickerMapCache = entries
    tickerMapCachedAt = Date.now()
    return entries
  } catch {
    return tickerMapCache ?? []
  }
}

export async function resolveCik(symbol: string): Promise<CompanyTickerEntry | null> {
  const entries = await getCompanyTickers()
  return entries.find(e => e.symbol === symbol.toUpperCase()) ?? null
}

export interface EdgarSubmissions {
  cik: string
  name: string
  sic?: string            // 4-digit SIC code — drives sector-relative benchmarking
  sicDescription?: string
  exchanges?: string[]
  recentForms: { form: string; filingDate: string; accessionNumber: string; primaryDocument: string }[]
}

export async function getSubmissions(cik: string): Promise<EdgarSubmissions | null> {
  try {
    const padded = padCik(cik)
    const res = await throttledFetch(`${BASE_SUBMISSIONS}/CIK${padded}.json`)
    if (!res.ok) return null
    const data = await res.json()
    const recent = data.filings?.recent
    if (!recent) return null
    const recentForms = (recent.form as string[]).map((form, i) => ({
      form,
      filingDate: recent.filingDate[i],
      accessionNumber: recent.accessionNumber[i],
      primaryDocument: recent.primaryDocument[i],
    }))
    return {
      cik: padded,
      name: data.name,
      sic: data.sic ?? undefined,
      sicDescription: data.sicDescription,
      exchanges: data.exchanges,
      recentForms,
    }
  } catch {
    return null
  }
}

// Full XBRL "company facts" payload — every us-gaap concept the filer has
// ever reported. Can be several MB for large caps.
export type CompanyFacts = Record<string, unknown>

export async function getCompanyFacts(cik: string): Promise<CompanyFacts | null> {
  try {
    const padded = padCik(cik)
    const res = await throttledFetch(`${BASE_XBRL}/companyfacts/CIK${padded}.json`)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

// Lighter targeted fetch for a single us-gaap concept, useful for re-checking
// one metric without re-downloading the full companyfacts payload.
export async function getCompanyConcept(cik: string, tag: string, taxonomy = "us-gaap"): Promise<CompanyFacts | null> {
  try {
    const padded = padCik(cik)
    const res = await throttledFetch(`${BASE_XBRL}/companyconcept/CIK${padded}/${taxonomy}/${tag}.json`)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

// Going-concern discovery via EDGAR full-text search.
//
// Query design matters enormously here, and getting it wrong is not a subtle
// failure. Searching the bare phrase "going concern" flagged Coca-Cola with 4
// hits — all of them 2010-2013 EXHIBIT files (bylaws, a merger agreement)
// containing routine legal boilerplate. That produced a PASS signal on a
// blue-chip company. Three corrections, all verified against live EDGAR:
//
//   1. Require "substantial doubt" AND "going concern" together. That pairing
//      is the ASC 205-40 trigger language management must use when disclosing
//      genuine doubt about continuing operations. It returns 0 for Coca-Cola
//      and 10,000+ for the micro-caps and clinical-stage biotechs that
//      actually carry the disclosure.
//   2. Restrict to the last two years. A 2012 filing says nothing about
//      solvency today.
//   3. Ignore exhibit attachments (EX-*) — the disclosure lives in the primary
//      10-K/10-Q/8-K document, not in an appended contract.
const GOING_CONCERN_LOOKBACK_DAYS = 730

export async function searchGoingConcern(cik: string): Promise<{ hits: number; latestDate?: string }> {
  try {
    const padded = padCik(cik)
    const enddt = new Date().toISOString().slice(0, 10)
    const startdt = new Date(Date.now() - GOING_CONCERN_LOOKBACK_DAYS * 86400000).toISOString().slice(0, 10)

    const params = new URLSearchParams({
      q: '"substantial doubt" "going concern"',
      forms: "10-K,10-Q,8-K",
      dateRange: "custom",
      startdt,
      enddt,
      ciks: padded,
    })
    const res = await throttledFetch(`${BASE_FULLTEXT}?${params}`)
    if (!res.ok) return { hits: 0 }

    const data = await res.json()
    const rawHits = (data?.hits?.hits ?? []) as Array<{ _source?: { file_type?: string; file_date?: string } }>

    // Count only primary filing documents, never exhibits.
    const primary = rawHits.filter(h => {
      const type = h._source?.file_type ?? ""
      return !type.toUpperCase().startsWith("EX")
    })

    if (primary.length === 0) return { hits: 0 }

    const latestDate = primary
      .map(h => h._source?.file_date)
      .filter((d): d is string => Boolean(d))
      .sort()
      .at(-1)

    return { hits: primary.length, latestDate }
  } catch {
    return { hits: 0 }
  }
}

// Counts how many us-gaap concepts a companyfacts payload actually carries.
// A newly-formed holding company has a handful; a real operating filer with
// history has hundreds.
export function countGaapConcepts(facts: CompanyFacts | null): number {
  if (!facts) return 0
  const g = (facts as { facts?: Record<string, Record<string, unknown>> }).facts?.["us-gaap"]
  return g ? Object.keys(g).length : 0
}

// Finds the operating-entity CIK for a company name via EDGAR's company search.
//
// WHY THIS EXISTS: after a holding-company reorganization, SEC's ticker map
// points the ticker at the NEW shell rather than the operating company that
// holds the financial history. Verified: "XOM" maps to CIK 2115436
// "ExxonMobil Holdings Corp" (94 us-gaap concepts, no usable history) while the
// real filer is CIK 34088 "Exxon Mobil Corporation" (438 concepts). Without
// this fallback, Exxon silently scores as "insufficient data" forever.
export async function findOperatingCik(companyName: string): Promise<string | null> {
  // EDGAR's company search does prefix matching against the name AS STORED,
  // which is spaced and uppercase ("EXXON MOBIL CORP"). A holdco name written
  // without spaces ("ExxonMobil Holdings Corp") matches nothing, so several
  // query shapes are tried before giving up.
  const base = companyName
    .replace(/\b(holdings?|holdco|group|inc|corp|corporation|company|co|plc|ltd)\b\.?/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
  if (base.length < 3) return null

  // "ExxonMobil" -> "Exxon Mobil": split runs of camelCase into words.
  const spaced = base.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/\s+/g, " ").trim()
  const firstWord = spaced.split(" ")[0]

  const variants = [...new Set([base, spaced, firstWord].filter(v => v.length >= 3))]

  for (const variant of variants) {
    try {
      const url = `https://www.sec.gov/cgi-bin/browse-edgar?company=${encodeURIComponent(variant)}` +
        `&type=10-K&dateb=&owner=include&count=10&action=getcompany&output=atom`
      const res = await throttledFetch(url)
      if (!res.ok) continue

      const xml = await res.text()
      const ciks = [...new Set([...xml.matchAll(/CIK=(\d{6,10})/g)].map(m => m[1]))]
      for (const candidate of ciks.slice(0, 4)) {
        const padded = padCik(candidate)
        const facts = await getCompanyFacts(padded)
        // Require a filer with real history, not another shell.
        if (countGaapConcepts(facts) >= 150) return padded
      }
    } catch {
      // try the next variant
    }
  }
  return null
}

