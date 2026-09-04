// Renovation ROI — the tests that matter here are the ones proving the
// property-specific adjustments actually bind. A lookup table would pass a
// "does it return a number" test; these check that the same renovation scores
// DIFFERENTLY on different properties, which is the entire point.
import { describe, it, expect } from "vitest"
import { analyzeRenovationRoi, ceilingFromComps, RENOVATION_CATALOG, type RoiInput } from "@/lib/renovation-roi"

function base(overrides: Partial<RoiInput> = {}): RoiInput {
  return {
    asIsValue: 300_000,
    sqft: 1600,
    neighborhoodCeiling: 450_000,
    condition: "dated",
    description: "kitchen",
    ...overrides,
  }
}

describe("the ceiling constraint — the thing generic calculators miss", () => {
  it("caps value added at what the street supports", () => {
    // Only $10k of headroom: a $27k kitchen cannot return more than that.
    const r = analyzeRenovationRoi(base({ asIsValue: 440_000, neighborhoodCeiling: 450_000, condition: "poor" }))
    expect(r.ok).toBe(true)
    const line = r.lines[0]
    expect(line.valueAdded).toBeLessThanOrEqual(10_000)
    expect(line.valueLostToCeiling).toBeGreaterThan(0)
    expect(line.reasoning.some(x => /ceiling/i.test(x))).toBe(true)
  })

  it("scores the SAME renovation worse on a property near its ceiling", () => {
    const roomy = analyzeRenovationRoi(base({ asIsValue: 250_000, neighborhoodCeiling: 500_000, condition: "poor" }))
    const capped = analyzeRenovationRoi(base({ asIsValue: 440_000, neighborhoodCeiling: 450_000, condition: "poor" }))
    expect(roomy.lines[0].roiPct).toBeGreaterThan(capped.lines[0].roiPct)
  })

  it("warns when the property is already at the ceiling", () => {
    const r = analyzeRenovationRoi(base({ asIsValue: 445_000, neighborhoodCeiling: 450_000 }))
    expect(r.warnings.some(w => /within 5%|ceiling/i.test(w))).toBe(true)
  })

  it("refuses to run without a ceiling rather than inventing one", () => {
    const r = analyzeRenovationRoi(base({ neighborhoodCeiling: 0 }))
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/ceiling/i)
  })
})

describe("the condition baseline", () => {
  it("returns far more on a broken kitchen than an already-good one", () => {
    const poor = analyzeRenovationRoi(base({ condition: "poor" }))
    const good = analyzeRenovationRoi(base({ condition: "good" }))
    expect(poor.lines[0].valueAdded).toBeGreaterThan(good.lines[0].valueAdded * 3)
  })

  it("orders the four conditions monotonically", () => {
    const v = (c: RoiInput["condition"]) => analyzeRenovationRoi(base({ condition: c })).lines[0].valueAdded
    expect(v("poor")).toBeGreaterThan(v("dated"))
    expect(v("dated")).toBeGreaterThan(v("average"))
    expect(v("average")).toBeGreaterThan(v("good"))
  })

  it("exempts table-stakes work from the baseline discount", () => {
    // A roof must be replaced whether or not the rest of the house is pretty.
    const poor = analyzeRenovationRoi(base({ description: "roof", condition: "poor" }))
    const good = analyzeRenovationRoi(base({ description: "roof", condition: "good" }))
    expect(poor.lines[0].valueAdded).toBe(good.lines[0].valueAdded)
  })
})

describe("bracket jumps", () => {
  it("lets adding a bathroom exceed the ceiling, because the comp set changes", () => {
    const r = analyzeRenovationRoi(base({
      description: "add a second bathroom", asIsValue: 445_000, neighborhoodCeiling: 450_000, condition: "poor",
    }))
    const line = r.lines.find(l => l.key === "bath_add")!
    expect(line.valueLostToCeiling).toBe(0)
    expect(line.reasoning.some(x => /bracket jump/i.test(x))).toBe(true)
  })

  it("does NOT exempt an ordinary renovation from the ceiling", () => {
    const r = analyzeRenovationRoi(base({
      description: "kitchen", asIsValue: 445_000, neighborhoodCeiling: 450_000, condition: "poor",
    }))
    expect(r.lines[0].valueLostToCeiling).toBeGreaterThan(0)
  })
})

describe("table stakes", () => {
  it("ranks a roof do-first even when its paper return is negative", () => {
    const r = analyzeRenovationRoi(base({ description: "roof replacement", condition: "good" }))
    const roof = r.lines.find(l => l.key === "roof")!
    expect(roof.verdict).toBe("do_first")
    expect(roof.reasoning.some(x => /financeable|sellable|buyer pool/i.test(x))).toBe(true)
  })
})

describe("holding cost", () => {
  it("reduces net gain in proportion to project duration", () => {
    const noCarry = analyzeRenovationRoi(base({ condition: "poor" }))
    const withCarry = analyzeRenovationRoi(base({ condition: "poor", monthlyCarry: 3000 }))
    expect(withCarry.lines[0].netGain).toBeLessThan(noCarry.lines[0].netGain)
    expect(withCarry.lines[0].holdingCost).toBeGreaterThan(0)
  })

  it("penalises a long project more than a short one at the same carry", () => {
    const short = analyzeRenovationRoi(base({ description: "interior paint", monthlyCarry: 3000 }))
    const long = analyzeRenovationRoi(base({ description: "adu garage conversion", monthlyCarry: 3000 }))
    expect(long.lines[0].holdingCost).toBeGreaterThan(short.lines[0].holdingCost)
  })
})

describe("risk adjustment", () => {
  it("scores high-variance work worse on a risk-adjusted basis", () => {
    const r = analyzeRenovationRoi(base({ description: "foundation repair", condition: "poor" }))
    const line = r.lines[0]
    expect(line.riskAdjustedRoiPct).toBeLessThan(line.roiPct)
    expect(line.costHigh).toBeGreaterThan(line.cost)
    expect(line.confidence).toBe("low")
  })

  it("marks predictable cosmetic work as high confidence", () => {
    const r = analyzeRenovationRoi(base({ description: "interior paint" }))
    expect(r.lines[0].confidence).toBe("high")
  })
})

describe("matching and cost basis", () => {
  it("prefers the specific gut over the generic refresh when both match", () => {
    const r = analyzeRenovationRoi(base({ description: "full kitchen gut" }))
    expect(r.lines.some(l => l.key === "kitchen_major")).toBe(true)
    expect(r.lines.some(l => l.key === "kitchen_minor")).toBe(false)
  })

  it("scales per-square-foot work with house size", () => {
    const small = analyzeRenovationRoi(base({ description: "interior paint", sqft: 1000 }))
    const large = analyzeRenovationRoi(base({ description: "interior paint", sqft: 3000 }))
    expect(large.lines[0].cost).toBeGreaterThan(small.lines[0].cost * 2)
  })

  it("applies the regional cost multiplier", () => {
    const national = analyzeRenovationRoi(base({ costMultiplier: 1.0 }))
    const expensive = analyzeRenovationRoi(base({ costMultiplier: 1.5 }))
    expect(expensive.lines[0].cost).toBeGreaterThan(national.lines[0].cost * 1.4)
  })

  it("handles several renovations in one description", () => {
    const r = analyzeRenovationRoi(base({ description: "kitchen, bathroom and new flooring" }))
    expect(r.lines.length).toBeGreaterThanOrEqual(3)
  })

  it("fails honestly when nothing is recognised", () => {
    const r = analyzeRenovationRoi(base({ description: "install a helipad" }))
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/no recognised renovation/i)
  })
})

describe("headroom is shared between renovations", () => {
  it("gives later renovations less room once earlier ones consume the ceiling", () => {
    const r = analyzeRenovationRoi(base({
      description: "kitchen and bathroom and flooring",
      asIsValue: 420_000, neighborhoodCeiling: 450_000, condition: "poor",
    }))
    // Total value added can never exceed the headroom for non-bracket-jump work.
    expect(r.totalValueAdded).toBeLessThanOrEqual(30_000 + 1)
  })
})

describe("ceilingFromComps", () => {
  it("uses the top of the comp range, not the average", () => {
    const c = ceilingFromComps([{ price: 300_000 }, { price: 400_000 }, { price: 420_000 }])!
    expect(c).toBeGreaterThan(400_000)
  })

  it("blends the top two sales so one outlier cannot set the ceiling", () => {
    const c = ceilingFromComps([{ price: 900_000 }, { price: 400_000 }])!
    expect(c).toBeLessThan(900_000)
    expect(c).toBeGreaterThan(400_000)
  })

  it("falls back to psf when there are no comps", () => {
    expect(ceilingFromComps([], 2000, 250)).toBeGreaterThan(0)
    expect(ceilingFromComps([])).toBeNull()
  })
})

describe("catalog integrity", () => {
  it("every entry has a usable cost basis", () => {
    for (const r of RENOVATION_CATALOG) {
      expect(r.baseCost > 0 || (r.costPerSqft ?? 0) > 0, `${r.key} has no cost basis`).toBe(true)
      expect(r.note.length).toBeGreaterThan(20)
      expect(r.weeks).toBeGreaterThan(0)
    }
  })

  it("has unique keys", () => {
    const keys = RENOVATION_CATALOG.map(r => r.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe("specificity — a broader entry must not double-count a narrower one", () => {
  it("does not bill a bathroom refresh alongside adding a bathroom", () => {
    const r = analyzeRenovationRoi(base({ description: "add a second bathroom" }))
    expect(r.lines.some(l => l.key === "bath_add")).toBe(true)
    expect(r.lines.some(l => l.key === "bath_refresh")).toBe(false)
  })

  it("does not bill paint and flooring separately inside a full cosmetic refresh", () => {
    const r = analyzeRenovationRoi(base({ description: "full cosmetic refresh with paint and new flooring" }))
    expect(r.lines.some(l => l.key === "cosmetic_full")).toBe(true)
    expect(r.lines.some(l => l.key === "paint_interior")).toBe(false)
    expect(r.lines.some(l => l.key === "flooring")).toBe(false)
  })

  it("still bills genuinely separate work separately", () => {
    const r = analyzeRenovationRoi(base({ description: "kitchen and roof and HVAC" }))
    expect(r.lines.length).toBe(3)
  })
})

describe("budget guidance — how much to actually put in", () => {
  it("caps recoverable spend at the headroom", () => {
    const r = analyzeRenovationRoi(base({ asIsValue: 420_000, neighborhoodCeiling: 450_000 }))
    expect(r.budget.maxRecoverableSpend).toBe(30_000)
  })

  it("cuts items that cost more than they return, and says why", () => {
    const r = analyzeRenovationRoi(base({
      description: "full kitchen gut and bathroom",
      asIsValue: 440_000, neighborhoodCeiling: 450_000, condition: "good",
    }))
    expect(r.budget.cutItems.length).toBeGreaterThan(0)
    expect(r.budget.cutItems[0].reason).toMatch(/net loss|cannot be recovered|pushes past/i)
  })

  it("recommends spending less than proposed when items don't pay", () => {
    const r = analyzeRenovationRoi(base({
      description: "full kitchen gut and bathroom and flooring",
      asIsValue: 440_000, neighborhoodCeiling: 450_000, condition: "good",
    }))
    expect(r.budget.recommendedSpend).toBeLessThan(r.totalCost)
    expect(r.budget.recommendedNetGain).toBeGreaterThan(r.budget.fullPlanNetGain)
  })

  it("keeps table stakes in the budget even when their own return is negative", () => {
    const r = analyzeRenovationRoi(base({ description: "roof replacement", condition: "good" }))
    expect(r.budget.recommendedItems.some(l => /roof/i.test(l))).toBe(true)
    expect(r.budget.cutItems.some(c => /roof/i.test(c.label))).toBe(false)
  })

  it("keeps everything when every item pays", () => {
    const r = analyzeRenovationRoi(base({
      description: "interior paint", asIsValue: 250_000, neighborhoodCeiling: 500_000, condition: "poor",
    }))
    expect(r.budget.cutItems).toHaveLength(0)
    expect(r.budget.guidance).toMatch(/pays for itself/i)
  })

  it("says so plainly when nothing in the plan is worth doing", () => {
    const r = analyzeRenovationRoi(base({
      description: "full kitchen gut", asIsValue: 449_000, neighborhoodCeiling: 450_000, condition: "good",
    }))
    expect(r.budget.recommendedSpend).toBe(0)
    expect(r.budget.guidance).toMatch(/nothing in this plan/i)
  })
})
