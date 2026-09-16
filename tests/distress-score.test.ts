// Signal stacking — DISTRESSED_LEAD_ENGINE_SPEC.md §3.
//
// The idea the engine rests on: one signal is noise, three on the same parcel
// is a motivated seller. These tests protect the three things that make that
// true rather than merely plausible — signals add, old signals fade, and the
// same event reported twice counts once.
import { describe, it, expect } from "vitest"
import {
  scoreDistress, scoreLeadDistress, detectSignals, decayFactor,
  SIGNAL_RULES, UNDATED_SIGNAL_FACTOR, type DetectedSignal,
} from "@/lib/distress-score"

const NOW = new Date("2026-09-15T00:00:00Z")
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString()

describe("signals stack", () => {
  it("adds independent evidence rather than taking the strongest", () => {
    // Spec §3.2 Example A: NOD 40 + tax 25 + vacant 20 + expired 15 + lien 10.
    const s = scoreDistress([
      { type: "NOD", date: daysAgo(10) },
      { type: "TAX_DELINQUENT_2YR", date: daysAgo(30) },
      { type: "VACANT", date: daysAgo(10) },
      { type: "EXPIRED_LISTING", date: daysAgo(20) },
      { type: "MECHANICS_LIEN", date: daysAgo(40) },
    ], NOW)
    expect(s.score).toBe(100)          // raw 110, capped
    expect(s.tier).toBe("CRITICAL")
    expect(s.stackCount).toBe(5)
    expect(s.summary).toContain("capped at 100")
  })

  it("leaves a single ordinary signal well down the list", () => {
    // Absentee alone is 10 points. It is a reason to look, not to call.
    const s = scoreDistress([{ type: "ABSENTEE", date: daysAgo(5) }], NOW)
    expect(s.score).toBe(10)
    expect(s.tier).toBe("MONITOR")
  })

  it("reproduces the spec's early-warning example", () => {
    // §3.2 Example B: absentee 10 + code violation 15 = 25, MONITOR.
    const s = scoreDistress([
      { type: "ABSENTEE", date: daysAgo(5) },
      { type: "CODE_VIOLATION", date: daysAgo(5) },
    ], NOW)
    expect(s.score).toBe(25)
    expect(s.tier).toBe("MONITOR")
  })

  it("puts a notice of trustee sale at the top, as the most urgent filing", () => {
    expect(SIGNAL_RULES.NOTS.points).toBeGreaterThan(SIGNAL_RULES.NOD.points)
    expect(SIGNAL_RULES.NOTS.tier).toBe(1)
  })
})

describe("signals fade", () => {
  it("halves a decaying signal at its half-life", () => {
    expect(decayFactor(180, 180)).toBeCloseTo(0.5, 5)
    expect(decayFactor(360, 180)).toBeCloseTo(0.25, 5)
  })

  it("never fades a filing that does not expire", () => {
    expect(decayFactor(5_000, null)).toBe(1)
  })

  it("stops a four-year-old code violation from scoring like a current one", () => {
    const fresh = scoreDistress([{ type: "CODE_VIOLATION", date: daysAgo(1) }], NOW)
    const old = scoreDistress([{ type: "CODE_VIOLATION", date: daysAgo(4 * 365) }], NOW)
    expect(fresh.score).toBe(15)
    expect(old.score).toBeLessThan(3)
  })

  it("drops a signal that has decayed into noise rather than counting it", () => {
    // Otherwise a stale lead looks substantiated by "five signals".
    const s = scoreDistress([
      { type: "UTILITY_SHUTOFF", date: daysAgo(400) },
      { type: "NOD", date: daysAgo(10) },
    ], NOW)
    expect(s.stackCount).toBe(1)
    expect(s.expired.map(e => e.type)).toContain("UTILITY_SHUTOFF")
  })
})

describe("an undated signal is not assumed current", () => {
  it("scores it at a discount rather than at full weight", () => {
    const s = scoreDistress([{ type: "NOD", date: null }], NOW)
    expect(s.score).toBe(Math.round(40 * UNDATED_SIGNAL_FACTOR))
    expect(s.signals[0].dated).toBe(false)
    expect(s.signals[0].basis).toContain("no date published")
  })

  it("still ranks it below the same signal known to be fresh", () => {
    const dated = scoreDistress([{ type: "NOD", date: daysAgo(1) }], NOW)
    const undated = scoreDistress([{ type: "NOD", date: null }], NOW)
    expect(undated.score).toBeLessThan(dated.score)
  })
})

describe("the same event reported twice counts once", () => {
  it("does not let three aggregators manufacture a CRITICAL lead", () => {
    const repeated: DetectedSignal[] = [
      { type: "NOD", date: daysAgo(10), source: "county" },
      { type: "NOD", date: daysAgo(12), source: "aggregator A" },
      { type: "NOD", date: daysAgo(30), source: "aggregator B" },
    ]
    const s = scoreDistress(repeated, NOW)
    expect(s.score).toBe(40)
    expect(s.stackCount).toBe(1)
  })

  it("keeps the freshest instance, so corroboration improves the date", () => {
    const s = scoreDistress([
      { type: "CODE_VIOLATION", date: daysAgo(500), source: "old" },
      { type: "CODE_VIOLATION", date: daysAgo(5), source: "fresh" },
    ], NOW)
    expect(s.signals[0].source).toBe("fresh")
  })

  it("prefers a dated instance over an undated one", () => {
    const s = scoreDistress([
      { type: "NOD", date: null, source: "undated" },
      { type: "NOD", date: daysAgo(3), source: "dated" },
    ], NOW)
    expect(s.signals[0].dated).toBe(true)
  })
})

describe("reading signals off the leads we actually produce", () => {
  it("recognises our own open-data signal phrasing", () => {
    const types = detectSignals({
      rawSignals: ["Tax delinquent (open data)", "Vacant / abandoned (open data)"],
      recordingDate: daysAgo(20),
    }).map(s => s.type)
    expect(types).toContain("TAX_DELINQUENT_2YR")
    expect(types).toContain("VACANT")
  })

  it("does not read a tax DEED sale as a mere delinquency", () => {
    const types = detectSignals({ rawSignals: ["Tax deed / forfeited land (open data)"] }).map(s => s.type)
    expect(types).toContain("TAX_DEED_SALE")
    expect(types).not.toContain("TAX_DELINQUENT_2YR")
  })

  it("reads the structured stage, not just the text", () => {
    const types = detectSignals({ foreclosureStage: "NOTICE_OF_DEFAULT" }).map(s => s.type)
    expect(types).toContain("NOD")
  })

  it("treats an estate vesting name as a probate signal", () => {
    // Often the only probate evidence a county publishes.
    const types = detectSignals({ ownerName: "ESTATE OF MARGARET H COLE" }).map(s => s.type)
    expect(types).toContain("PROBATE")
  })

  it("counts four years of arrears once, at the higher weight", () => {
    const types = detectSignals({
      rawSignals: ["Tax delinquent (open data)"], taxYearsDelinquent: 5,
    }).map(s => s.type)
    expect(types).toContain("TAX_DELINQUENT_4YR")
    expect(types).not.toContain("TAX_DELINQUENT_2YR")
  })

  it("scores a real stacked lead end to end", () => {
    const s = scoreLeadDistress({
      rawSignals: ["Registered foreclosure — lender filed a notice of default", "Vacant / abandoned (open data)"],
      recordingDate: daysAgo(15),
      occupancy: "vacant",
      ownerIsAbsentee: true,
    }, NOW)
    expect(s.score).toBe(70)          // NOD 40 + vacant 20 + absentee 10
    expect(s.tier).toBe("MEDIUM")
    expect(s.priorityTier).toBe(1)
  })

  it("returns an honest zero when nothing points anywhere", () => {
    const s = scoreLeadDistress({ rawSignals: ["Redfin active listing"] }, NOW)
    expect(s.score).toBe(0)
    expect(s.summary).toContain("No live distress signals")
  })
})
