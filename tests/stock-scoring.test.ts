// Core stock scoring engine — the pure decision layer that decides what gets
// called a "top pick." No network, no DB: every test constructs its own
// StockScoreInput and asserts on the resulting StockScoreResult.
import { describe, it, expect } from "vitest"
import { scoreStock, type StockScoreInput } from "@/lib/stock-scoring"
import type { NormalizedFundamentals } from "@/lib/edgar-normalize"

// A clean, healthy company: every core ratio present and strong. Individual
// tests override just the field(s) under test.
function baseFundamentals(overrides: Partial<NormalizedFundamentals> = {}): NormalizedFundamentals {
  return {
    revenueTtm: 5_000_000_000,
    revenueGrowthYoyPct: 12,
    grossMarginPct: 45,
    operatingMarginPct: 20,
    netMarginPct: 15,
    roePct: 18,
    roicPct: 12,
    debtToEquity: 0.5,
    interestCoveragePct: 10,
    currentRatio: 2,
    freeCashFlowTtm: 500_000_000,
    fcfMarginPct: 10,
    accrualsRatioPct: 2,
    sharesOutstanding: 100_000_000,
    buybackYieldPct: 1,
    epsDiluted: 3,
    dividendPerShare: 0,
    payoutRatioEarningsPct: null,
    payoutRatioFcfPct: null,
    ...overrides,
  } as NormalizedFundamentals
}

function baseInput(overrides: Partial<StockScoreInput> = {}): StockScoreInput {
  return {
    fundamentals: baseFundamentals(),
    price: { symbol: "TEST", price: 54, date: "2026-01-01" },
    priceMetrics: {
      momentum12m1Pct: 10, pctFrom52WeekHigh: -5, volatility30dPct: 25,
      maxDrawdown1yPct: -15, betaVsSpy: 1.1, barsAvailable: 252,
    },
    piotroski: { normalized: 7, raw: 7, tests: [], interpretation: "Strong" } as never,
    altman: { zScore: 4, zone: "safe", interpretation: "Safe zone" } as never,
    beneish: { mScore: -2.5, flagged: false, interpretation: "Clean" } as never,
    sectorRelative: null,
    goingConcernHits: 0,
    ...overrides,
  }
}

describe("scoreStock — data gate", () => {
  it("refuses to score below 40% core data completeness", () => {
    const result = scoreStock(baseInput({
      fundamentals: baseFundamentals({
        revenueGrowthYoyPct: null, grossMarginPct: null, operatingMarginPct: null,
        netMarginPct: null, roePct: null, roicPct: null, debtToEquity: null,
        interestCoveragePct: null,
      }),
    }))
    expect(result.qualityScore).toBeNull()
    expect(result.dataConfidence).toBe("insufficient")
    expect(result.actionSignal).toBeNull()
  })

  it("scores normally with full data", () => {
    const result = scoreStock(baseInput())
    expect(result.qualityScore).not.toBeNull()
    expect(result.dataConfidence).toBe("high")
    expect(result.grade).not.toBeNull()
  })
})

describe("scoreStock — two axes never collapse", () => {
  it("a strong business can still carry a high risk score simultaneously", () => {
    const result = scoreStock(baseInput({ externalRiskPenalty: 60, externalRiskFlags: ["⚠ test risk"] }))
    expect(result.qualityScore).toBeGreaterThan(60)
    expect(result.riskScore).toBeGreaterThanOrEqual(60)
  })
})

describe("scoreStock — hard caps override the numeric matrix", () => {
  it("going concern caps quality at 35 regardless of strong ratios", () => {
    const result = scoreStock(baseInput({ goingConcernHits: 1 }))
    expect(result.qualityScore).not.toBeNull()
    expect(result.qualityScore!).toBeLessThanOrEqual(35)
    expect(result.earlyWarning).toBe(true)
    expect(result.riskFlags.some(f => f.includes("Going concern"))).toBe(true)
  })

  it("Altman distress zone caps quality at 45", () => {
    const result = scoreStock(baseInput({
      altman: { zScore: 0.5, zone: "distress", interpretation: "Distress zone" } as never,
    }))
    expect(result.qualityScore!).toBeLessThanOrEqual(45)
  })

  it("a restatement caps quality at 30 even with otherwise-strong fundamentals", () => {
    const result = scoreStock(baseInput({ hasRestatement: true }))
    expect(result.qualityScore!).toBeLessThanOrEqual(30)
  })
})

describe("scoreStock — action signal never fires BUY through a hard fail", () => {
  it("no BUY signal when a restatement is active, however good the score looks otherwise", () => {
    const result = scoreStock(baseInput({ hasRestatement: true, forwardScore: 90 }))
    expect(result.actionSignal).not.toBe("buy")
  })
})

describe("scoreStock — external risk penalty accumulates onto the baseline", () => {
  it("risk score is monotonic in externalRiskPenalty", () => {
    const low = scoreStock(baseInput({ externalRiskPenalty: 0 }))
    const high = scoreStock(baseInput({ externalRiskPenalty: 40 }))
    expect(high.riskScore!).toBeGreaterThan(low.riskScore!)
  })

  it("externalRiskFlags pass straight through to riskFlags", () => {
    const result = scoreStock(baseInput({ externalRiskFlags: ["⚠ a specific external flag"] }))
    expect(result.riskFlags).toContain("⚠ a specific external flag")
  })
})

describe("scoreStock — weight renormalization, never zero-fill", () => {
  it("a missing conditional criterion doesn't silently score as zero", () => {
    // Two runs differing only in whether Piotroski (weight 13, the highest
    // single weight) is present. If it were zero-filled instead of
    // renormalized, removing a strong 7/9 input would craterthe score.
    const withPiotroski = scoreStock(baseInput())
    const withoutPiotroski = scoreStock(baseInput({ piotroski: null }))
    expect(withoutPiotroski.qualityScore).not.toBeNull()
    // Renormalization keeps the score in the same neighborhood rather than
    // collapsing toward zero.
    expect(Math.abs(withPiotroski.qualityScore! - withoutPiotroski.qualityScore!)).toBeLessThan(25)
  })
})

describe("scoreStock — market-wide net margin percentile (lib/market-percentile.ts)", () => {
  it("a top-percentile market margin reading raises quality vs. the same company without it", () => {
    const withMarketMargin = scoreStock(baseInput({ marketNetMarginPercentile: 95 }))
    const without = scoreStock(baseInput({ marketNetMarginPercentile: null }))
    expect(withMarketMargin.qualityScore!).toBeGreaterThan(without.qualityScore!)
  })

  it("a bottom-percentile market margin reading lowers quality vs. the same company without it", () => {
    const withMarketMargin = scoreStock(baseInput({ marketNetMarginPercentile: 5 }))
    const without = scoreStock(baseInput({ marketNetMarginPercentile: null }))
    expect(withMarketMargin.qualityScore!).toBeLessThan(without.qualityScore!)
  })

  it("absence of the market percentile still scores normally (frame join is optional, not required)", () => {
    const result = scoreStock(baseInput({ marketNetMarginPercentile: null }))
    expect(result.qualityScore).not.toBeNull()
    expect(result.dataConfidence).toBe("high")
  })
})
