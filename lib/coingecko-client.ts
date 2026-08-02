// CoinGecko free-tier client — raw market data only (price/volume/market
// cap/supply). This is commodity data; CoinGecko already aggregates hundreds
// of exchanges, so we consume it rather than rebuild it. The proprietary part
// of this vertical is lib/crypto-scoring.ts, not this file.
//
// Free tier rate limit is modest and CoinGecko changes it periodically — we
// throttle conservatively rather than assume a specific number.
const BASE = "https://api.coingecko.com/api/v3"

let lastRequestAt = 0
async function throttledFetch(url: string): Promise<Response> {
  const now = Date.now()
  const wait = Math.max(0, lastRequestAt + 2000 - now)
  if (wait > 0) await new Promise(r => setTimeout(r, wait))
  lastRequestAt = Date.now()
  const headers: Record<string, string> = { Accept: "application/json" }
  if (process.env.COINGECKO_API_KEY) headers["x-cg-demo-api-key"] = process.env.COINGECKO_API_KEY
  return fetch(url, { headers, signal: AbortSignal.timeout(10000) })
}

export interface CoinSearchResult {
  coingeckoId: string
  symbol: string
  name: string
}

export async function searchCoin(query: string): Promise<CoinSearchResult | null> {
  try {
    const res = await throttledFetch(`${BASE}/search?query=${encodeURIComponent(query)}`)
    if (!res.ok) return null
    const data = await res.json()
    const coins = data?.coins as Array<{ id: string; symbol: string; name: string; market_cap_rank: number | null }> | undefined
    if (!coins || coins.length === 0) return null
    // Prefer an exact symbol match, then fall back to the highest-ranked result
    const exact = coins.find(c => c.symbol.toLowerCase() === query.toLowerCase())
    const best = exact ?? coins.sort((a, b) => (a.market_cap_rank ?? 99999) - (b.market_cap_rank ?? 99999))[0]
    return { coingeckoId: best.id, symbol: best.symbol.toUpperCase(), name: best.name }
  } catch {
    return null
  }
}

export interface CoinMarketData {
  priceUsd: number | null
  volume24hUsd: number | null
  marketCapUsd: number | null
  marketCapRank: number | null
  priceChange24hPct: number | null
  priceChange7dPct: number | null
  circulatingSupply: number | null
  totalSupply: number | null
  maxSupply: number | null
  fdvUsd: number | null
  githubRepoUrl: string | null
  platforms: Record<string, string> | null
}

export async function getCoinMarketData(coingeckoId: string): Promise<CoinMarketData | null> {
  try {
    const res = await throttledFetch(
      `${BASE}/coins/${encodeURIComponent(coingeckoId)}?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=false`
    )
    if (!res.ok) return null
    const data = await res.json()
    const md = data?.market_data
    if (!md) return null

    const circulatingSupply = md.circulating_supply ?? null
    const totalSupply = md.total_supply ?? null
    const maxSupply = md.max_supply ?? null
    const priceUsd = md.current_price?.usd ?? null

    // Fully diluted valuation: CoinGecko supplies it directly when it can, but
    // it's frequently absent — fall back to price × max/total supply so the
    // dilution-overhang criterion isn't silently lost.
    const reportedFdv = md.fully_diluted_valuation?.usd ?? null
    const supplyForFdv = maxSupply ?? totalSupply
    const fdvUsd = reportedFdv ?? (priceUsd !== null && supplyForFdv ? priceUsd * supplyForFdv : null)

    // `platforms` maps chain slug -> contract address; only present for tokens,
    // absent/empty for native L1 coins.
    const rawPlatforms = data?.platforms as Record<string, string> | undefined
    const platforms = rawPlatforms
      ? Object.fromEntries(Object.entries(rawPlatforms).filter(([, addr]) => typeof addr === "string" && addr.length > 0))
      : null

    return {
      priceUsd,
      volume24hUsd: md.total_volume?.usd ?? null,
      marketCapUsd: md.market_cap?.usd ?? null,
      marketCapRank: md.market_cap_rank ?? null,
      priceChange24hPct: md.price_change_percentage_24h ?? null,
      priceChange7dPct: md.price_change_percentage_7d ?? null,
      circulatingSupply,
      totalSupply,
      maxSupply,
      fdvUsd,
      githubRepoUrl: data?.links?.repos_url?.github?.[0] ?? null,
      platforms: platforms && Object.keys(platforms).length > 0 ? platforms : null,
    }
  } catch {
    return null
  }
}

// Daily close series (up to 365 days on the free tier) for self-computed
// volatility, drawdown, and BTC correlation.
export async function getCoinPriceHistory(coingeckoId: string, days = 365): Promise<number[]> {
  try {
    const res = await throttledFetch(
      `${BASE}/coins/${encodeURIComponent(coingeckoId)}/market_chart?vs_currency=usd&days=${days}&interval=daily`
    )
    if (!res.ok) return []
    const data = await res.json()
    const prices = data?.prices
    if (!Array.isArray(prices)) return []
    return prices
      .map((p: [number, number]) => (Array.isArray(p) ? p[1] : NaN))
      .filter((n: number) => isFinite(n) && n > 0)
  } catch {
    return []
  }
}

// BTC history is the correlation benchmark for every coin scored in a run, so
// it's cached in-module rather than refetched per asset.
let btcHistoryCache: { closes: number[]; fetchedAt: number } | null = null
const BTC_HISTORY_TTL_MS = 6 * 60 * 60 * 1000

export async function getBtcHistory(): Promise<number[]> {
  if (btcHistoryCache && Date.now() - btcHistoryCache.fetchedAt < BTC_HISTORY_TTL_MS) {
    return btcHistoryCache.closes
  }
  const closes = await getCoinPriceHistory("bitcoin")
  if (closes.length > 0) btcHistoryCache = { closes, fetchedAt: Date.now() }
  return closes
}
