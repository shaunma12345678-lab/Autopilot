// Live property valuation via RentCast — real AVM + comparable sales + rent.
//
// Activates ONLY when RENTCAST_API_KEY is set (free tier: 50 calls/month at
// rentcast.io). With no key, every function returns null and the caller falls
// back to the existing estimate — so this is purely additive and never breaks.
//
// Because the free quota is small and each call costs latency, valuation is run
// ON DEMAND per lead (via /api/leads/valuation), NOT automatically on every
// bulk search. That keeps searches fast and quota safe.

export interface Comp {
  address:  string
  price:    number
  sqft:     number | null
  soldDate: string | null
}

export interface ValuationResult {
  value:        number          // AVM point estimate
  rangeLow:     number | null
  rangeHigh:    number | null
  confidence:   number          // 0-100, derived from how tight the AVM range is
  rentEstimate: number | null   // monthly long-term rent
  rentToValue:  number | null   // gross annual yield %
  comps:        Comp[]
  source:       string          // "RentCast AVM"
}

const BASE = "https://api.rentcast.io/v1"

export function isValuationConfigured(): boolean {
  return Boolean(process.env.RENTCAST_API_KEY)
}

function buildAddress(p: { address: string; city: string; state: string; zip: string }): string {
  return [p.address, p.city, p.state, p.zip].filter(Boolean).join(", ")
}

// Tighter AVM range ⇒ higher confidence. A ±5% range → ~90, ±25% → ~50.
function confidenceFromRange(value: number, low: number | null, high: number | null): number {
  if (!value || low == null || high == null || high <= low) return 70
  const spread = (high - low) / value
  return Math.max(40, Math.min(95, Math.round(95 - spread * 120)))
}

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

async function rentcastGet(path: string, params: Record<string, string>, signal: AbortSignal): Promise<Record<string, unknown> | null> {
  const key = process.env.RENTCAST_API_KEY
  if (!key) return null
  const qs = new URLSearchParams(params).toString()
  const res = await fetch(`${BASE}${path}?${qs}`, {
    headers: { "X-Api-Key": key, Accept: "application/json" },
    signal,
  })
  if (!res.ok) return null
  return (await res.json()) as Record<string, unknown>
}

/**
 * Fetch a live AVM, comps, and rent estimate for one property.
 * Returns null on any failure or when the API key is absent — callers must treat
 * null as "no live data available, keep the existing estimate".
 */
export async function valuateProperty(
  p: { address: string; city: string; state: string; zip: string },
  timeoutMs = 8000
): Promise<ValuationResult | null> {
  if (!isValuationConfigured()) return null
  if (!p.address?.trim()) return null

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const address = buildAddress(p)

  try {
    const [avm, rent] = await Promise.all([
      rentcastGet("/avm/value", { address }, controller.signal).catch(() => null),
      rentcastGet("/avm/rent/long-term", { address }, controller.signal).catch(() => null),
    ])

    const value = num(avm?.price)
    if (value == null || value <= 0) return null

    const rangeLow  = num(avm?.priceRangeLow)
    const rangeHigh = num(avm?.priceRangeHigh)
    const rentEstimate = num(rent?.rent)

    const rawComps = Array.isArray(avm?.comparables) ? (avm!.comparables as Record<string, unknown>[]) : []
    const comps: Comp[] = rawComps.slice(0, 6).map(c => ({
      address:  String(c.formattedAddress ?? c.address ?? "Comparable sale"),
      price:    num(c.price) ?? 0,
      sqft:     num(c.squareFootage),
      soldDate: typeof c.lastSeenDate === "string" ? c.lastSeenDate.slice(0, 10)
              : typeof c.listedDate  === "string" ? c.listedDate.slice(0, 10) : null,
    })).filter(c => c.price > 0)

    return {
      value,
      rangeLow,
      rangeHigh,
      confidence:   confidenceFromRange(value, rangeLow, rangeHigh),
      rentEstimate,
      rentToValue:  rentEstimate ? Math.round((rentEstimate * 12 / value) * 1000) / 10 : null,
      comps,
      source:       "RentCast AVM",
    }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
