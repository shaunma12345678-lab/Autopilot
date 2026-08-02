// Real orderbook depth — how much USD it takes to move the price 2%.
//
// Why this matters more than the 24h-volume metric: reported crypto volume is
// widely wash-traded and trivially inflated, while resting orderbook depth
// costs real capital to fake. It's the honest read on whether a position can
// actually be exited.
//
// Exchange choice is a deployment constraint, not a preference: Binance blocks
// requests from US IP ranges ("Service unavailable from a restricted location"),
// and Vercel functions run in US regions by default — so a Binance-backed
// implementation would silently return null in production forever. Coinbase
// Exchange is the primary (US-based, free, keyless, deep majors) with Kraken as
// fallback for assets Coinbase doesn't list.
//
// Coverage limit, surfaced honestly: assets listed on neither venue return null,
// and the scorer treats that as missing data rather than as thin liquidity.

export interface DepthResult {
  bidDepth2PctUsd: number
  askDepth2PctUsd: number
  totalDepth2PctUsd: number
  midPrice: number
  venue: "coinbase" | "kraken"
}

type Level = [string, string, ...unknown[]]

// Sums resting order value within 2% of mid on both sides of the book.
function sumWithin2Pct(bids: Level[], asks: Level[], venue: DepthResult["venue"]): DepthResult | null {
  if (bids.length === 0 || asks.length === 0) return null

  const bestBid = Number(bids[0][0])
  const bestAsk = Number(asks[0][0])
  if (!isFinite(bestBid) || !isFinite(bestAsk) || bestBid <= 0 || bestAsk <= 0) return null

  const midPrice = (bestBid + bestAsk) / 2
  const lowerBound = midPrice * 0.98
  const upperBound = midPrice * 1.02

  let bidDepth2PctUsd = 0
  for (const [priceStr, sizeStr] of bids) {
    const price = Number(priceStr), size = Number(sizeStr)
    if (!isFinite(price) || !isFinite(size)) continue
    if (price < lowerBound) break // bids descend
    bidDepth2PctUsd += price * size
  }

  let askDepth2PctUsd = 0
  for (const [priceStr, sizeStr] of asks) {
    const price = Number(priceStr), size = Number(sizeStr)
    if (!isFinite(price) || !isFinite(size)) continue
    if (price > upperBound) break // asks ascend
    askDepth2PctUsd += price * size
  }

  if (bidDepth2PctUsd === 0 && askDepth2PctUsd === 0) return null

  return {
    bidDepth2PctUsd,
    askDepth2PctUsd,
    totalDepth2PctUsd: bidDepth2PctUsd + askDepth2PctUsd,
    midPrice,
    venue,
  }
}

async function fetchCoinbaseDepth(symbol: string): Promise<DepthResult | null> {
  try {
    const product = `${symbol.toUpperCase()}-USD`
    const res = await fetch(
      `https://api.exchange.coinbase.com/products/${encodeURIComponent(product)}/book?level=2`,
      { headers: { Accept: "application/json", "User-Agent": "AutoPilot/1.0" }, signal: AbortSignal.timeout(8000) }
    )
    // 404 means the pair isn't listed — a normal outcome, not an error.
    if (!res.ok) return null
    const data = await res.json()
    const bids = Array.isArray(data?.bids) ? data.bids as Level[] : []
    const asks = Array.isArray(data?.asks) ? data.asks as Level[] : []
    return sumWithin2Pct(bids, asks, "coinbase")
  } catch {
    return null
  }
}

async function fetchKrakenDepth(symbol: string): Promise<DepthResult | null> {
  try {
    const pair = `${symbol.toUpperCase()}USD`
    const res = await fetch(
      `https://api.kraken.com/0/public/Depth?pair=${encodeURIComponent(pair)}&count=500`,
      { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) }
    )
    if (!res.ok) return null
    const data = await res.json()
    if (Array.isArray(data?.error) && data.error.length > 0) return null

    // Kraken keys the result by its own normalized pair name (e.g. XETHZUSD),
    // so read the first entry rather than guessing the key.
    const result = data?.result
    if (!result || typeof result !== "object") return null
    const book = Object.values(result)[0] as { bids?: Level[]; asks?: Level[] } | undefined
    if (!book) return null

    return sumWithin2Pct(book.bids ?? [], book.asks ?? [], "kraken")
  } catch {
    return null
  }
}

export async function fetchOrderbookDepth(symbol: string): Promise<DepthResult | null> {
  const coinbase = await fetchCoinbaseDepth(symbol)
  if (coinbase) return coinbase
  return fetchKrakenDepth(symbol)
}
