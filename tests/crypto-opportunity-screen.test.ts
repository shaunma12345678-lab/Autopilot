// Crypto opportunity screen gates — same contract as the stock screen's
// tests: every disqualifier here is a fact, not a score penalty.
import { describe, it, expect } from "vitest"
import { disqualify, hasCryptoDisqualifyingRedFlag } from "@/lib/crypto-opportunity-screen"

function goodAsset(overrides: Record<string, unknown> = {}) {
  return {
    symbol: "GOOD", name: "Good Coin", marketCapRank: 50,
    qualityScore: 70, riskScore: 30, dataConfidence: "high",
    pricePercentile1y: 30,
    isHoneypot: false, isMintable: false,
    liquidityGrade: "adequate", venueCount: 2,
    fdvToMcapRatio: 1.1, onchainPercentile: 60,
    convictionTier: "high", convictionSummary: "Cleared 8 of 9 gates.",
    riskFlags: [],
    ...overrides,
  }
}

describe("hasCryptoDisqualifyingRedFlag", () => {
  it("passes a genuinely sound asset", () => {
    expect(hasCryptoDisqualifyingRedFlag(goodAsset() as never)).toBeNull()
  })

  it("rejects a honeypot outright", () => {
    expect(hasCryptoDisqualifyingRedFlag(goodAsset({ isHoneypot: true }) as never)).not.toBeNull()
  })

  it("rejects an asset with no regulated venue listing", () => {
    expect(hasCryptoDisqualifyingRedFlag(goodAsset({ venueCount: 0 }) as never)).not.toBeNull()
  })

  it("rejects fragmented liquidity", () => {
    expect(hasCryptoDisqualifyingRedFlag(goodAsset({ liquidityGrade: "fragmented" }) as never)).not.toBeNull()
  })

  it("rejects a below-bar conviction tier", () => {
    expect(hasCryptoDisqualifyingRedFlag(goodAsset({ convictionTier: "below-bar" }) as never)).not.toBeNull()
  })
})

describe("disqualify — thresholds beyond the hard facts", () => {
  it("rejects below the quality floor", () => {
    expect(disqualify(goodAsset({ qualityScore: 40 }) as never)).not.toBeNull()
  })

  it("rejects trading in the upper half of its own 1-year range (not cheap)", () => {
    expect(disqualify(goodAsset({ pricePercentile1y: 80 }) as never)).not.toBeNull()
  })

  it("rejects when price history is unavailable rather than assuming cheap", () => {
    expect(disqualify(goodAsset({ pricePercentile1y: null }) as never)).not.toBeNull()
  })

  it("rejects arbitrarily mintable supply", () => {
    expect(disqualify(goodAsset({ isMintable: true }) as never)).not.toBeNull()
  })

  it("an asset that clears every gate is never rejected", () => {
    expect(disqualify(goodAsset() as never)).toBeNull()
  })
})
