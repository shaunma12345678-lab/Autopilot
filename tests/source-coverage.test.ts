// Source coverage — the test that matters is the one proving a BROKEN source is
// told apart from an asset that genuinely has no data for that field. Those look
// identical on any single call, which is exactly why TVL read as zero for every
// layer-1 for as long as it did.
import { describe, it, expect } from "vitest"
import {
  newCoverage, track, summarize, aggregate, brokenSources, coverageAlarms,
  MIN_ATTEMPTS_TO_JUDGE, type CoverageLog,
} from "@/lib/source-coverage"

async function logFor(subject: string, outcomes: Array<[string, "ok" | "empty" | "failed" | "skipped"]>) {
  const log = newCoverage(subject)
  for (const [source, outcome] of outcomes) {
    if (outcome === "skipped") {
      await track(log, source, async () => "unused", { skip: true })
    } else if (outcome === "failed") {
      await track(log, source, async () => { throw new Error("upstream 503") })
    } else if (outcome === "empty") {
      await track(log, source, async () => null)
    } else {
      await track(log, source, async () => ({ value: 1 }))
    }
  }
  return log
}

describe("recording one call", () => {
  it("returns the value and records success", async () => {
    const log = newCoverage("BTC")
    const value = await track(log, "defillama:tvl", async () => ({ tvl: 42 }))
    expect(value).toEqual({ tvl: 42 })
    expect(log.attempts[0].outcome).toBe("ok")
  })

  it("swallows a failure exactly as the raw catch did, but writes it down", async () => {
    const log = newCoverage("BTC")
    const value = await track(log, "defillama:tvl", async () => { throw new Error("connect ETIMEDOUT") })
    // Behaviour must be unchanged: one flaky provider cannot break an analysis.
    expect(value).toBeNull()
    expect(log.attempts[0].outcome).toBe("failed")
    expect(log.attempts[0].error).toContain("ETIMEDOUT")
  })

  it("separates 'reached it and it had nothing' from 'could not reach it'", async () => {
    const log = newCoverage("BTC")
    await track(log, "a", async () => null)
    await track(log, "b", async () => [])
    await track(log, "c", async () => { throw new Error("boom") })
    expect(log.attempts.map(a => a.outcome)).toEqual(["empty", "empty", "failed"])
  })

  it("records a skipped source without calling it", async () => {
    const log = newCoverage("BTC")
    let called = false
    const value = await track(log, "defillama:revenue", async () => { called = true; return 1 }, { skip: true })
    expect(called).toBe(false)
    expect(value).toBeNull()
    expect(log.attempts[0].outcome).toBe("skipped")
  })

  it("honours a custom emptiness test", async () => {
    const log = newCoverage("BTC")
    await track(log, "tvl", async () => 0, { empty: v => v === 0 })
    expect(log.attempts[0].outcome).toBe("empty")
  })
})

describe("summarising one asset", () => {
  it("counts each outcome and scores completeness over calls actually made", async () => {
    const log = await logFor("BTC", [
      ["a", "ok"], ["b", "ok"], ["c", "empty"], ["d", "failed"], ["e", "skipped"],
    ])
    const s = summarize(log)
    expect({ ok: s.ok, empty: s.empty, failed: s.failed, skipped: s.skipped })
      .toEqual({ ok: 2, empty: 1, failed: 1, skipped: 1 })
    // Skipped calls are excluded: 2 of the 4 attempted returned data.
    expect(s.completenessPct).toBe(50)
    expect(s.failedSources).toEqual(["d"])
  })

  it("does not divide by zero when everything was skipped", async () => {
    const s = summarize(await logFor("BTC", [["a", "skipped"]]))
    expect(s.completenessPct).toBe(0)
  })
})

describe("telling a broken source from an asset with no data", () => {
  async function runOver(count: number, outcome: "ok" | "empty" | "failed"): Promise<CoverageLog[]> {
    const logs: CoverageLog[] = []
    for (let i = 0; i < count; i++) logs.push(await logFor(`ASSET${i}`, [["defillama:tvl", outcome]]))
    return logs
  }

  it("calls a source broken when it fails on essentially every asset", async () => {
    const health = aggregate(await runOver(10, "failed"))[0]
    expect(health.status).toBe("broken")
    expect(health.note).toContain("This is the source, not the assets")
  })

  it("calls a source broken when it always answers with nothing", async () => {
    // The quiet failure: every call succeeds, every call is empty. This is the
    // shape the layer-1 TVL bug had, and it is invisible on any single asset.
    const health = aggregate(await runOver(10, "empty"))[0]
    expect(health.status).toBe("broken")
    expect(health.note).toContain("wrong question")
  })

  it("leaves a source healthy when only some assets lack the field", async () => {
    const logs: CoverageLog[] = []
    for (let i = 0; i < 10; i++) {
      logs.push(await logFor(`ASSET${i}`, [["defillama:tvl", i < 4 ? "empty" : "ok"]]))
    }
    const health = aggregate(logs)[0]
    expect(health.status).toBe("healthy")
  })

  it("flags partial failure as degraded rather than broken", async () => {
    const logs: CoverageLog[] = []
    for (let i = 0; i < 10; i++) {
      logs.push(await logFor(`ASSET${i}`, [["coingecko:market", i < 5 ? "failed" : "ok"]]))
    }
    const health = aggregate(logs)[0]
    expect(health.status).toBe("degraded")
    expect(health.note).toContain("rate limiting")
  })

  it("refuses to judge a source on too few calls", async () => {
    const health = aggregate(await runOver(MIN_ATTEMPTS_TO_JUDGE - 1, "failed"))[0]
    expect(health.status).toBe("insufficient-data")
  })

  it("ignores skipped calls when judging, so a gated source is not called broken", async () => {
    const logs: CoverageLog[] = []
    for (let i = 0; i < 10; i++) logs.push(await logFor(`ASSET${i}`, [["onchain:compare", "skipped"]]))
    const health = aggregate(logs)[0]
    expect(health.attempts).toBe(0)
    expect(health.status).toBe("insufficient-data")
  })
})

describe("reporting", () => {
  it("puts the worst sources first", async () => {
    const logs: CoverageLog[] = []
    for (let i = 0; i < 8; i++) {
      logs.push(await logFor(`ASSET${i}`, [
        ["healthy-one", "ok"],
        ["broken-one", "failed"],
        ["degraded-one", i < 4 ? "failed" : "ok"],
      ]))
    }
    const order = aggregate(logs).map(h => h.status)
    expect(order[0]).toBe("broken")
    expect(order[order.length - 1]).toBe("healthy")
  })

  it("raises an alarm line only for sources that need attention", async () => {
    const logs: CoverageLog[] = []
    for (let i = 0; i < 8; i++) {
      logs.push(await logFor(`ASSET${i}`, [["healthy-one", "ok"], ["broken-one", "failed"]]))
    }
    const alarms = coverageAlarms(aggregate(logs))
    expect(alarms).toHaveLength(1)
    expect(alarms[0]).toContain("broken-one")
  })

  it("is silent when every source is healthy", async () => {
    const logs: CoverageLog[] = []
    for (let i = 0; i < 8; i++) logs.push(await logFor(`ASSET${i}`, [["fine", "ok"]]))
    expect(coverageAlarms(aggregate(logs))).toEqual([])
    expect(brokenSources(aggregate(logs))).toEqual([])
  })
})
