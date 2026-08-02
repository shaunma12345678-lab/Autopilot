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
async function throttledFetch(url: string): Promise<Response> {
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

export async function getCompanyTickers(): Promise<CompanyTickerEntry[]> {
  if (tickerMapCache && Date.now() - tickerMapCachedAt < TICKER_MAP_TTL_MS) {
    return tickerMapCache
  }
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

// Cheap "going concern" discovery via EDGAR full-text search, without
// downloading every 8-K for a company.
export async function searchGoingConcern(cik: string): Promise<{ hits: number; latestDate?: string }> {
  try {
    const padded = padCik(cik)
    const url = `${BASE_FULLTEXT}?q=%22going+concern%22&forms=8-K,10-K,10-Q&ciks=${padded}`
    const res = await throttledFetch(url)
    if (!res.ok) return { hits: 0 }
    const data = await res.json()
    const hits = data?.hits?.total?.value ?? 0
    const latestDate = data?.hits?.hits?.[0]?._source?.file_date
    return { hits, latestDate }
  } catch {
    return { hits: 0 }
  }
}
