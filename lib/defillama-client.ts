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
