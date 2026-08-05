// CoinGecko free-tier client — raw market data only (price/volume/market
// cap/supply). This is commodity data; CoinGecko already aggregates hundreds
// of exchanges, so we consume it rather than rebuild it. The proprietary part
// of this vertical is lib/crypto-scoring.ts, not this file.
//
// Free tier rate limit is modest and CoinGecko changes it periodically — we
// throttle conservatively rather than assume a specific number.
const BASE = "https://api.coingecko.com/api/v3"

// CoinGecko's free tier throttles hard and answers 429 in bursts. Crucially,
// a 429 must NEVER be reported as "coin not found" — that turns a transient
// rate limit into a false claim that a real asset doesn't exist. Verified:
// bulk seeding produced 21 "not found" failures for coins whose endpoints
// return 200 when queried individually.
let lastRequestAt = 0
const MIN_REQUEST_GAP_MS = 3000
const RETRY_BACKOFF_MS = [0, 6000, 15000]

async function throttledFetch(url: string): Promise<Response> {
  for (let attempt = 0; attempt < RETRY_BACKOFF_MS.length; attempt++) {
    if (RETRY_BACKOFF_MS[attempt] > 0) await new Promise(r => setTimeout(r, RETRY_BACKOFF_MS[attempt]))

    const gap = Math.max(0, lastRequestAt + MIN_REQUEST_GAP_MS - Date.now())
    if (gap > 0) await new Promise(r => setTimeout(r, gap))
    lastRequestAt = Date.now()

    const headers: Record<string, string> = { Accept: "application/json" }
    if (process.env.COINGECKO_API_KEY) headers["x-cg-demo-api-key"] = process.env.COINGECKO_API_KEY

    const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) })
    if (res.status !== 429 && res.status < 500) return res
    if (attempt === RETRY_BACKOFF_MS.length - 1) return res
  }
  // Unreachable, but keeps the return type honest.
  return fetch(url, { signal: AbortSignal.timeout(15000) })
}

export interface CoinSearchResult {
  coingeckoId: string
  symbol: string
  name: string
}

// Looks like a CoinGecko id already (lowercase, dashes, no spaces)?
function looksLikeCoingeckoId(q: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(q) && q.length > 2
}

export async function searchCoin(query: string): Promise<CoinSearchResult | null> {
  // Resolving a known id through /search wastes a request against a tight rate
  // limit, so try the id directly first.
  //
  // CRITICAL: if the direct lookup fails for a TRANSIENT reason (rate limit,
  // server error) we must return null rather than falling through to fuzzy
  // search. Fuzzy search on an exact id can silently return a DIFFERENT asset —
  // seeding "ripple" during a rate-limit burst resolved to RLUSD (Ripple's
  // stablecoin) instead of XRP and wrote the wrong asset to the database.
  // Returning nothing is recoverable; returning the wrong coin is not.
  if (looksLikeCoingeckoId(query)) {
    try {
      const res = await throttledFetch(`${BASE}/coins/${encodeURIComponent(query)}?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=false&market_data=false`)
      if (res.ok) {
        const d = await res.json()
        if (d?.id && d?.symbol) {
          return { coingeckoId: d.id, symbol: String(d.symbol).toUpperCase(), name: d.name ?? d.id }
        }
      }
      // 404 means it genuinely isn't an id — a free-text query like "ethereum
      // classic" can still be searched. Anything else is transient: bail out.
      if (res.status !== 404) return null
    } catch {
      return null // network failure — do not risk a fuzzy substitution
    }
  }

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
