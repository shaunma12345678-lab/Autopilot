// Market-wide percentiles from SEC frames. throttledFetch is mocked so these
// never touch the network; the frame JSON shape ({data:[{cik,val}]}) mirrors
// what data.sec.gov/api/xbrl/frames actually returns.
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/edgar-client", () => ({ throttledFetch: vi.fn() }))
import { throttledFetch } from "@/lib/edgar-client"
import { getMarketContext, __resetFrameCacheForTests } from "@/lib/market-percentile"

function frameResponse(entries: Array<{ cik: number; val: number }>) {
  return { ok: true, json: async () => ({ data: entries }) }
}

// 120 synthetic filers so every frame clears the 100-reporter floor.
function makeRevenueEntries(): Array<{ cik: number; val: number }> {
  return Array.from({ length: 120 }, (_, i) => ({ cik: 1000 + i, val: 1_000_000 * (i + 1) }))
}

describe("getMarketContext — scale percentiles", () => {
  beforeEach(() => { vi.mocked(throttledFetch).mockReset(); __resetFrameCacheForTests() })

  it("ranks revenue against the real frame distribution", async () => {
    const revenue = makeRevenueEntries()
    vi.mocked(throttledFetch).mockResolvedValue(frameResponse(revenue) as never)

    const result = await getMarketContext({ revenueTtm: 60_000_000 }) // matches cik index 59 -> ~50th pctile
    const rev = result.percentiles.find(p => p.concept === "Revenues")
    expect(rev).toBeDefined()
    expect(rev!.peerCount).toBe(120)
    expect(rev!.percentile).toBeGreaterThan(40)
    expect(rev!.percentile).toBeLessThan(60)
  })

  it("returns no percentile when the frame has too few reporters", async () => {
    const thin = Array.from({ length: 10 }, (_, i) => ({ cik: i, val: i * 1000 }))
    vi.mocked(throttledFetch).mockResolvedValue(frameResponse(thin) as never)

    const result = await getMarketContext({ revenueTtm: 5000 })
    expect(result.percentiles.find(p => p.concept === "Revenues")).toBeUndefined()
  })

  it("skips a concept entirely when the input value is null", async () => {
    vi.mocked(throttledFetch).mockResolvedValue(frameResponse(makeRevenueEntries()) as never)
    const result = await getMarketContext({ revenueTtm: null })
    expect(result.percentiles.find(p => p.concept === "Revenues")).toBeUndefined()
  })
})

describe("getMarketContext — margin percentiles (frames joined by CIK)", () => {
  beforeEach(() => { vi.mocked(throttledFetch).mockReset(); __resetFrameCacheForTests() })

  it("computes a real net margin percentile from two joined frames", async () => {
    // 150 filers, net margin = 10% for every one of them except our test case.
    const revenueEntries = Array.from({ length: 150 }, (_, i) => ({ cik: i, val: 100 }))
    const incomeEntries = Array.from({ length: 150 }, (_, i) => ({ cik: i, val: 10 })) // 10% margin

    vi.mocked(throttledFetch).mockImplementation(async (url: string) => {
      if (url.includes("/Revenues/")) return frameResponse(revenueEntries) as never
      if (url.includes("/NetIncomeLoss/")) return frameResponse(incomeEntries) as never
      return { ok: false } as never
    })

    // Our own margin (25%) sits well above the 10% peer margin.
    const result = await getMarketContext({ netMarginPct: 25 })
    expect(result.netMarginPercentile).not.toBeNull()
    expect(result.netMarginPercentile!).toBeGreaterThan(90)
    expect(result.netMarginPeerCount).toBe(150)
    expect(result.reasons.some(r => r.includes("Net margin ranks"))).toBe(true)
  })

  it("only joins filers present in BOTH frames, not the union", async () => {
    // Revenue frame has ciks 0-149; income frame only has ciks 0-119 —
    // margins should only be computed for the 120 that overlap.
    const revenueEntries = Array.from({ length: 150 }, (_, i) => ({ cik: i, val: 100 }))
    const incomeEntries = Array.from({ length: 120 }, (_, i) => ({ cik: i, val: 5 }))

    vi.mocked(throttledFetch).mockImplementation(async (url: string) => {
      if (url.includes("/Revenues/")) return frameResponse(revenueEntries) as never
      if (url.includes("/NetIncomeLoss/")) return frameResponse(incomeEntries) as never
      return { ok: false } as never
    })

    const result = await getMarketContext({ netMarginPct: 5 })
    expect(result.netMarginPeerCount).toBe(120)
  })

  it("returns null when the joined sample is too small", async () => {
    const thin = Array.from({ length: 20 }, (_, i) => ({ cik: i, val: 100 }))
    vi.mocked(throttledFetch).mockResolvedValue(frameResponse(thin) as never)

    const result = await getMarketContext({ netMarginPct: 10 })
    expect(result.netMarginPercentile).toBeNull()
    expect(result.netMarginPeerCount).toBeNull()
  })

  it("does not compute a margin percentile when netMarginPct isn't supplied", async () => {
    vi.mocked(throttledFetch).mockResolvedValue(frameResponse(makeRevenueEntries()) as never)
    const result = await getMarketContext({})
    expect(result.netMarginPercentile).toBeNull()
  })
})
