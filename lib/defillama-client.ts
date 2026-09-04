// DefiLlama free public API client — protocol revenue (our crypto
// "dividend equivalent") and token-unlock schedules.
//
// Honesty note (flagged in the plan, not discovered late): DefiLlama's exact
// endpoint shapes are not something we've verified against a live response
// during this build — every call here is defensive and degrades to null on
// any unexpected shape or 404, rather than assuming the schema is stable.
// A token simply not having this data lowers its dataCompletenessPct and
// gets quality-gated accordingly, which is the correct behavior either way —
// this file being wrong about a field name should never crash scoring.
const BASE = "https://api.llama.fi"

interface ProtocolListEntry {
  slug: string
  name: string
  symbol?: string
}

let protocolListCache: ProtocolListEntry[] | null = null
let protocolListCachedAt = 0
const PROTOCOL_LIST_TTL_MS = 24 * 60 * 60 * 1000

async function getProtocolList(): Promise<ProtocolListEntry[]> {
  if (protocolListCache && Date.now() - protocolListCachedAt < PROTOCOL_LIST_TTL_MS) {
    return protocolListCache
  }
  try {
    const res = await fetch(`${BASE}/protocols`, { signal: AbortSignal.timeout(10000) })
    if (!res.ok) return protocolListCache ?? []
    const data = await res.json()
    if (!Array.isArray(data)) return protocolListCache ?? []
    protocolListCache = data.map((p: { slug?: string; name?: string; symbol?: string }) => ({
      slug: p.slug ?? "", name: p.name ?? "", symbol: p.symbol,
    })).filter(p => p.slug)
    protocolListCachedAt = Date.now()
    return protocolListCache
  } catch {
    return protocolListCache ?? []
  }
}

export async function resolveProtocolSlug(nameOrSymbol: string): Promise<string | null> {
  const list = await getProtocolList()
  const q = nameOrSymbol.toLowerCase()
  const match = list.find(p => p.symbol?.toLowerCase() === q || p.name.toLowerCase() === q)
  return match?.slug ?? null
}

export async function getProtocolRevenue30d(slug: string): Promise<number | null> {
  try {
    const res = await fetch(`${BASE}/summary/fees/${encodeURIComponent(slug)}?dataType=dailyRevenue`, {
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return null
    const data = await res.json()
    const total30d = data?.total30d
    return typeof total30d === "number" ? total30d : null
  } catch {
    return null
  }
}

/**
 * Total Value Locked — capital users have actually deposited into the protocol.
 *
 * The single best adoption metric in DeFi and the one that most cleanly
 * separates a working protocol from a token with a chart. Trading volume can be
 * wash-traded and social metrics can be botted; TVL is money sitting in
 * contracts that anyone can verify on-chain.
 *
 * Returns null for assets DefiLlama does not track as a protocol at all —
 * which is itself informative, and is treated as "no TVL" rather than
 * "unmeasured" by the scorer.
 */
export async function getProtocolTvl(slug: string): Promise<number | null> {
  try {
    const res = await fetch(`${BASE}/tvl/${encodeURIComponent(slug)}`, {
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return null
    const value = await res.json()
    return typeof value === "number" && isFinite(value) && value >= 0 ? value : null
  } catch {
    return null
  }
}

/**
 * Chain-level TVL. Layer 1s are not "protocols" in DefiLlama's model — asking
 * /tvl/polkadot returns "Protocol not found" — so every L1 was being recorded
 * as having no locked capital while Ethereum alone holds tens of billions.
 * Chains live on a separate endpoint entirely.
 */
let _chainCache: { at: number; map: Map<string, number> } | null = null
const CHAIN_TTL_MS = 15 * 60 * 1000

export async function getChainTvl(nameOrSymbol: string): Promise<number | null> {
  try {
    if (!_chainCache || Date.now() - _chainCache.at > CHAIN_TTL_MS) {
      const res = await fetch(`${BASE}/v2/chains`, { signal: AbortSignal.timeout(12000) })
      if (!res.ok) return null
      const rows = await res.json() as Array<{ name?: string; tokenSymbol?: string; tvl?: number }>
      const map = new Map<string, number>()
      for (const r of rows) {
        if (typeof r.tvl !== "number") continue
        if (r.name) map.set(r.name.toLowerCase(), r.tvl)
        if (r.tokenSymbol) map.set(r.tokenSymbol.toLowerCase(), r.tvl)
      }
      _chainCache = { at: Date.now(), map }
    }
    return _chainCache.map.get(nameOrSymbol.toLowerCase()) ?? null
  } catch {
    return null
  }
}

/** Protocol TVL first, then chain TVL — an asset is one or the other, and
 *  which one is not knowable in advance from the ticker alone. */
export async function getAnyTvl(slug: string | null, name: string, symbol: string): Promise<number | null> {
  if (slug) {
    const protocolTvl = await getProtocolTvl(slug)
    if (protocolTvl !== null && protocolTvl > 0) return protocolTvl
  }
  return (await getChainTvl(name)) ?? (await getChainTvl(symbol))
}

export interface UpcomingUnlock {
  date: string
  pctOfSupply: number
}

export async function getNextUnlock(slug: string): Promise<UpcomingUnlock | null> {
  try {
    const res = await fetch(`${BASE}/emissions/${encodeURIComponent(slug)}`, { signal: AbortSignal.timeout(10000) })
    if (!res.ok) return null
    const data = await res.json()
    const events = data?.events
    if (!Array.isArray(events) || events.length === 0) return null

    const now = Date.now() / 1000
    const upcoming = events
      .filter((e: { timestamp?: number }) => typeof e.timestamp === "number" && e.timestamp > now)
      .sort((a: { timestamp: number }, b: { timestamp: number }) => a.timestamp - b.timestamp)[0]
    if (!upcoming || typeof upcoming.timestamp !== "number") return null

    const pct = typeof upcoming.noOfTokens?.[0] === "number" && typeof data?.totalLocked === "number" && data.totalLocked > 0
      ? (upcoming.noOfTokens[0] / data.totalLocked) * 100
      : null
    if (pct === null) return null

    return { date: new Date(upcoming.timestamp * 1000).toISOString(), pctOfSupply: pct }
  } catch {
    return null
  }
}
