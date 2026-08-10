// Falsification conditions — "what would change my mind" as checkable
// thresholds. checkFalsified is what makes these a commitment rather than
// decoration: it must correctly detect when a PRIOR condition has since
// tripped against FRESH data.
import { describe, it, expect } from "vitest"
import { buildFalsificationSet, checkFalsified } from "@/lib/falsification"

// Every thesis-breaking condition set comfortably clear of its trigger
// (>=40% headroom on each), so the aggregate case reads as "robust".
const soundInputs = {
  qualityScore: 90, valuationScore: 90, valuationPercentile: 90,
  piotroskiScore: 9, riskScore: 30, altmanZone: "safe",
  fcfYieldPct: 6, freeCashFlowTtm: 200_000_000,
  goingConcernHits: 0, hasRestatement: false, shortTrend: "stable",
  revenueGrowthYoyPct: 10,
}

describe("buildFalsificationSet", () => {
  it("a robust case has all conditions sitting well clear of their triggers", () => {
    const result = buildFalsificationSet(soundInputs)
    expect(result.fragility).toBe("robust")
    expect(result.nearestTrigger).not.toBeNull()
  })

  it("a case near its valuation threshold is flagged as fragile", () => {
    const result = buildFalsificationSet({ ...soundInputs, valuationScore: 56 })
    expect(result.fragility).toBe("fragile")
    expect(result.nearestTrigger?.field).toBe("valuationScore")
  })

  it("negative free cash flow has zero headroom (already at the trigger)", () => {
    const result = buildFalsificationSet({ ...soundInputs, freeCashFlowTtm: -1 })
    const fcf = result.conditions.find(c => c.field === "freeCashFlowTtm")
    expect(fcf?.headroomPct).toBe(0)
  })
})

describe("checkFalsified — the deterministic re-check", () => {
  it("nothing triggers when fresh data matches the prior sound state", () => {
    const prior = buildFalsificationSet(soundInputs).conditions
    const result = checkFalsified(prior, soundInputs)
    expect(result.stillValid).toBe(true)
    expect(result.triggered).toHaveLength(0)
  })

  it("detects a thesis-breaking condition that has since tripped", () => {
    const prior = buildFalsificationSet(soundInputs).conditions
    const degraded = { ...soundInputs, piotroskiScore: 3, qualityScore: 40 }
    const result = checkFalsified(prior, degraded)
    expect(result.stillValid).toBe(false)
    expect(result.triggered.some(t => t.field === "piotroskiScore")).toBe(true)
    expect(result.triggered.some(t => t.field === "qualityScore")).toBe(true)
  })

  it("a binary fact (restatement filed) triggers becomes_true correctly", () => {
    const prior = buildFalsificationSet(soundInputs).conditions
    const result = checkFalsified(prior, { ...soundInputs, hasRestatement: true })
    expect(result.triggered.some(t => t.field === "hasRestatement")).toBe(true)
    expect(result.stillValid).toBe(false)
  })

  it("a material (not thesis-breaking) trigger alone does not flip stillValid", () => {
    const prior = buildFalsificationSet(soundInputs).conditions
    // riskScore rising above 55 is "material", not "thesis_breaking".
    const result = checkFalsified(prior, { ...soundInputs, riskScore: 60 })
    expect(result.triggered.some(t => t.field === "riskScore")).toBe(true)
    expect(result.stillValid).toBe(true)
  })
})
