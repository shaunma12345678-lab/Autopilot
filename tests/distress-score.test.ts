// Signal stacking — DISTRESSED_LEAD_ENGINE_SPEC.md §3.
//
// The engine's whole claim is that a score means "several independent pieces of
// evidence point the same way". These tests defend that claim against the three
// ways it quietly stops being true: one event described twice, a stale filing
// scored as if it were fresh, and an undated record treated as current.
import { describe, it, expect } from "vitest"
import {
  scoreDistress, scoreLeadDistress, detectSignals, decayFactor,
  SIGNAL_RULES, UNDATED_SIGNAL_FACTOR, SIGNAL_FLOOR_POINTS,
  type DetectedSignal,
} from "@/lib/distress-score"

const NOW = new Date("2026-09-22T00:00:00Z")
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString()

describe("stacking is the point", () => {
  it("adds independent signals", () => {
    const r = scoreDistress([
      { type: "NOD", date: daysAgo(10) },
      { type: "TAX_DELINQUENT_2YR", date: daysAgo(10) },
      { type: "VACANT", date: daysAgo(10) },
    ], NOW)
    expect(r.score).toBe(40 + 25 + 20)
    expect(r.stackCount).toBe(3)
  })

  it("caps at 100 and says the raw total was higher", () => {
    // §3.2 Example A: 40 + 25 + 20 + 15 + 10 = 110.
    const r = scoreDistress([
      { type: "NOD", date: daysAgo(5) },
      { type: "TAX_DELINQUENT_2YR", date: daysAgo(5) },
      { type: "VACANT", date: daysAgo(5) },
      { type: "EXPIRED_LISTING", date: daysAgo(5) },
      { type: "MECHANICS_LIEN", date: daysAgo(5) },
    ], NOW)
    expect(r.score).toBe(100)
    expect(r.tier).toBe("CRITICAL")
    expect(r.summary).toContain("capped at 100")
  })

  it("leaves a lone ordinary signal low", () => {
    const r = scoreDistress([{ type: "ABSENTEE", date: daysAgo(5) }], NOW)
    expect(r.tier).toBe("MONITOR")
  })

  it("reports nothing rather than zero-with-confidence when there are no signals", () => {
    const r = scoreDistress([], NOW)
    expect(r.score).toBe(0)
    expect(r.summary).toContain("No live distress signals")
  })
})

describe("one event must not score twice", () => {
  it("does not let a sheriff sale count as a trustee sale as well", () => {
    // Dakota County arrives as foreclosureStage NOTICE_OF_SALE *and* the text
    // "Sheriff sale scheduled", which scored 50 + 40 = 90 CRITICAL off one
    // courthouse date. They are two names for the same event.
    const r = scoreDistress([
      { type: "NOTS", date: daysAgo(3) },
      { type: "SHERIFF_SALE", date: daysAgo(3) },
    ], NOW)
    expect(r.score).toBe(50)
    expect(r.stackCount).toBe(1)
  })

  it("keeps only the strongest tax-arrears signal", () => {
    const r = scoreDistress([
      { type: "TAX_DELINQUENT_2YR", date: daysAgo(3) },
      { type: "TAX_DELINQUENT_4YR", date: daysAgo(3) },
    ], NOW)
    expect(r.score).toBe(SIGNAL_RULES.TAX_DELINQUENT_4YR.points)
  })

  it("does not double-count vacancy confirmed two ways", () => {
    const r = scoreDistress([
      { type: "VACANT", date: daysAgo(3) },
      { type: "UTILITY_SHUTOFF", date: daysAgo(3) },
    ], NOW)
    expect(r.stackCount).toBe(1)
  })

  it("treats the same signal from two sources as one piece of evidence", () => {
    const r = scoreDistress([
      { type: "NOD", date: daysAgo(90), source: "aggregator" },
      { type: "NOD", date: daysAgo(3), source: "county recorder" },
    ], NOW)
    expect(r.stackCount).toBe(1)
    // And corroboration improves the DATE rather than the points.
    expect(r.signals[0].ageDays).toBe(3)
  })

  it("still stacks genuinely different filings", () => {
    // A notice of default and a tax lien are separate facts about one owner.
    const r = scoreDistress([
      { type: "NOD", date: daysAgo(3) },
      { type: "IRS_LIEN", date: daysAgo(3) },
    ], NOW)
    expect(r.stackCount).toBe(2)
  })
})

describe("age is scored, not ignored", () => {
  it("halves a signal at one half-life", () => {
    expect(decayFactor(365, 365)).toBeCloseTo(0.5, 5)
    expect(decayFactor(0, 365)).toBe(1)
  })

  it("never decays a signal the spec marks permanent", () => {
    expect(decayFactor(5000, null)).toBe(1)
    const r = scoreDistress([{ type: "NOD", date: daysAgo(900) }], NOW)
    expect(r.score).toBe(40)
  })

  it("drops a signal that has decayed into noise", () => {
    // A utility shutoff has a 30-day half-life; after a year it is nothing.
    const r = scoreDistress([{ type: "UTILITY_SHUTOFF", date: daysAgo(365) }], NOW)
    expect(r.signals).toHaveLength(0)
    expect(r.expired).toHaveLength(1)
    expect(r.summary).toContain("This was a lead once")
  })

  it("keeps a signal still above the floor", () => {
    const r = scoreDistress([{ type: "PROBATE", date: daysAgo(365) }], NOW)
    expect(r.signals[0].points).toBeGreaterThanOrEqual(SIGNAL_FLOOR_POINTS)
    expect(r.signals[0].points).toBeLessThan(SIGNAL_RULES.PROBATE.points)
    expect(r.signals[0].decayed).toBe(true)
  })
})

describe("an undated record is not a current one", () => {
  it("discounts a signal whose date the source did not publish", () => {
    const r = scoreDistress([{ type: "NOD", date: null }], NOW)
    expect(r.score).toBe(Math.round(40 * UNDATED_SIGNAL_FACTOR))
    expect(r.signals[0].dated).toBe(false)
    expect(r.signals[0].basis).toContain("rather than assumed current")
  })

  it("prefers a dated instance over an undated one", () => {
    const r = scoreDistress([
      { type: "NOD", date: null, source: "registry" },
      { type: "NOD", date: daysAgo(4), source: "recorder" },
    ], NOW)
    expect(r.signals[0].dated).toBe(true)
  })
})

describe("reading signals off a real lead", () => {
  it("reads the structured stage rather than only the text", () => {
    const signals = detectSignals({ foreclosureStage: "NOTICE_OF_DEFAULT", recordingDate: daysAgo(5) })
    expect(signals.map(s => s.type)).toContain("NOD")
  })

  it("reads our own open-data phrasing", () => {
    const signals = detectSignals({
      rawSignals: ["Tax delinquent (open data)", "Vacant / abandoned (open data)"],
      recordingDate: daysAgo(5),
    })
    const types = signals.map(s => s.type)
    expect(types).toContain("TAX_DELINQUENT_2YR")
    expect(types).toContain("VACANT")
  })

  it("does not read a tax deed sale as ordinary arrears", () => {
    const types = detectSignals({ rawSignals: ["Tax deed / forfeited land (open data)"] }).map(s => s.type)
    expect(types).toContain("TAX_DEED_SALE")
    expect(types).not.toContain("TAX_DELINQUENT_2YR")
  })

  it("treats an estate vesting name as a probate signal", () => {
    // Often the only probate evidence a county publishes.
    const types = detectSignals({ ownerName: "ESTATE OF MARGARET R HOLLOWAY" }).map(s => s.type)
    expect(types).toContain("PROBATE")
  })

  it("keeps only the stronger tax signal when years are known", () => {
    const types = detectSignals({
      rawSignals: ["Tax delinquent (open data)"], taxYearsDelinquent: 5,
    }).map(s => s.type)
    expect(types).toContain("TAX_DELINQUENT_4YR")
    expect(types).not.toContain("TAX_DELINQUENT_2YR")
  })

  it("scores a real Dakota County sheriff-sale row once", () => {
    const r = scoreLeadDistress({
      foreclosureStage: "NOTICE_OF_SALE",
      recordingDate: daysAgo(20),
      rawSignals: ["Sheriff sale scheduled (Dakota County MN)", "Sale amount $158,586"],
    }, NOW)
    expect(r.score).toBe(50)
    expect(r.stackCount).toBe(1)
  })

  it("routes by the best priority tier present", () => {
    const r = scoreDistress([
      { type: "ABSENTEE", date: daysAgo(3) },
      { type: "NOD", date: daysAgo(3) },
    ], NOW)
    expect(r.priorityTier).toBe(1)
  })
})
