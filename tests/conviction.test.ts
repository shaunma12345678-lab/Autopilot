// Conviction tiering — independent gates, never an average. These tests
// exist specifically to guard the two bugs already found and fixed once in
// this system: a null credibilityScore (never checked) must not be treated
// as a failing gate, and thin data must never reach "elite".
import { describe, it, expect } from "vitest"
import { assessStockConviction, assessCryptoConviction, type StockConvictionInput, type CryptoConvictionInput } from "@/lib/conviction"

function strongStockInput(overrides: Partial<StockConvictionInput> = {}): StockConvictionInput {
  return {
    qualityScore: 75, riskScore: 25,
    piotroskiScore: 8, altmanZone: "safe", beneishFlag: false,
    accountingQualityScore: 80, consistencyScore: 75, forwardScore: 60,
    governanceScore: 80, credibilityScore: 90,
    hasRestatement: false, earlyWarning: false, dataConfidence: "high",
    ...overrides,
  }
}

describe("assessStockConviction", () => {
  it("clears every gate → elite", () => {
    const result = assessStockConviction(strongStockInput())
    expect(result.tier).toBe("elite")
    expect(result.gatesPassed).toBe(result.gatesEvaluable)
  })

  it("a null credibilityScore (never deep-researched) does not count as a failed gate", () => {
    // This is the exact bug fixed in lib/contradiction-check.ts: a company
    // with no narrative read used to default to credibilityScore: 50, which
    // silently failed the >=75 threshold on every un-researched ticker.
    const result = assessStockConviction(strongStockInput({ credibilityScore: null }))
    const credibilityGate = result.gates.find(g => g.name === "Narrative matches the numbers")
    expect(credibilityGate?.passed).toBeNull()
    // Still elite: a null gate is excluded from evaluable, not counted against it.
    expect(result.tier).toBe("elite")
  })

  it("a real credibility failure (found a contradiction) demotes the tier", () => {
    const result = assessStockConviction(strongStockInput({ credibilityScore: 40 }))
    expect(result.tier).not.toBe("elite")
  })

  it("thin data (dataConfidence low) can never reach elite regardless of scores", () => {
    const result = assessStockConviction(strongStockInput({ dataConfidence: "low" }))
    expect(result.tier).toBe("below-bar")
  })

  it("fewer than 6 evaluable gates can never reach elite", () => {
    const result = assessStockConviction(strongStockInput({
      piotroskiScore: null, altmanZone: null, beneishFlag: null,
      accountingQualityScore: null, consistencyScore: null,
    }))
    expect(result.tier).toBe("below-bar")
  })

  it("a going-concern-adjacent early warning fails the disqualifying-event gate outright", () => {
    const result = assessStockConviction(strongStockInput({ earlyWarning: true }))
    const gate = result.gates.find(g => g.name === "No disqualifying event")
    expect(gate?.passed).toBe(false)
    expect(result.tier).not.toBe("elite")
  })
})

function strongCryptoInput(overrides: Partial<CryptoConvictionInput> = {}): CryptoConvictionInput {
  return {
    qualityScore: 75, riskScore: 25,
    securityScore: 90, isHoneypot: false, isMintable: false,
    venueCount: 2, liquidityGrade: "deep", fdvToMcapRatio: 1.1,
    protocolRevenue30dUsd: 500_000, devActivityScore: 70,
    dataConfidence: "high",
    ...overrides,
  }
}

describe("assessCryptoConviction", () => {
  it("clears every gate → elite", () => {
    expect(assessCryptoConviction(strongCryptoInput()).tier).toBe("elite")
  })

  it("a honeypot fails outright regardless of every other gate", () => {
    const result = assessCryptoConviction(strongCryptoInput({ isHoneypot: true }))
    const gate = result.gates.find(g => g.name === "Contract not hostile")
    expect(gate?.passed).toBe(false)
    expect(result.tier).not.toBe("elite")
  })

  it("a single regulated listing (not two) fails the listing-quality gate", () => {
    const result = assessCryptoConviction(strongCryptoInput({ venueCount: 1 }))
    const gate = result.gates.find(g => g.name === "Regulated listing")
    expect(gate?.passed).toBe(false)
  })
})
