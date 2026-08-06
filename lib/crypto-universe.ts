// Bulk crypto universe ingestion + DefiLlama-based discovery.
//
// THE PROBLEM THIS SOLVES: the per-asset pipeline makes roughly four CoinGecko
// calls per coin (resolve, market data, price history, benchmark), and the free
// tier needs a ~3s gap between requests. That's 12+ seconds per asset, so
// seeding 250 coins one at a time takes the better part of an hour and mostly
// re-fetches data that is available in bulk.
//
// CoinGecko's /coins/markets returns 250 fully-populated assets in ONE call —
// price, market cap, rank, FDV, volume, supply. Four calls covers a thousand
// coins in seconds. Verified live.
//
// So the architecture mirrors the stock side: a cheap bulk pass establishes the
// universe, and a separate enrichment pass does the expensive per-asset work
// (contract security, protocol revenue, dev activity, orderbook depth).
//
// CRITICAL CONFIDENCE RULE: a bulk-ingested asset has market data but none of
// the criteria that actually differentiate assets. Left alone it would report
// "high" confidence — the core gate only checks liquidity, momentum and rank —
// and flood Top Picks with shallow reads. So bulk rows are explicitly capped at
// "low" confidence until enrichment fills in security/revenue/dev, which keeps
// them out of the ranked lists until they've earned a place.
import { prisma } from "@/lib/prisma"

const CG_BASE = "https://api.coingecko.com/api/v3"
const LLAMA_PROTOCOLS = "https://api.llama.fi/protocols"

let lastRequestAt = 0
async function throttled(url: string): Promise<Response> {
  const gap = Math.max(0, lastRequestAt + 3000 - Date.now())
  if (gap > 0) await new Promise(r => setTimeout(r, gap))
  lastRequestAt = Date.now()
  const headers: Record<string, string> = { Accept: "application/json" }
  if (process.env.COINGECKO_API_KEY) headers["x-cg-demo-api-key"] = process.env.COINGECKO_API_KEY
  return fetch(url, { headers, signal: AbortSignal.timeout(20000) })
}

interface MarketRow {
  id: string
  symbol: string
  name: string
  current_price: number | null
  market_cap: number | null
  market_cap_rank: number | null
  fully_diluted_valuation: number | null
  total_volume: number | null
  circulating_supply: number | null
  max_supply: number | null
  price_change_percentage_24h: number | null
}


// QUALITY GATE — bulk endpoints hand back plenty of rows that are not
// investable assets at all, and letting them in would dilute every ranking:
//
//   • STABLECOINS are engineered to sit at $1.00. Scoring them on "momentum"
//     or "price percentile" is meaningless — a stablecoin doing its job has
//     zero return by construction. USDT, USDC, DAI, USDe, FDUSD and friends.
//   • WRAPPED AND LIQUID-STAKING DERIVATIVES (WBTC, WETH, stETH, cbETH, rETH)
//     are claims on another asset. Their fundamentals are the underlying's, so
//     including both double-counts the same exposure.
//   • DUST — sub-$5M market cap or negligible volume can't be entered or
//     exited at the displayed price, so a "good score" there isn't actionable.
const MIN_MARKET_CAP_USD = 5_000_000
const MIN_VOLUME_USD = 250_000

function isInvestableAsset(r: MarketRow): boolean {
  const sym = (r.symbol ?? "").toUpperCase()
  const name = (r.name ?? "").toLowerCase()

  // Stablecoins and tokenized-treasury products. Both a price condition and a
  // naming condition are required so a genuine token that happens to trade near
  // a dollar isn't cut.
  //
  // The band is deliberately wider than a strict peg: YIELD-BEARING stables
  // (Ondo's USDY, for one) drift steadily ABOVE $1 as they accrue interest, so
  // a 0.9-1.1 window lets them through. They're fixed-income instruments, and
  // scoring them on price momentum is meaningless.
  const priced = r.current_price
  const inStableBand = priced !== null && priced > 0.5 && priced < 2.0
  const stableNamed = /^(USD|EUR|GBP)|USD$|^(DAI|USDT|USDC|USDE|FDUSD|PYUSD|TUSD|BUSD)$/.test(sym)
    || /stablecoin|dollar|tether|treasury|yield/.test(name)
  if (inStableBand && stableNamed) return false

  // Wrapped / bridged / liquid-staking derivatives of another asset.
  if (/^(W|ST|CB|R|WST|BEAM)?(BTC|ETH)$/.test(sym) && sym !== "BTC" && sym !== "ETH") return false
  if (/wrapped|staked|bridged|liquid staking|restaked/.test(name)) return false
  if (/^(WBTC|WETH|STETH|WSTETH|CBETH|RETH|WBETH|SOLVBTC|LBTC)$/.test(sym)) return false

  // Too small or too illiquid to act on.
  if ((r.market_cap ?? 0) < MIN_MARKET_CAP_USD) return false
  if ((r.total_volume ?? 0) < MIN_VOLUME_USD) return false

  return true
}

export interface UniverseRun {
  fetched: number
  created: number
  updated: number
  filtered: number
  pages: number
  errors: string[]
}

export async function ingestCryptoUniverse(pages = 2): Promise<UniverseRun> {
  const run: UniverseRun = { fetched: 0, created: 0, updated: 0, filtered: 0, pages: 0, errors: [] }

  for (let page = 1; page <= pages; page++) {
    try {
      const url = `${CG_BASE}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=${page}&sparkline=false`
      const res = await throttled(url)
      if (!res.ok) { run.errors.push(`page ${page}: HTTP ${res.status}`); continue }

      const rows = await res.json() as MarketRow[]
      if (!Array.isArray(rows) || rows.length === 0) break
      run.pages++
      run.fetched += rows.length

      for (const r of rows) {
        if (!r.id || !r.symbol) continue
        if (!isInvestableAsset(r)) { run.filtered++; continue }
        try {
          const circulatingSupplyPct = r.max_supply && r.max_supply > 0 && r.circulating_supply
            ? (r.circulating_supply / r.max_supply) * 100 : null
          const fdvToMcapRatio = r.fully_diluted_valuation && r.market_cap && r.market_cap > 0
            ? r.fully_diluted_valuation / r.market_cap : null

          const marketFields = {
            symbol: r.symbol.toUpperCase(),
            name: r.name,
            marketCapRank: r.market_cap_rank,
            priceUsd: r.current_price,
            marketCapUsd: r.market_cap,
            volume24hUsd: r.total_volume,
            priceChange24hPct: r.price_change_percentage_24h,
            circulatingSupplyPct,
            fdvUsd: r.fully_diluted_valuation,
            fdvToMcapRatio,
          }

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const existing = await (prisma.cryptoAsset as any).findFirst({ where: { coingeckoId: r.id } })

          if (existing) {
            // Refresh market data but never downgrade an already-enriched row.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (prisma.cryptoAsset as any).update({ where: { id: existing.id }, data: marketFields })
            run.updated++
          } else {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (prisma.cryptoAsset as any).create({
              data: {
                coingeckoId: r.id,
                ...marketFields,
                // Explicitly low until enrichment runs — see the header note.
                dataConfidence: "low",
                dataCompletenessPct: 35,
                qualityReasons: ["Market data only — contract security, protocol revenue and developer activity haven't been analyzed yet."],
              },
            })
            run.created++
          }
        } catch { /* one bad row shouldn't abort the page */ }
      }
    } catch (err) {
      run.errors.push(`page ${page}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return run
}

// Assets most worth the expensive enrichment pass: never-enriched first
// (securityScore null), then stalest, and bigger market caps ahead of dust.
export async function nextCryptoToEnrich(limit: number): Promise<string[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const unenriched = await (prisma.cryptoAsset as any).findMany({
    where: { lastScoredAt: null },
    orderBy: { marketCapRank: "asc" },
    take: limit,
  }) as Array<{ coingeckoId: string }>

  if (unenriched.length >= limit) return unenriched.map(a => a.coingeckoId)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stale = await (prisma.cryptoAsset as any).findMany({
    orderBy: { lastScoredAt: "asc" },
    take: limit - unenriched.length,
  }) as Array<{ coingeckoId: string }>

  return [...unenriched.map(a => a.coingeckoId), ...stale.map(a => a.coingeckoId)]
}

interface LlamaProtocol {
  name?: string
  symbol?: string
  tvl?: number
  change_7d?: number
  gecko_id?: string | null
}

export interface CryptoDiscoveryRun {
  scanned: number
  created: number
  errors: string[]
}

// Discovery for crypto: protocols with real, sizeable TVL that aren't in the
// tracked universe yet. TVL is capital other people have actually committed —
// a far better starting filter than market cap alone, which can be pure
// narrative on a thin float.
const MIN_TVL_USD = 25_000_000

export async function discoverCryptoFromDefiLlama(limit = 40): Promise<CryptoDiscoveryRun> {
  const run: CryptoDiscoveryRun = { scanned: 0, created: 0, errors: [] }
  try {
    const res = await fetch(LLAMA_PROTOCOLS, { signal: AbortSignal.timeout(30000) })
    if (!res.ok) { run.errors.push(`protocols: HTTP ${res.status}`); return run }

    const protocols = await res.json() as LlamaProtocol[]
    if (!Array.isArray(protocols)) return run

    const candidates = protocols
      .filter(p => p.gecko_id && (p.tvl ?? 0) >= MIN_TVL_USD)
      .sort((a, b) => (b.tvl ?? 0) - (a.tvl ?? 0))
    run.scanned = candidates.length

    for (const p of candidates.slice(0, limit)) {
      const geckoId = p.gecko_id as string
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const existing = await (prisma.cryptoAsset as any).findFirst({ where: { coingeckoId: geckoId } })
        if (existing) continue

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (prisma.cryptoAsset as any).create({
          data: {
            coingeckoId: geckoId,
            symbol: (p.symbol ?? geckoId).toUpperCase(),
            name: p.name ?? geckoId,
            dataConfidence: "low",
            dataCompletenessPct: 20,
            qualityReasons: [
              `Surfaced by protocol TVL of $${Math.round((p.tvl ?? 0) / 1e6)}M — capital actually committed to the protocol. Not yet analyzed.`,
            ],
          },
        })
        run.created++
      } catch { /* skip and continue */ }
    }
  } catch (err) {
    run.errors.push(err instanceof Error ? err.message : String(err))
  }
  return run
}
