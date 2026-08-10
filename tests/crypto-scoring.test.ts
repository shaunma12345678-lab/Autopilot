import { describe, it, expect } from "vitest"
import { scoreCrypto, type CryptoScoreInput } from "@/lib/crypto-scoring"
import type { CoinMarketData } from "@/lib/coingecko-client"

function baseMarket(overrides: Partial<CoinMarketData> = {}): CoinMarketData {
  return {
    priceUsd: 100, volume24hUsd: 50_000_000, marketCapUsd: 1_000_000_000,
    marketCapRank: 40, priceChange24hPct: 2, priceChange7dPct: 5,
    circulatingSupply: 900_000_000, totalSupply: 1_000_000_000, maxSupply: 1_000_000_000,
    fdvUsd: 1_100_000_000, githubRepoUrl: null, platforms: null,
    ...overrides,
  }
}

function baseInput(overrides: Partial<CryptoScoreInput> = {}): CryptoScoreInput {
  return {
    market: baseMarket(),
    protocolRevenue30dUsd: 1_000_000,
    devActivity: { devActivityScore: 70, commitsLast12Weeks: 40 } as never,
    nextUnlock: null,
    security: { applicable: true, securityScore: 90, isHoneypot: false, isMintable: false, lpLocked: true, flags: [] } as never,
    depth: { totalDepth2PctUsd: 2_000_000 } as never,
    volatility30dPct: 60, maxDrawdown1yPct: -30, btcCorrelation: 0.5,
    exchange: { venueCount: 2, divergencePct: 0.1, spreadPct: 0.1, liquidityGrade: "deep", volume24hUsd: 40_000_000, consensusPrice: 100, notes: [] } as never,
    ...overrides,
  }
}

describe("scoreCrypto — data gate", () => {
  it("refuses to score with almost no core data", () => {
    const result = scoreCrypto(baseInput({
      market: baseMarket({ priceChange7dPct: null, marketCapRank: null }),
      exchange: null,
    }))
    expect(result.qualityScore).toBeNull()
    expect(result.dataConfidence).toBe("insufficient")
  })
})

describe("scoreCrypto — honeypot hard-caps everything", () => {
  it("a honeypot caps quality at 5 and risk at 100 regardless of every other strong metric", () => {
    const result = scoreCrypto(baseInput({
      security: { applicable: true, securityScore: 95, isHoneypot: true, isMintable: false, lpLocked: true, flags: ["⚠ honeypot"] } as never,
    }))
    expect(result.qualityScore).toBeLessThanOrEqual(5)
    expect(result.riskScore).toBe(100)
    expect(result.actionSignal).not.toBe("buy")
  })
})

describe("scoreCrypto — on-chain activity wiring", () => {
  it("a strong on-chain percentile improves quality vs. an identical asset with no on-chain read", () => {
    const withOnChain = scoreCrypto(baseInput({ onChainPercentile: 90, onChainNotes: ["strong usage"] }))
    const withoutOnChain = scoreCrypto(baseInput({ onChainPercentile: null }))
    expect(withOnChain.qualityScore!).toBeGreaterThan(withoutOnChain.qualityScore!)
  })

  it("a weak on-chain percentile produces a warning-toned reason", () => {
    const result = scoreCrypto(baseInput({ onChainPercentile: 10 }))
    expect(result.qualityReasons.some(r => r.includes("⚠") && r.toLowerCase().includes("on-chain"))).toBe(true)
  })

  it("null on-chain percentile (token, not a base-layer chain) is never scored as zero", () => {
    // isOnChainSupported gates this upstream; the scorer itself must treat
    // null as "not applicable", never as the worst possible reading.
    const withNull = scoreCrypto(baseInput({ onChainPercentile: null }))
    const withZero = scoreCrypto(baseInput({ onChainPercentile: 0 }))
    expect(withNull.qualityScore!).toBeGreaterThan(withZero.qualityScore!)
  })
})

describe("scoreCrypto — breadth gate pulls thin reads toward neutral", () => {
  it("a read with only exchange-native criteria doesn't reach an extreme score", () => {
    const result = scoreCrypto(baseInput({
      protocolRevenue30dUsd: null, devActivity: null, security: null, depth: null,
      market: baseMarket({ marketCapRank: null }),
    }))
    expect(result.qualityScore).not.toBeNull()
    expect(result.qualityScore!).toBeLessThan(90)
  })
})
