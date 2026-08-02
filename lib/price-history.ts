// Price-derived metrics from free daily history (Stooq CSV, no key).
//
// This is where the strongest free equity signal lives: 12-1 month momentum
// (Jegadeesh & Titman 1993) is among the most replicated anomalies in finance
// and costs nothing but a CSV parse. The rest — 52-week-high proximity,
// realized volatility, max drawdown, beta — feed the RISK axis rather than the
// opportunity axis.
//
// Deliberately NOT included as scoring inputs: RSI, MACD, Bollinger bands and
// friends. They're trivially available everywhere, heavily arbitraged, and have
// weak standalone evidence. Adding them would look advanced and change nothing.

export interface DailyBar {
  date: string
  close: number
}

const STOOQ_HISTORY = "https://stooq.com/q/d/l/"
const TRADING_DAYS_PER_YEAR = 252
const TRADING_DAYS_PER_MONTH = 21

// Parses Stooq's daily CSV (Date,Open,High,Low,Close,Volume), oldest first.
function parseStooqCsv(text: string): DailyBar[] {
  const lines = text.trim().split("\n")
  if (lines.length < 2) return []
  const header = lines[0].split(",")
  const dateIdx = header.indexOf("Date")
  const closeIdx = header.indexOf("Close")
  if (dateIdx === -1 || closeIdx === -1) return []

  const bars: DailyBar[] = []
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(",")
    const close = Number(row[closeIdx])
    const date = row[dateIdx]
    if (!date || !isFinite(close) || close <= 0) continue
    bars.push({ date, close })
  }
  return bars
}

export async function fetchDailyHistory(symbol: string): Promise<DailyBar[]> {
  try {
    const stooqSymbol = `${symbol.toLowerCase()}.us`
    const url = `${STOOQ_HISTORY}?s=${encodeURIComponent(stooqSymbol)}&i=d`
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) })
    if (!res.ok) return []
    return parseStooqCsv(await res.text())
  } catch {
    return []
  }
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

  const recentReturns = dailyReturns(closes.slice(-31))
  const sd = stdDev(recentReturns)
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
  const maxDrawdown1yPct = maxDrawdown * 100

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
    if (corr !== null && sdA !== null && sdB !== null && sdB > 0) {
      betaVsSpy = corr * (sdA / sdB)
    }
  }

  return { momentum12m1Pct, pctFrom52WeekHigh, volatility30dPct, maxDrawdown1yPct, betaVsSpy, barsAvailable: bars.length }
}

// Benchmark history is shared across every ticker scored in a run, so it's
// cached in-module to avoid refetching SPY once per ticker.
let benchmarkCache: { bars: DailyBar[]; fetchedAt: number } | null = null
const BENCHMARK_TTL_MS = 6 * 60 * 60 * 1000

export async function getBenchmarkHistory(): Promise<DailyBar[]> {
  if (benchmarkCache && Date.now() - benchmarkCache.fetchedAt < BENCHMARK_TTL_MS) {
    return benchmarkCache.bars
  }
  const bars = await fetchDailyHistory("spy")
  if (bars.length > 0) benchmarkCache = { bars, fetchedAt: Date.now() }
  return bars
}

// Generic series metrics for crypto, which supplies its own close series
// (CoinGecko market_chart) rather than a Stooq CSV.
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
