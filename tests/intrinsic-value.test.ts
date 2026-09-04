// Absolute valuation. These tests check the MATH, because the whole point of
// this module is to be right in absolute terms rather than relative — a
// reverse DCF that solves incorrectly gives a confident, precise, wrong answer.
import { describe, it, expect } from "vitest"
import {
  estimateCostOfCapital, assessValueCreation, reverseDcf, assessIntrinsicValue,
} from "@/lib/intrinsic-value"

describe("cost of capital", () => {
  it("computes CAPM cost of equity from beta", () => {
    // rf 4.2% + beta 1.0 × ERP 5% = 9.2%
    const c = estimateCostOfCapital({
      betaVsSpy: 1.0, marketCap: 1_000_000_000, totalDebt: 0,
      interestExpense: null, effectiveTaxRatePct: 21,
    })!
    expect(c.costOfEquity).toBeCloseTo(0.092, 3)
    expect(c.wacc).toBeCloseTo(0.092, 3)   // no debt → WACC is cost of equity
  })

  it("makes a higher-beta company more expensive to fund", () => {
    const low = estimateCostOfCapital({ betaVsSpy: 0.6, marketCap: 1e9, totalDebt: 0, interestExpense: null, effectiveTaxRatePct: 21 })!
    const high = estimateCostOfCapital({ betaVsSpy: 1.8, marketCap: 1e9, totalDebt: 0, interestExpense: null, effectiveTaxRatePct: 21 })!
    expect(high.wacc).toBeGreaterThan(low.wacc)
  })

  it("lowers WACC when cheap tax-deductible debt is in the mix", () => {
    const noDebt = estimateCostOfCapital({ betaVsSpy: 1.0, marketCap: 1e9, totalDebt: 0, interestExpense: null, effectiveTaxRatePct: 21 })!
    const withDebt = estimateCostOfCapital({
      betaVsSpy: 1.0, marketCap: 1e9, totalDebt: 5e8,
      interestExpense: 2e7,          // 4% cost of debt, deductible
      effectiveTaxRatePct: 21,
    })!
    expect(withDebt.wacc).toBeLessThan(noDebt.wacc)
    expect(withDebt.debtWeight).toBeCloseTo(1 / 3, 2)
  })

  it("assumes beta 1.0 rather than something flattering when it is missing", () => {
    const c = estimateCostOfCapital({ betaVsSpy: null, marketCap: 1e9, totalDebt: 0, interestExpense: null, effectiveTaxRatePct: 21 })!
    expect(c.beta).toBe(1.0)
    expect(c.assumptions.some(a => /beta/i.test(a))).toBe(true)
  })

  it("caps absurd betas as noise", () => {
    const c = estimateCostOfCapital({ betaVsSpy: 9, marketCap: 1e9, totalDebt: 0, interestExpense: null, effectiveTaxRatePct: 21 })!
    expect(c.beta).toBe(3)
  })

  it("returns null without a market cap", () => {
    expect(estimateCostOfCapital({ betaVsSpy: 1, marketCap: null, totalDebt: 0, interestExpense: null, effectiveTaxRatePct: 21 })).toBeNull()
  })
})

describe("value creation — ROIC vs WACC", () => {
  it("recognises a wide positive spread as genuine value creation", () => {
    const v = assessValueCreation(28, 0.09)!
    expect(v.createsValue).toBe(true)
    expect(v.spreadPct).toBeCloseTo(19, 1)
    expect(v.verdict).toMatch(/creates value/i)
  })

  it("flags a negative spread as value DESTRUCTION as it grows", () => {
    const v = assessValueCreation(6, 0.09)!
    expect(v.createsValue).toBe(false)
    expect(v.spreadPct).toBeCloseTo(-3, 1)
    expect(v.verdict).toMatch(/destroys value/i)
    expect(v.verdict).toMatch(/poorer/i)
  })

  it("calls a thin positive spread thin rather than good", () => {
    const v = assessValueCreation(10, 0.09)!
    expect(v.createsValue).toBe(true)
    expect(v.verdict).toMatch(/thin/i)
  })

  it("returns null on missing inputs rather than guessing", () => {
    expect(assessValueCreation(null, 0.09)).toBeNull()
    expect(assessValueCreation(12, null)).toBeNull()
  })
})

describe("reverse DCF", () => {
  it("recovers a known growth rate from a price built on it", () => {
    // Price a stream at a known growth, then confirm the solver finds it back.
    const fcf = 100_000_000
    const growth = 0.08, discount = 0.10, years = 10
    let pv = 0, cash = fcf
    for (let t = 1; t <= years; t++) { cash *= 1 + growth; pv += cash / Math.pow(1 + discount, t) }
    pv += (cash * 1.025) / (discount - 0.025) / Math.pow(1 + discount, years)

    const r = reverseDcf({ marketCap: pv, freeCashFlowTtm: fcf, historicalGrowthPct: 8, wacc: discount })!
    expect(r.impliedGrowthPct).toBeCloseTo(8, 1)
  })

  it("implies higher growth for a more expensive price on identical cash flow", () => {
    const cheap = reverseDcf({ marketCap: 1e9, freeCashFlowTtm: 1e8, historicalGrowthPct: 5, wacc: 0.09 })!
    const dear = reverseDcf({ marketCap: 5e9, freeCashFlowTtm: 1e8, historicalGrowthPct: 5, wacc: 0.09 })!
    expect(dear.impliedGrowthPct!).toBeGreaterThan(cheap.impliedGrowthPct!)
  })

  it("names the expectation gap when the price needs growth never delivered", () => {
    const r = reverseDcf({ marketCap: 6e9, freeCashFlowTtm: 1e8, historicalGrowthPct: 3, wacc: 0.09 })!
    expect(r.expectationGapPct!).toBeGreaterThan(10)
    expect(r.verdict).toMatch(/MORE growth than this business has ever produced/i)
  })

  it("recognises the opposite case — priced for less than it has delivered", () => {
    const r = reverseDcf({ marketCap: 8e8, freeCashFlowTtm: 1e8, historicalGrowthPct: 12, wacc: 0.09 })!
    expect(r.expectationGapPct!).toBeLessThan(-5)
    expect(r.verdict).toMatch(/mispricing/i)
  })

  it("grades plausibility rather than only reporting a number", () => {
    const modest = reverseDcf({ marketCap: 1.2e9, freeCashFlowTtm: 1e8, historicalGrowthPct: 5, wacc: 0.09 })!
    const wild = reverseDcf({ marketCap: 2e10, freeCashFlowTtm: 1e8, historicalGrowthPct: 5, wacc: 0.09 })!
    expect(["modest", "demanding"]).toContain(modest.plausibility)
    expect(["heroic", "implausible"]).toContain(wild.plausibility)
  })

  it("refuses to value a business with no positive cash flow", () => {
    const r = reverseDcf({ marketCap: 1e9, freeCashFlowTtm: -5e7, historicalGrowthPct: 5, wacc: 0.09 })!
    expect(r.impliedGrowthPct).toBeNull()
    expect(r.verdict).toMatch(/no cash stream to discount/i)
  })

  it("reports sensitivity to the discount rate instead of hiding it", () => {
    const r = reverseDcf({ marketCap: 2e9, freeCashFlowTtm: 1e8, historicalGrowthPct: 5, wacc: 0.09 })!
    expect(r.sensitivity).toHaveLength(3)
    // A higher required return demands more growth to justify the same price.
    const [low, , high] = r.sensitivity
    expect(high.impliedGrowthPct!).toBeGreaterThan(low.impliedGrowthPct!)
  })

  it("states its assumptions rather than burying them", () => {
    const r = reverseDcf({ marketCap: 1e9, freeCashFlowTtm: 1e8, historicalGrowthPct: 5, wacc: null })!
    expect(r.assumptions.some(a => /9%/.test(a))).toBe(true)
    expect(r.assumptions.some(a => /terminal/i.test(a))).toBe(true)
  })
})

describe("assessIntrinsicValue — the combined answer", () => {
  it("flags a value destroyer priced for heroic growth", () => {
    const a = assessIntrinsicValue({
      marketCap: 2e10, freeCashFlowTtm: 1e8, fcfGrowthPct: 2,
      roicPct: 5, betaVsSpy: 1.2, totalDebt: 1e9,
      interestExpense: 5e7, effectiveTaxRatePct: 21,
    })
    expect(a.valueCreation!.createsValue).toBe(false)
    expect(a.flags.length).toBeGreaterThanOrEqual(2)
    expect(a.riskPenalty).toBeGreaterThan(15)
  })

  it("stays quiet on a sound business at a sane price", () => {
    const a = assessIntrinsicValue({
      marketCap: 1.2e9, freeCashFlowTtm: 1.5e8, fcfGrowthPct: 9,
      roicPct: 25, betaVsSpy: 0.9, totalDebt: 1e8,
      interestExpense: 4e6, effectiveTaxRatePct: 21,
    })
    expect(a.valueCreation!.createsValue).toBe(true)
    expect(a.flags).toHaveLength(0)
    expect(a.riskPenalty).toBe(0)
  })

  it("degrades gracefully when inputs are missing", () => {
    const a = assessIntrinsicValue({
      marketCap: null, freeCashFlowTtm: null, fcfGrowthPct: null,
      roicPct: null, betaVsSpy: null, totalDebt: null,
      interestExpense: null, effectiveTaxRatePct: null,
    })
    expect(a.summary).toMatch(/not enough data/i)
    expect(a.riskPenalty).toBe(0)
  })
})
