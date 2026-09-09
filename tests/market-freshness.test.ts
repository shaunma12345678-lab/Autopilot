// Freshness — the test that matters is that a refresh loop falling behind looks
// DIFFERENT from one that is working. Both produce a full screen of assets and
// scores; the only difference is the age of the numbers underneath, which is
// invisible unless something measures it.
import { describe, it, expect } from "vitest"
import { assessFreshness } from "@/lib/market-freshness"

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000)

describe("a loop that is keeping up", () => {
  it("reports healthy when most rows were scored inside the window", () => {
    const r = assessFreshness("crypto", Array.from({ length: 10 }, () => hoursAgo(2)))
    expect(r.status).toBe("healthy")
    expect(r.freshPct).toBe(100)
    expect(r.stale).toBe(0)
  })

  it("tolerates a minority being older", () => {
    const rows = [...Array.from({ length: 7 }, () => hoursAgo(2)),
                  ...Array.from({ length: 3 }, () => hoursAgo(30))]
    expect(assessFreshness("crypto", rows).status).toBe("healthy")
  })
})

describe("a loop that is falling behind", () => {
  it("is flagged when under sixty percent is fresh", () => {
    const rows = [...Array.from({ length: 4 }, () => hoursAgo(2)),
                  ...Array.from({ length: 6 }, () => hoursAgo(30))]
    const r = assessFreshness("crypto", rows)
    expect(r.status).toBe("falling-behind")
    expect(r.note).toContain("queue is longer")
  })

  it("is called stalled when almost nothing is fresh", () => {
    const rows = Array.from({ length: 10 }, () => hoursAgo(200))
    const r = assessFreshness("crypto", rows)
    expect(r.status).toBe("stalled")
    expect(r.stale).toBe(10)
  })

  it("counts rows that were never scored at all", () => {
    // The bulk universe ingest creates rows with market data only. A pile of
    // those is the signature of enrichment never reaching them.
    const r = assessFreshness("crypto", [hoursAgo(1), null, null, null])
    expect(r.neverScored).toBe(3)
    expect(r.status).toBe("stalled")
    expect(r.note).toContain("never been scored at all")
  })
})

describe("windows differ by domain", () => {
  it("gives stocks a longer window than crypto", () => {
    const rows = Array.from({ length: 10 }, () => hoursAgo(18))
    // 18h is stale for crypto's 12h window and fresh for the stock 24h one.
    expect(assessFreshness("crypto", rows).fresh).toBe(0)
    expect(assessFreshness("stocks", rows).fresh).toBe(10)
  })
})

describe("reporting the numbers", () => {
  it("reports the oldest and median ages", () => {
    const r = assessFreshness("stocks", [hoursAgo(1), hoursAgo(5), hoursAgo(100)])
    expect(r.oldestHours).toBeGreaterThan(99)
    expect(r.medianAgeHours).toBeGreaterThan(4.9)
    expect(r.medianAgeHours).toBeLessThan(5.1)
  })

  it("says so plainly when nothing is tracked", () => {
    const r = assessFreshness("stocks", [])
    expect(r.status).toBe("no-data")
    expect(r.tracked).toBe(0)
    expect(r.oldestHours).toBeNull()
  })

  it("does not crash on an unparseable timestamp", () => {
    const r = assessFreshness("stocks", ["not a date"])
    expect(r.neverScored).toBe(1)
  })
})
