// Valuation from assessor records.
//
// The pure logic is tested here because it is the part that decides whether a
// number is trustworthy, and every one of these rules exists because the naive
// version produced a confidently wrong answer against live county data:
//
//   - an assumed assessment ratio is a guess dressed as arithmetic
//   - mixing assessed and market values blurs a fact into an estimate
//   - a use code alone does not exclude a $45,000,000 apartment tower
//   - a layer that aggregates by district reports house prices in the millions
import { describe, it, expect } from "vitest"
import {
  deriveAssessmentRatio, blendValuations, trimmedMedian, classifyUse,
  matchField, isPlausibleHomeValue, MIN_RATIO_SAMPLE, PLAUSIBLE_HOME_MAX,
  type ValueObservation,
} from "@/lib/parcel-valuation"

const obs = (kind: ValueObservation["kind"], value: number): ValueObservation =>
  ({ kind, value, source: "test layer", field: "f" })

describe("measuring the assessment ratio instead of assuming it", () => {
  const pairs = (n: number, ratio: number) =>
    Array.from({ length: n }, (_, i) => ({ assessed: 100_000 * ratio + i, sale: 100_000 }))

  it("measures the median ratio from parcels carrying both figures", () => {
    const { ratio, sampleSize } = deriveAssessmentRatio(pairs(20, 0.35))
    expect(ratio).toBeGreaterThan(0.34)
    expect(ratio).toBeLessThan(0.36)
    expect(sampleSize).toBe(20)
  })

  it("refuses to report a ratio from too small a sample", () => {
    // An invented ratio is worse than none: everything downstream inherits it
    // without knowing.
    const { ratio } = deriveAssessmentRatio(pairs(MIN_RATIO_SAMPLE - 1, 0.35))
    expect(ratio).toBeNull()
  })

  it("ignores nominal transfers that are not evidence of market value", () => {
    const junk = Array.from({ length: 20 }, () => ({ assessed: 90_000, sale: 1 }))
    expect(deriveAssessmentRatio(junk).ratio).toBeNull()
  })

  it("discards ratios so extreme the fields cannot mean what they say", () => {
    const wrong = Array.from({ length: 20 }, () => ({ assessed: 5_000_000, sale: 100_000 }))
    expect(deriveAssessmentRatio(wrong).ratio).toBeNull()
  })
})

describe("ranking evidence rather than averaging it", () => {
  it("prefers a recorded sale over everything else", () => {
    const r = blendValuations([obs("sale", 200_000), obs("market", 900_000), obs("assessed", 50_000)])
    expect(r.estimate).toBe(200_000)
    expect(r.basis).toContain("sale price")
  })

  it("prefers a county market value over a bare assessed value", () => {
    const r = blendValuations([obs("market", 300_000), obs("assessed", 100_000)])
    expect(r.estimate).toBe(300_000)
  })

  it("prefers a ratio-adjusted value over a bare assessed value", () => {
    const r = blendValuations([obs("assessed-adjusted", 280_000), obs("assessed", 98_000)])
    expect(r.estimate).toBe(280_000)
  })

  it("warns loudly when only assessed values are available", () => {
    const r = blendValuations([obs("assessed", 98_000)])
    expect(r.confidence).toBe("low")
    expect(r.basis).toContain("floor, not an estimate")
  })

  it("returns nothing rather than a guess when there is no evidence", () => {
    const r = blendValuations([])
    expect(r.estimate).toBeNull()
    expect(r.confidence).toBe("none")
  })

  it("refuses figures no home could carry, and says why", () => {
    // The Harris County failure: right field names, values in the tens of
    // millions, "high" confidence on a number wrong by 100x.
    const r = blendValuations([obs("market", 45_536_955), obs("market", 424_967_080)])
    expect(r.estimate).toBeNull()
    expect(r.basis).toContain("aggregates by account or district")
  })
})

describe("a few outliers must not set the number", () => {
  it("trims the extremes before taking the median", () => {
    const houses = Array.from({ length: 18 }, () => 200_000)
    const towers = [18_000_000, 19_000_000]
    expect(trimmedMedian([...houses, ...towers])).toBe(200_000)
  })

  it("keeps the plain median on a small sample rather than discarding most of it", () => {
    expect(trimmedMedian([100, 200, 300])).toBe(200)
  })

  it("handles an empty set", () => {
    expect(trimmedMedian([])).toBeNull()
  })
})

describe("telling houses from everything else", () => {
  it("accepts single-family", () => {
    expect(classifyUse({ land_use: "Single Family Residential" })).toBe("residential")
    expect(classifyUse({ state_class: "A1" })).toBe("residential")
  })

  it("rejects an apartment tower even though it is residential", () => {
    // Residential by use code, $45m by value. Including these moved a Houston
    // estimate from $9.4m to $49m.
    expect(classifyUse({ prop_type: "Apartment" })).toBe("not-residential")
    expect(classifyUse({ land_use: "Multi-Family High Rise" })).toBe("not-residential")
  })

  it("rejects commercial", () => {
    expect(classifyUse({ land_use: "Commercial Office" })).toBe("not-residential")
  })

  it("reports unknown when no use field exists, rather than assuming", () => {
    expect(classifyUse({ owner: "SMITH" })).toBe("unknown")
  })
})

describe("finding the value field across counties that name it differently", () => {
  const market = /(?:tot|total|full)?_?(?:mkt|market|appr|apprais\w*)_?val|market_?value|appraised_?value|full_?value|total_?value/i

  it("matches the lowercase snake_case names counties actually use", () => {
    expect(matchField({ tot_mkt_val: 240_000 }, market)?.value).toBe(240_000)
    expect(matchField({ total_market_val: 185_000 }, market)?.value).toBe(185_000)
  })

  it("parses a formatted currency string", () => {
    expect(matchField({ market_value: "$240,000" }, market)?.value).toBe(240_000)
  })

  it("skips land-only fields, which are the dirt without the house", () => {
    expect(matchField({ land_value: 40_000 }, market)).toBeNull()
  })

  it("ignores text fields that happen to match the name", () => {
    expect(matchField({ assess_type: "GENERAL" }, market)).toBeNull()
  })
})

describe("the plausibility band", () => {
  it("accepts ordinary and very cheap homes", () => {
    expect(isPlausibleHomeValue(6_000)).toBe(true)
    expect(isPlausibleHomeValue(450_000)).toBe(true)
  })

  it("rejects district aggregates", () => {
    expect(isPlausibleHomeValue(PLAUSIBLE_HOME_MAX + 1)).toBe(false)
    expect(isPlausibleHomeValue(424_967_080)).toBe(false)
  })
})
