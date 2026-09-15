// Market scoring against MARKET_CRITERIA_SPEC.md.
//
// The two properties these tests exist to protect:
//
//   1. NO THIRD-PARTY RANK IS AN INPUT. Only raw measurements go in, so a
//      market everyone else ranks first finishes wherever its numbers put it.
//   2. WEIGHTS ARE NEVER RENORMALISED. A missing criterion scores zero of its
//      points and the total stays out of a fixed 100. Rescaling to what was
//      measured rewards ignorance — the crypto side of this codebase had that
//      exact bug and ranked a meme coin first at 92/100.
import { describe, it, expect } from "vitest"
import {
  scoreMarket, scoreCriteria, findDisqualifiers, rankMarkets,
  DISQUALIFIER_LIMITS, TIER_THRESHOLDS, STRATEGY_MATRIX,
  type MarketInputs,
} from "@/lib/market-criteria"

const NATIONAL_PRICE = 420_000
const NATIONAL_RENT = 1_900

/** A market that is strong on every criterion, for use as a baseline. */
function strong(overrides: Partial<MarketInputs> = {}): MarketInputs {
  return {
    market: "Test City, OH",
    priceToRent: 11,
    popGrowthYoY: 2.2,
    medianHomePrice: 300_000,
    medianRent: 2_400,
    jobGrowthPct: 3.2,
    vacancyRate: 3.5,
    appreciation3yrCagr: 7.5,
    unemploymentRate: 3.4,
    landlordFriendly: true,
    daysOnMarket: 22,
    povertyRate: 11,
    propertyTaxRateEffective: 1.2,
    majorEmployerPresent: true,
    rentControlActive: false,
    evictionTimelineMonths: 2,
    nationalMedianHomePrice: NATIONAL_PRICE,
    nationalMedianRent: NATIONAL_RENT,
    ...overrides,
  }
}

describe("the rubric totals 100 and a perfect market reaches it", () => {
  it("awards every point when every threshold is beaten", () => {
    const s = scoreMarket(strong())
    expect(s.score).toBe(100)
    expect(s.tier).toBe("Priority Target")
    expect(s.dataCompletenessPct).toBe(100)
  })

  it("has criteria weights summing to exactly 100", () => {
    const total = scoreCriteria(strong()).reduce((n, c) => n + c.maxPoints, 0)
    expect(total).toBe(100)
  })
})

describe("missing data scores zero and is NOT redistributed", () => {
  it("costs a market exactly the weight of what is missing", () => {
    // Price-to-rent is 18 points. Removing it must cost 18, not zero.
    const s = scoreMarket(strong({ priceToRent: null }))
    expect(s.score).toBe(82)
    expect(s.dataCompletenessPct).toBe(82)
  })

  it("cannot reach Priority Target on thin data however good the numbers are", () => {
    // Only price-to-rent and rent measured — both perfect. 30 of 100.
    const s = scoreMarket(strong({
      popGrowthYoY: null, medianHomePrice: null, jobGrowthPct: null,
      vacancyRate: null, appreciation3yrCagr: null, unemploymentRate: null,
      landlordFriendly: null, daysOnMarket: null,
    }))
    expect(s.score).toBe(30)
    expect(s.tier).toBe("Below Watchlist")
    // This is the anti-renormalisation property, stated directly.
    expect(s.score).toBeLessThan(TIER_THRESHOLDS.watchlist)
  })

  it("says plainly that an unmeasured criterion is not a good one", () => {
    const c = scoreCriteria(strong({ vacancyRate: null })).find(x => x.id === "vacancy")!
    expect(c.measured).toBe(false)
    expect(c.points).toBe(0)
    expect(c.basis).toContain("NOT redistributed")
  })

  it("warns when too little of the rubric could be measured to trust the score", () => {
    const s = scoreMarket(strong({
      priceToRent: null, popGrowthYoY: null, medianHomePrice: null, medianRent: null,
    }))
    expect(s.redFlags.some(f => f.includes("floor, not a verdict"))).toBe(true)
  })
})

describe("hard disqualifiers remove a market before any score is computed", () => {
  it("fails a market whose population is shrinking materially", () => {
    const s = scoreMarket(strong({ popGrowthYoY: -0.4 }))
    expect(s.tier).toBe("Disqualified")
    expect(s.score).toBe(0)
    // No score at all, rather than a low one — a number invites comparison.
    expect(s.criteria).toEqual([])
  })

  it("fails on each spec threshold", () => {
    expect(findDisqualifiers(strong({ vacancyRate: DISQUALIFIER_LIMITS.vacancyRatePct + 0.1 }))).toHaveLength(1)
    expect(findDisqualifiers(strong({ unemploymentRate: DISQUALIFIER_LIMITS.unemploymentRatePct + 0.1 }))).toHaveLength(1)
    expect(findDisqualifiers(strong({ povertyRate: DISQUALIFIER_LIMITS.povertyRatePct + 0.1 }))).toHaveLength(1)
    expect(findDisqualifiers(strong({ propertyTaxRateEffective: DISQUALIFIER_LIMITS.propertyTaxRatePct + 0.01 }))).toHaveLength(1)
    expect(findDisqualifiers(strong({ appreciation3yrCagr: -0.5 }))).toHaveLength(1)
    expect(findDisqualifiers(strong({ majorEmployerPresent: false }))).toHaveLength(1)
  })

  it("does NOT disqualify a market for data we never measured", () => {
    // We cannot fail a market for something we did not look at. It loses
    // points in the rubric instead.
    const s = scoreMarket(strong({
      vacancyRate: null, unemploymentRate: null, povertyRate: null,
      propertyTaxRateEffective: null, majorEmployerPresent: null,
    }))
    expect(s.tier).not.toBe("Disqualified")
  })

  it("holds a tenant-favourable state against an LTR hold only", () => {
    const tenantFavourable = { landlordFriendly: false, targetHoldIsLtr: true }
    expect(findDisqualifiers(strong(tenantFavourable))).toHaveLength(1)
    // The same market is perfectly usable for a flip or an STR.
    expect(findDisqualifiers(strong({ landlordFriendly: false, targetHoldIsLtr: false }))).toHaveLength(0)
  })

  it("catches rent control and slow evictions as tenant-favourable for LTR", () => {
    expect(findDisqualifiers(strong({ rentControlActive: true, targetHoldIsLtr: true }))).toHaveLength(1)
    expect(findDisqualifiers(strong({
      evictionTimelineMonths: DISQUALIFIER_LIMITS.ltrEvictionMonths + 1, targetHoldIsLtr: true,
    }))).toHaveLength(1)
  })
})

describe("thresholds behave exactly as the spec states", () => {
  it("gives no price-to-rent points at 18 and full marks under 12", () => {
    const at18 = scoreCriteria(strong({ priceToRent: 18 })).find(c => c.id === "ptr")!
    const at11 = scoreCriteria(strong({ priceToRent: 11 })).find(c => c.id === "ptr")!
    expect(at18.points).toBe(0)
    expect(at11.points).toBe(18)
  })

  it("gives no points for a price at or above the national median", () => {
    const c = scoreCriteria(strong({ medianHomePrice: NATIONAL_PRICE })).find(x => x.id === "price")!
    expect(c.points).toBe(0)
  })

  it("gives no vacancy points above 10% and full marks below 4%", () => {
    expect(scoreCriteria(strong({ vacancyRate: 10.5 })).find(c => c.id === "vacancy")!.points).toBe(0)
    expect(scoreCriteria(strong({ vacancyRate: 3.2 })).find(c => c.id === "vacancy")!.points).toBe(10)
  })

  it("treats landlord-friendliness as the binary the spec describes", () => {
    expect(scoreCriteria(strong({ landlordFriendly: true })).find(c => c.id === "landlord")!.points).toBe(6)
    expect(scoreCriteria(strong({ landlordFriendly: false })).find(c => c.id === "landlord")!.points).toBe(0)
  })

  it("places tier boundaries at 65, 75 and 85", () => {
    // Priority Target: perfect on everything.
    expect(scoreMarket(strong()).score).toBe(100)
    // Qualified: price-to-rent at the 18 cutoff forfeits all 18 points -> 82.
    expect(scoreMarket(strong({ priceToRent: 18 })).tier).toBe("Qualified")
    // Watchlist: price-to-rent and rent both unmeasured -> 100 - 18 - 12 = 70.
    expect(scoreMarket(strong({ priceToRent: null, medianRent: null })).tier).toBe("Watchlist")
    // A partial score still earns its band: PTR 15.1 is 8.7 of 18, so 91.
    expect(scoreMarket(strong({ priceToRent: 15.1 })).score).toBe(91)
  })
})

describe("green and red flags", () => {
  it("carries green flags through without adding to the score", () => {
    const withFlags = scoreMarket(strong({ greenFlags: ["Intel mega-site $20B", "No state income tax"] }))
    expect(withFlags.score).toBe(100)
    expect(withFlags.greenFlags).toHaveLength(2)
  })

  it("raises a red flag on a soft market rather than only scoring it low", () => {
    const s = scoreMarket(strong({ daysOnMarket: 120 }))
    expect(s.redFlags.some(f => f.includes("soft market"))).toBe(true)
  })
})

describe("ranking is ours, not anyone else's", () => {
  it("orders by our score, so a market ranked first elsewhere finishes on its numbers", () => {
    const ranked = rankMarkets([
      strong({ market: "Hyped City", priceToRent: 19, medianHomePrice: 900_000, appreciation3yrCagr: 2.1, vacancyRate: 9 }),
      strong({ market: "Boring City" }),
    ])
    expect(ranked[0].market).toBe("Boring City")
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score)
  })

  it("breaks a tie toward the market we know more about", () => {
    // Same score; the thinner one is the riskier bet and ranks lower.
    const measured = strong({ market: "Measured", priceToRent: null })            // 82, 82% complete
    const thin = strong({
      market: "Thin", priceToRent: 11, popGrowthYoY: null, jobGrowthPct: null,
      vacancyRate: null, appreciation3yrCagr: null, unemploymentRate: null,
      landlordFriendly: null, daysOnMarket: null, medianHomePrice: null, medianRent: null,
    })
    const ranked = rankMarkets([thin, measured])
    expect(ranked[0].market).toBe("Measured")
  })

  it("sinks disqualified markets below every scored one", () => {
    const ranked = rankMarkets([
      strong({ market: "Failed", vacancyRate: 15 }),
      strong({ market: "Weak", priceToRent: 17.5, popGrowthYoY: 0.1, appreciation3yrCagr: 2.1 }),
    ])
    expect(ranked[0].market).toBe("Weak")
    expect(ranked[1].tier).toBe("Disqualified")
  })

  it("states in the summary that no third-party ranking was used", () => {
    expect(scoreMarket(strong()).summary).toContain("No third-party ranking was used")
  })
})

describe("strategy fit follows the market, not just the property type", () => {
  it("refuses LTR in a tenant-favourable state and offers STR/MTR instead", () => {
    // The Minneapolis case from the spec.
    const s = scoreMarket(strong({ landlordFriendly: false, targetHoldIsLtr: false }))
    expect(s.recommendedStrategies).toContain("STR")
    expect(s.recommendedStrategies).not.toContain("LTR")
  })

  it("offers LTR where price-to-rent and landlord law both allow it", () => {
    expect(scoreMarket(strong()).recommendedStrategies).toContain("LTR")
  })

  it("maps every property type in the spec to a strategy", () => {
    for (const type of ["SFH", "Duplex", "Triplex", "Quad", "5+ Unit", "Condo", "Townhouse", "Motel"]) {
      expect(STRATEGY_MATRIX[type]?.strategies.length).toBeGreaterThan(0)
    }
    // The motel rule the spec is emphatic about.
    expect(STRATEGY_MATRIX.Motel.note).toContain("Do not assume the brand")
  })
})

describe("the population-series guard", () => {
  it("refuses a series no real city could produce, rather than failing the market", async () => {
    const { __popGrowthForTest } = await import("@/lib/market-criteria-inputs")
    // The actual Wikidata series for Louisville: three different geographies
    // filed under one name. Divided out it reads -60.9% over five years, which
    // tripped the "population is declining" disqualifier and removed a
    // priority market from consideration with a confident explanation.
    const corrupt = {
      popGrowth5yr: -60.9,
      popSeries: [{ year: 2010, pop: 597_337 }, { year: 2014, pop: 760_026 }, { year: 2020, pop: 246_161 }],
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(__popGrowthForTest(corrupt as any)).toBeNull()
  })

  it("accepts an ordinary series and compounds it correctly", async () => {
    const { __popGrowthForTest } = await import("@/lib/market-criteria-inputs")
    const sane = {
      popGrowth5yr: 10,
      popSeries: [{ year: 2010, pop: 787_033 }, { year: 2020, pop: 905_748 }],
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = __popGrowthForTest(sane as any)!
    expect(g).toBeGreaterThan(1.3)
    expect(g).toBeLessThan(1.5)
  })

  it("catches a spike that returns, which endpoint-only maths would miss", async () => {
    const { __popGrowthForTest } = await import("@/lib/market-criteria-inputs")
    const spike = {
      popGrowth5yr: 0,
      popSeries: [{ year: 2010, pop: 100_000 }, { year: 2015, pop: 900_000 }, { year: 2020, pop: 100_000 }],
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(__popGrowthForTest(spike as any)).toBeNull()
  })

  it("warns that an ACS-derived price-to-rent runs high rather than ruling a market out silently", () => {
    const s = scoreMarket(strong({ priceToRent: 18.3, acsDerivedPriceToRent: true }))
    expect(s.redFlags.some(f => f.includes("real rent comps"))).toBe(true)
  })
})

describe("a decline has to be real to disqualify", () => {
  it("does not throw out a market on a rounding-level change", async () => {
    const { MATERIAL_POP_DECLINE_PCT } = await import("@/lib/market-criteria")
    // Minneapolis measured -0.02%/yr and Peoria -0.03%/yr — far inside the
    // margin of error on an ACS estimate. Failing those is noise, not rigour.
    expect(findDisqualifiers(strong({ popGrowthYoY: -0.02 }))).toHaveLength(0)
    expect(findDisqualifiers(strong({ popGrowthYoY: -0.03 }))).toHaveLength(0)
    expect(MATERIAL_POP_DECLINE_PCT).toBeLessThan(0)
  })

  it("still fails a market that is genuinely shrinking", () => {
    expect(findDisqualifiers(strong({ popGrowthYoY: -0.42 }))).toHaveLength(1)
  })

  it("flags flat population rather than passing it silently", () => {
    const s = scoreMarket(strong({ popGrowthYoY: -0.02 }))
    expect(s.tier).not.toBe("Disqualified")
    expect(s.redFlags.some(f => f.includes("margin of error"))).toBe(true)
    // And it earns nothing from the growth criterion, so it cannot score well.
    expect(s.criteria.find(c => c.id === "popgrowth")!.points).toBe(0)
  })
})
