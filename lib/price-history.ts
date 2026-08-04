// Price-derived metrics from free daily history.
//
// This is where the strongest free equity signal lives: 12-1 month momentum
// (Jegadeesh & Titman 1993) is among the most replicated anomalies in finance
// and costs nothing but a JSON parse. The rest — 52-week-high proximity,
// realized volatility, max drawdown, beta — feed the RISK axis rather than the
// opportunity axis.
//
// DATA SOURCE HISTORY (do not "simplify" back to Stooq): Stooq was the original
// source and is now unusable server-side — it serves a JavaScript proof-of-work
// browser challenge instead of CSV, so every fetch silently returned zero bars.
// Yahoo's chart endpoint returns the full daily series AND the live quote in a
// single call. It is unofficial, so it's wrapped defensively and paired with a
// Stooq fallback in case Yahoo changes shape; if both fail the metrics come back
// null and the scorer treats them as missing rather than as bad values.
//
// Deliberately NOT included as scoring inputs: RSI, MACD, Bollinger bands and
// friends. They're trivially available everywhere, heavily arbitraged, and have
// weak standalone evidence. Adding them would look advanced and change nothing.

export interface DailyBar {
  date: string
  close: number
}

const YAHOO_CHART = "https://query1.finance.yahoo.com/v8/finance/chart"
const STOOQ_HISTORY = "https://stooq.com/q/d/l/"
const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"

const TRADING_DAYS_PER_YEAR = 252
const TRADING_DAYS_PER_MONTH = 21

export interface HistoryResult {
  bars: DailyBar[]
  /** Live/most-recent quote, when the source provides one alongside history. */
  latestPrice: number | null
}

// Yahoo rate-limits aggressively and answers 429 in bursts. Both hosts serve
// the same data, so rotating across them with backoff turns a hard failure into
// a brief delay. Verified behavior: identical requests that 429 will succeed
// seconds later, so this is worth retrying rather than giving up on.
const YAHOO_HOSTS = ["query1", "query2"] as const
const YAHOO_ATTEMPT_BACKOFF_MS = [0, 2500, 7000]

async function fetchYahooHistory(symbol: string, range = "2y"): Promise<HistoryResult | null> {
  const path = `/v8/finance/chart/${encodeURIComponent(symbol.toUpperCase())}?range=${range}&interval=1d`

  for (let attempt = 0; attempt < YAHOO_ATTEMPT_BACKOFF_MS.length; attempt++) {
    if (YAHOO_ATTEMPT_BACKOFF_MS[attempt] > 0) {
      await new Promise(r => setTimeout(r, YAHOO_ATTEMPT_BACKOFF_MS[attempt]))
    }
    const host = YAHOO_HOSTS[attempt % YAHOO_HOSTS.length]
    const parsed = await tryYahooOnce(`https://${host}.finance.yahoo.com${path}`)
    if (parsed !== "retry") return parsed
  }
  return null
}

// Returns a result, null for a definitive miss, or "retry" for a throttle.
async function tryYahooOnce(url: string): Promise<HistoryResult | null | "retry"> {
  try {
    const res = await fetch(url, {
      // Accept: */* matches what a plain client sends; a JSON-only Accept
      // correlated with throttling in testing.
      headers: { "User-Agent": BROWSER_UA, Accept: "*/*", "Accept-Language": "en-US,en;q=0.9" },
      signal: AbortSignal.timeout(12000),
    })
    if (res.status === 429 || res.status >= 500) return "retry"
    if (!res.ok) return null

    const data = await res.json()
    const result = data?.chart?.result?.[0]
    if (!result) return null

    const timestamps = result.timestamp as number[] | undefined
    const closes = result.indicators?.quote?.[0]?.close as (number | null)[] | undefined
    if (!Array.isArray(timestamps) || !Array.isArray(closes)) return null

    const bars: DailyBar[] = []
    for (let i = 0; i < timestamps.length; i++) {
      const close = closes[i]
      if (typeof close !== "number" || !isFinite(close) || close <= 0) continue
      bars.push({ date: new Date(timestamps[i] * 1000).toISOString().slice(0, 10), close })
    }
    if (bars.length === 0) return null

    const metaPrice = result.meta?.regularMarketPrice
    const latestPrice = typeof metaPrice === "number" && isFinite(metaPrice) && metaPrice > 0
      ? metaPrice
      : bars[bars.length - 1].close

    return { bars, latestPrice }
  } catch {
    return null
  }
}

// Legacy fallback. Kept because it costs nothing when Yahoo works, and if Yahoo
// changes shape this is the only other keyless option — but note it currently
// returns a JS challenge page rather than CSV, so it will normally yield nothing.
async function fetchStooqHistory(symbol: string): Promise<HistoryResult | null> {
  try {
    const url = `${STOOQ_HISTORY}?s=${encodeURIComponent(symbol.toLowerCase())}.us&i=d`
    const res = await fetch(url, { headers: { "User-Agent": BROWSER_UA }, signal: AbortSignal.timeout(10000) })
    if (!res.ok) return null
    const text = await res.text()
    if (!text.startsWith("Date,")) return null // challenge page or error, not CSV

    const lines = text.trim().split("\n")
    const header = lines[0].split(",")
    const dateIdx = header.indexOf("Date")
    const closeIdx = header.indexOf("Close")
    if (dateIdx === -1 || closeIdx === -1) return null

    const bars: DailyBar[] = []
    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(",")
      const close = Number(row[closeIdx])
      if (!row[dateIdx] || !isFinite(close) || close <= 0) continue
      bars.push({ date: row[dateIdx], close })
    }
    if (bars.length === 0) return null
    return { bars, latestPrice: bars[bars.length - 1].close }
  } catch {
    return null
  }
}

// Twelve Data — optional keyed provider, used FIRST when a key is present.
//
// Why this exists: Yahoo is keyless but rate-limits aggressively and bursty —
// verified behavior is that identical requests succeed, then 429 for a while,
// then succeed again. Momentum is one of the highest-weighted inputs in the
// scorer, so silently losing it on most runs materially degrades results.
// Twelve Data's free tier (800 requests/day) comfortably covers a 3-ticker
// cron every 20 minutes plus on-demand lookups. Without a key the system still
// works via Yahoo — this just makes it dependable.
async function fetchTwelveDataHistory(symbol: string): Promise<HistoryResult | null> {
  const key = process.env.TWELVE_DATA_API_KEY
  if (!key) return null
  try {
    const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol.toUpperCase())}` +
      `&interval=1day&outputsize=520&order=ASC&apikey=${encodeURIComponent(key)}`
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) })
    if (!res.ok) return null

    const data = await res.json()
    if (data?.status === "error" || !Array.isArray(data?.values)) return null

    const bars: DailyBar[] = []
    for (const v of data.values as Array<{ datetime?: string; close?: string }>) {
      const close = Number(v.close)
      if (!v.datetime || !isFinite(close) || close <= 0) continue
      bars.push({ date: v.datetime.slice(0, 10), close })
    }
    if (bars.length === 0) return null
    return { bars, latestPrice: bars[bars.length - 1].close }
  } catch {
    return null
  }
}

// Nasdaq's public quote API — keyless, and critically it's an INDEPENDENT
// throttle from Yahoo's. When Yahoo 429s (which it does in bursts) this keeps
// momentum and volatility alive instead of dropping them. Returns ~1 year of
// daily bars with prices formatted as "$123.45", hence the currency stripping.
async function fetchNasdaqHistory(symbol: string): Promise<HistoryResult | null> {
  try {
    const today = new Date()
    const from = new Date(today.getTime() - 400 * 86400000).toISOString().slice(0, 10)
    const to = today.toISOString().slice(0, 10)
    // Nasdaq keys history by asset class and rejects the wrong one. ETFs (SPY,
    // our beta benchmark) are not "stocks" here, so try both rather than
    // silently losing the benchmark and every beta with it.
    let rows: unknown = null
    for (const assetclass of ["stocks", "etf"]) {
      const url = `https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol.toUpperCase())}/historical` +
        `?assetclass=${assetclass}&fromdate=${from}&todate=${to}&limit=400`
      const res = await fetch(url, {
        headers: { "User-Agent": BROWSER_UA, Accept: "application/json" },
        signal: AbortSignal.timeout(12000),
      })
      if (!res.ok) continue
      const data = await res.json()
      const candidate = data?.data?.tradesTable?.rows
      if (Array.isArray(candidate) && candidate.length > 0) { rows = candidate; break }
    }
    if (!Array.isArray(rows) || rows.length === 0) return null

    const bars: DailyBar[] = []
    for (const row of rows as Array<{ date?: string; close?: string }>) {
      if (!row.date || !row.close) continue
      const close = Number(String(row.close).replace(/[$,]/g, ""))
      // Nasdaq returns MM/DD/YYYY; normalize to ISO for date-aligned beta.
      const [m, d, y] = row.date.split("/")
      if (!y || !m || !d || !isFinite(close) || close <= 0) continue
      bars.push({ date: `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`, close })
    }
    if (bars.length === 0) return null

    // Nasdaq returns newest-first; the metrics functions expect oldest-first.
    bars.sort((a, b) => a.date.localeCompare(b.date))
    return { bars, latestPrice: bars[bars.length - 1].close }
  } catch {
    return null
  }
}

// Provider chain, highest reliability first. Every provider fails soft, so a
// dead source degrades the score's confidence rather than breaking the run.
// Two keyless providers with independent rate limits means throttling on one
// doesn't cost us the signal.
export async function fetchHistory(symbol: string): Promise<HistoryResult> {
  const twelve = await fetchTwelveDataHistory(symbol)
  if (twelve) return twelve
  const yahoo = await fetchYahooHistory(symbol)
  if (yahoo) return yahoo
  const nasdaq = await fetchNasdaqHistory(symbol)
  if (nasdaq) return nasdaq
  const stooq = await fetchStooqHistory(symbol)
  if (stooq) return stooq
  return { bars: [], latestPrice: null }
}

/** Back-compat helper for callers that only need the bar series. */
export async function fetchDailyHistory(symbol: string): Promise<DailyBar[]> {
  return (await fetchHistory(symbol)).bars
}

export interface PriceMetrics {
  momentum12m1Pct: number | null
  pctFrom52WeekHigh: number | null
  volatility30dPct: number | null
  maxDrawdown1yPct: number | null
  betaVsSpy: number | null
  barsAvailable: number
}

function dailyReturns(closes: number[]): number[] {
  const out: number[] = []
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0) out.push(closes[i] / closes[i - 1] - 1)
  }
  return out
}

function stdDev(values: number[]): number | null {
  if (values.length < 2) return null
  const mean = values.reduce((s, v) => s + v, 0) / values.length
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1)
  return Math.sqrt(variance)
}

function correlation(a: number[], b: number[]): number | null {
  const n = Math.min(a.length, b.length)
  if (n < 30) return null
  const x = a.slice(-n), y = b.slice(-n)
  const mx = x.reduce((s, v) => s + v, 0) / n
  const my = y.reduce((s, v) => s + v, 0) / n
  let num = 0, dx = 0, dy = 0
  for (let i = 0; i < n; i++) {
    num += (x[i] - mx) * (y[i] - my)
    dx += (x[i] - mx) ** 2
    dy += (y[i] - my) ** 2
  }
  if (dx === 0 || dy === 0) return null
  return num / Math.sqrt(dx * dy)
}

export function computePriceMetrics(bars: DailyBar[], benchmarkBars: DailyBar[] = []): PriceMetrics {
  const empty: PriceMetrics = {
    momentum12m1Pct: null, pctFrom52WeekHigh: null, volatility30dPct: null,
    maxDrawdown1yPct: null, betaVsSpy: null, barsAvailable: bars.length,
  }
  if (bars.length < 40) return empty

  const closes = bars.map(b => b.close)
  const last = closes[closes.length - 1]

  // 12-1 momentum: return from 12 months ago to 1 month ago. Skipping the most
  // recent month is the standard construction — it removes the short-term
  // reversal effect that otherwise contaminates the signal.
  let momentum12m1Pct: number | null = null
  if (closes.length >= TRADING_DAYS_PER_YEAR + TRADING_DAYS_PER_MONTH) {
    const start = closes[closes.length - 1 - TRADING_DAYS_PER_YEAR - TRADING_DAYS_PER_MONTH]
    const end = closes[closes.length - 1 - TRADING_DAYS_PER_MONTH]
    if (start > 0) momentum12m1Pct = (end / start - 1) * 100
  }

  const yearWindow = closes.slice(-TRADING_DAYS_PER_YEAR)
  const high52 = Math.max(...yearWindow)
  const pctFrom52WeekHigh = high52 > 0 ? ((last - high52) / high52) * 100 : null

  const sd = stdDev(dailyReturns(closes.slice(-31)))
  const volatility30dPct = sd !== null ? sd * Math.sqrt(TRADING_DAYS_PER_YEAR) * 100 : null

  let peak = yearWindow[0]
  let maxDrawdown = 0
  for (const c of yearWindow) {
    if (c > peak) peak = c
    if (peak > 0) {
      const dd = (c - peak) / peak
      if (dd < maxDrawdown) maxDrawdown = dd
    }
  }

  let betaVsSpy: number | null = null
  if (benchmarkBars.length >= 60) {
    // Align on shared dates so a mismatched holiday calendar can't skew beta.
    const benchByDate = new Map(benchmarkBars.map(b => [b.date, b.close]))
    const pairedAsset: number[] = []
    const pairedBench: number[] = []
    for (const bar of bars) {
      const bench = benchByDate.get(bar.date)
      if (bench !== undefined) { pairedAsset.push(bar.close); pairedBench.push(bench) }
    }
    const ra = dailyReturns(pairedAsset.slice(-TRADING_DAYS_PER_YEAR))
    const rb = dailyReturns(pairedBench.slice(-TRADING_DAYS_PER_YEAR))
    const corr = correlation(ra, rb)
    const sdA = stdDev(ra)
    const sdB = stdDev(rb)
    if (corr !== null && sdA !== null && sdB !== null && sdB > 0) betaVsSpy = corr * (sdA / sdB)
  }

  return { momentum12m1Pct, pctFrom52WeekHigh, volatility30dPct, maxDrawdown1yPct: maxDrawdown * 100, betaVsSpy, barsAvailable: bars.length }
}

// Benchmark history is shared across every ticker scored in a run, so it's
// cached in-module to avoid refetching SPY once per ticker.
let benchmarkCache: { bars: DailyBar[]; fetchedAt: number } | null = null
const BENCHMARK_TTL_MS = 6 * 60 * 60 * 1000

export async function getBenchmarkHistory(): Promise<DailyBar[]> {
  if (benchmarkCache && Date.now() - benchmarkCache.fetchedAt < BENCHMARK_TTL_MS) {
    return benchmarkCache.bars
  }
  const { bars } = await fetchHistory("SPY")
  if (bars.length > 0) benchmarkCache = { bars, fetchedAt: Date.now() }
  return bars
}

// Generic series metrics for crypto, which supplies its own close series
// (CoinGecko market_chart) rather than a daily bar array.
export function computeMetricsFromCloses(closes: number[], benchmarkCloses: number[] = []): {
  volatility30dPct: number | null
  maxDrawdown1yPct: number | null
  benchmarkCorrelation: number | null
} {
  if (closes.length < 30) return { volatility30dPct: null, maxDrawdown1yPct: null, benchmarkCorrelation: null }

  const sd = stdDev(dailyReturns(closes.slice(-31)))
  const volatility30dPct = sd !== null ? sd * Math.sqrt(365) * 100 : null

  let peak = closes[0]
  let maxDrawdown = 0
  for (const c of closes) {
    if (c > peak) peak = c
    if (peak > 0) {
      const dd = (c - peak) / peak
      if (dd < maxDrawdown) maxDrawdown = dd
    }
  }

  const benchmarkCorrelation = benchmarkCloses.length >= 30
    ? correlation(dailyReturns(closes), dailyReturns(benchmarkCloses))
    : null

  return { volatility30dPct, maxDrawdown1yPct: maxDrawdown * 100, benchmarkCorrelation }
}
