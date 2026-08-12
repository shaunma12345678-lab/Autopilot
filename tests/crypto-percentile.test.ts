// Crypto's own-sample percentile — mocked prisma, never touches the network
// or a real database.
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/prisma", () => ({ prisma: { cryptoAsset: { findMany: vi.fn() } } }))
import { prisma } from "@/lib/prisma"
import { getRevenueYieldPercentile } from "@/lib/crypto-percentile"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const findMany = (prisma.cryptoAsset as any).findMany as ReturnType<typeof vi.fn>

function makeRows(n: number, yieldPct: number) {
  // marketCapUsd=1000, protocolRevenue30dUsd chosen so annualized yield hits
  // the target: (rev*12/mcap)*100 = yieldPct  =>  rev = yieldPct*mcap/1200
  const rev = (yieldPct * 1000) / 1200
  return Array.from({ length: n }, () => ({ protocolRevenue30dUsd: rev, marketCapUsd: 1000 }))
}

describe("getRevenueYieldPercentile", () => {
  beforeEach(() => findMany.mockReset())

  it("returns null below the minimum peer floor", async () => {
    findMany.mockResolvedValueOnce(makeRows(10, 5))
    const result = await getRevenueYieldPercentile(5)
    expect(result).toBeNull()
  })

  it("ranks a high yield near the top against a real peer distribution", async () => {
    // 50 peers all yielding 2%, one page (under PAGE=1000 so no second fetch).
    findMany.mockResolvedValueOnce(makeRows(50, 2))
    const result = await getRevenueYieldPercentile(20) // far above every peer
    expect(result).not.toBeNull()
    expect(result!.peerCount).toBe(50)
    expect(result!.percentile).toBe(100)
  })

  it("ranks a below-peer yield near the bottom", async () => {
    findMany.mockResolvedValueOnce(makeRows(50, 10))
    const result = await getRevenueYieldPercentile(0.1)
    expect(result!.percentile).toBeLessThan(10)
  })

  it("ignores rows with a zero or missing market cap rather than dividing by zero", async () => {
    const rows = [
      ...makeRows(30, 5),
      { protocolRevenue30dUsd: 100, marketCapUsd: 0 },
      { protocolRevenue30dUsd: 100, marketCapUsd: null },
    ]
    findMany.mockResolvedValueOnce(rows)
    const result = await getRevenueYieldPercentile(5)
    expect(result!.peerCount).toBe(30)
  })

  it("paginates past the 1,000-row PostgREST page cap instead of silently truncating", async () => {
    findMany
      .mockResolvedValueOnce(makeRows(1000, 3)) // full page — triggers a second fetch
      .mockResolvedValueOnce(makeRows(200, 3))  // partial page — stops pagination
    const result = await getRevenueYieldPercentile(3)
    expect(result!.peerCount).toBe(1200)
    expect(findMany).toHaveBeenCalledTimes(2)
  })

  it("returns null cleanly when the query throws rather than propagating", async () => {
    findMany.mockRejectedValueOnce(new Error("db unreachable"))
    const result = await getRevenueYieldPercentile(5)
    expect(result).toBeNull()
  })
})
