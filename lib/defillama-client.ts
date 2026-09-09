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

export interface ProtocolListEntry {
  slug: string
  name: string
  symbol?: string
  /** DefiLlama's family marker, e.g. "parent#uniswap" for Uniswap V2/V3/V4. */
  parent?: string | null
  tvl?: number | null
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
    protocolListCache = data.map((p: {
      slug?: string; name?: string; symbol?: string; parentProtocol?: string; tvl?: number | null
    }) => ({
      slug: p.slug ?? "", name: p.name ?? "", symbol: p.symbol,
      parent: p.parentProtocol ?? null,
      tvl: typeof p.tvl === "number" ? p.tvl : null,
    })).filter(p => p.slug)
    protocolListCachedAt = Date.now()
    return protocolListCache
  } catch {
    return protocolListCache ?? []
  }
}

/**
 * Every DefiLlama protocol belonging to one project.
 *
 * WHY THIS IS NOT A SINGLE LOOKUP. DefiLlama lists protocols by VERSION, not by
 * project. There is no protocol called "Uniswap" — there are Uniswap V1 through
 * V4, grouped under `parent#uniswap`. An exact name-or-symbol match therefore
 * returned null for Uniswap, Curve, Optimism and Arbitrum, which meant no
 * revenue and no unlock schedule for four of the largest protocols in DeFi. It
 * returned a result for Aave and Lido only by coincidence: their token symbol
 * happens to equal the query, or their DefiLlama name happens to have no version
 * suffix. Nothing distinguished the coincidences from the failures.
 *
 * A project's real figures are the sum across its versions, so the whole family
 * is returned rather than one arbitrary member.
 *
 * Pure and exported so it can be tested against a fixed list, no network.
 */
// Where the coin's name and DefiLlama's project name genuinely differ. Kept
// deliberately short: this is for real mismatches, not a substitute for the
// matching rules below.
const PROJECT_ALIASES: Record<string, string> = {
  "curve dao": "curve-finance",
  "curve dao token": "curve-finance",
  "avalanche": "avalanche",
  "binance coin": "bnb-chain",
  "bnb": "bnb-chain",
  "matic network": "polygon",
  "wrapped bitcoin": "wbtc",
  "the graph": "the-graph",
  "maker": "makerdao",
  "sky": "sky-lending",
  "pancakeswap token": "pancakeswap",
  "gmx": "gmx",
}

export function selectProtocolFamily(
  list: ProtocolListEntry[],
  nameOrSymbol: string,
): { primary: string | null; slugs: string[] } {
  const q = nameOrSymbol.trim().toLowerCase()
  if (!q) return { primary: null, slugs: [] }

  const byTvl = (a: ProtocolListEntry, b: ProtocolListEntry) => (b.tvl ?? 0) - (a.tvl ?? 0)
  const familyOf = (entry: ProtocolListEntry): ProtocolListEntry[] =>
    entry.parent ? list.filter(p => p.parent === entry.parent) : [entry]

  // 0. A known name difference between the coin and the project.
  const alias = PROJECT_ALIASES[q]
  if (alias) {
    const aliased = list.filter(p => p.parent === `parent#${alias}`).sort(byTvl)
    if (aliased.length) return { primary: aliased[0].slug, slugs: aliased.map(p => p.slug) }
    const direct = list.filter(p => p.slug === alias).sort(byTvl)
    if (direct.length) return { primary: direct[0].slug, slugs: direct.map(p => p.slug) }
  }

  // 1. An exact name match is unambiguous ("Lido").
  const exactName = list.filter(p => p.name.toLowerCase() === q).sort(byTvl)[0]
  if (exactName) {
    const family = familyOf(exactName).sort(byTvl)
    return { primary: family[0].slug, slugs: family.map(p => p.slug) }
  }

  // 2. The family marker itself: "uniswap" -> parent#uniswap.
  const slug = q.replace(/\s+/g, "-")
  const byParent = list.filter(p => p.parent === `parent#${slug}`).sort(byTvl)
  if (byParent.length) return { primary: byParent[0].slug, slugs: byParent.map(p => p.slug) }

  // 3. Ticker match. Several versions share one symbol, so this is a family too.
  const bySymbol = list.filter(p => p.symbol?.toLowerCase() === q).sort(byTvl)
  if (bySymbol.length) {
    const family = bySymbol[0].parent ? familyOf(bySymbol[0]).sort(byTvl) : bySymbol
    return { primary: family[0].slug, slugs: family.map(p => p.slug) }
  }

  // 4. "Uniswap" against "Uniswap V3". A word boundary is required so that
  //    "Curve" does not swallow "CrossCurve".
  const prefixed = list.filter(p => {
    const name = p.name.toLowerCase()
    return name.startsWith(`${q} `) || name === q
  }).sort(byTvl)
  if (prefixed.length) {
    const family = prefixed[0].parent ? familyOf(prefixed[0]).sort(byTvl) : prefixed
    return { primary: family[0].slug, slugs: family.map(p => p.slug) }
  }

  return { primary: null, slugs: [] }
}

export async function resolveProtocolSlug(nameOrSymbol: string): Promise<string | null> {
  const list = await getProtocolList()
  return selectProtocolFamily(list, nameOrSymbol).primary
}

/** Every version of a project, for figures that should be summed across them. */
export async function resolveProtocolFamily(nameOrSymbol: string): Promise<string[]> {
  const list = await getProtocolList()
  return selectProtocolFamily(list, nameOrSymbol).slugs
}

// Uniswap's revenue is V2 plus V3 plus V4. Reading one version understates a
// project by however much the others earn, which for Uniswap is most of it.
export async function getFamilyRevenue30d(slugs: string[]): Promise<number | null> {
  if (slugs.length === 0) return null
  const parts = await Promise.all(slugs.slice(0, 8).map(s => getProtocolRevenue30d(s).catch(() => null)))
  const present = parts.filter((v): v is number => typeof v === "number")
  return present.length ? present.reduce((a, b) => a + b, 0) : null
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

/**
 * The next scheduled token unlock.
 *
 * DefiLlama moved emissions behind a paid plan: every /emissions request now
 * answers 402. Returning null for that would be a lie of the worst kind here —
 * "no upcoming unlock" and "we are not allowed to look" are opposite facts, and
 * a VC cliff is one of the strongest sell signals in the framework this scores
 * against. So a paywall throws, which records as a source FAILURE in coverage
 * and shows up as an alarm, rather than quietly reading as "this token has no
 * unlocks scheduled".
 */
export class UnlockDataUnavailable extends Error {}

export async function getNextUnlock(slug: string): Promise<UpcomingUnlock | null> {
  try {
    const res = await fetch(`${BASE}/emissions/${encodeURIComponent(slug)}`, { signal: AbortSignal.timeout(10000) })
    if (res.status === 402) {
      throw new UnlockDataUnavailable(
        "DefiLlama emissions require a paid plan (402) — unlock schedules are unmeasured, not absent",
      )
    }
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
  } catch (error) {
    if (error instanceof UnlockDataUnavailable) throw error
    return null
  }
}
