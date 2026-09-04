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

describe("scoreCrypto — revenue-yield percentile (lib/crypto-percentile.ts)", () => {
  it("a top-percentile revenue yield outscores the same asset scored on the fixed formula alone", () => {
    const withPercentile = scoreCrypto(baseInput({ revenueYieldPercentile: 95, revenueYieldPeerCount: 200 }))
    const formulaOnly = scoreCrypto(baseInput({ revenueYieldPercentile: null }))
    expect(withPercentile.qualityScore!).toBeGreaterThan(formulaOnly.qualityScore!)
  })

  it("a bottom-percentile revenue yield underscores the fixed-formula-only reading", () => {
    const withPercentile = scoreCrypto(baseInput({ revenueYieldPercentile: 5, revenueYieldPeerCount: 200 }))
    const formulaOnly = scoreCrypto(baseInput({ revenueYieldPercentile: null }))
    expect(withPercentile.qualityScore!).toBeLessThan(formulaOnly.qualityScore!)
  })

  it("falls back to the fixed formula and still scores when no peer sample exists", () => {
    const result = scoreCrypto(baseInput({
      protocolRevenue30dUsd: 10_000_000, // well above the 3% annualized-yield threshold
      revenueYieldPercentile: null, revenueYieldPeerCount: null,
    }))
    expect(result.qualityScore).not.toBeNull()
    expect(result.qualityReasons.some(r => r.includes("real protocol revenue"))).toBe(true)
  })

  it("reports the peer count in the reasons when a percentile was used", () => {
    const result = scoreCrypto(baseInput({ revenueYieldPercentile: 80, revenueYieldPeerCount: 340 }))
    expect(result.qualityReasons.some(r => r.includes("340"))).toBe(true)
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

describe("substance gate — the memecoin problem", () => {
  // Found in the live rankings: PEPE scored 92/100, above Ethereum, with no
  // revenue, no TVL and no developers. Weight renormalization dropped every
  // criterion it failed and redistributed that weight onto the ones it aced.
  function memecoinLike(overrides: Partial<CryptoScoreInput> = {}) {
    return baseInput({
      protocolRevenue30dUsd: null,   // genuinely none
      tvlUsd: null,                  // genuinely none
      devActivity: null,             // no public development
      onChainPercentile: null,
      market: baseMarket({ maxSupply: 1e9, circulatingSupply: 1e9, fdvUsd: 1e9, marketCapUsd: 1e9 }),
      ...overrides,
    })
  }

  it("caps an asset with no revenue, no TVL and no development", () => {
    const r = scoreCrypto(memecoinLike())
    expect(r.qualityScore!).toBeLessThanOrEqual(45)
  })

  it("explains WHY it was capped rather than just scoring it low", () => {
    const r = scoreCrypto(memecoinLike())
    expect(r.qualityReasons[0]).toMatch(/nothing measurable underpins/i)
    expect(r.qualityReasons[0]).toMatch(/not automatically a scam/i)
  })

  it("ranks a real protocol above a memecoin with identical tokenomics", () => {
    const meme = scoreCrypto(memecoinLike())
    const protocol = scoreCrypto(memecoinLike({
      protocolRevenue30dUsd: 5_000_000,
      tvlUsd: 800_000_000,
      devActivity: { devActivityScore: 80, commitsLast12Weeks: 300 } as never,
    }))
    expect(protocol.qualityScore!).toBeGreaterThan(meme.qualityScore!)
  })

  it("applies a softer cap when exactly one fundamental is present", () => {
    const one = scoreCrypto(memecoinLike({ tvlUsd: 500_000_000 }))
    expect(one.qualityScore!).toBeLessThanOrEqual(68)
    expect(one.qualityScore!).toBeGreaterThan(45)
  })

  it("does not cap an asset with all three fundamentals", () => {
    const full = scoreCrypto(memecoinLike({
      protocolRevenue30dUsd: 5_000_000,
      tvlUsd: 800_000_000,
      devActivity: { devActivityScore: 80, commitsLast12Weeks: 300 } as never,
    }))
    expect(full.qualityScore!).toBeGreaterThan(68)
  })
})

describe("TVL scoring", () => {
  it("rewards capital locked relative to market cap", () => {
    const low = scoreCrypto(baseInput({ tvlUsd: 1e7, market: baseMarket({ marketCapUsd: 1e9 }) }))
    const high = scoreCrypto(baseInput({ tvlUsd: 8e8, market: baseMarket({ marketCapUsd: 1e9 }) }))
    expect(high.qualityScore!).toBeGreaterThan(low.qualityScore!)
  })

  it("calls out strong locked capital in the reasons", () => {
    const r = scoreCrypto(baseInput({ tvlUsd: 9e8, market: baseMarket({ marketCapUsd: 1e9 }) }))
    expect(r.qualityReasons.some(x => /locked capital|real money committed/i.test(x))).toBe(true)
  })
})

describe("wash-trade detection — reported vs regulated volume", () => {
  it("flags a token whose reported volume dwarfs what regulated venues clear", () => {
    const r = scoreCrypto(baseInput({
      market: baseMarket({ volume24hUsd: 500_000_000, marketCapUsd: 50_000_000 }),
      exchange: { venueCount: 2, divergencePct: 0.1, spreadPct: 0.1, liquidityGrade: "adequate",
                  volume24hUsd: 2_000_000, consensusPrice: 100, notes: [] } as never,
    }))
    expect(r.riskFlags.some(f => /wash trading/i.test(f))).toBe(true)
    expect(r.qualityScore!).toBeLessThanOrEqual(40)
  })

  it("does not flag an asset whose reported and regulated volume broadly agree", () => {
    const r = scoreCrypto(baseInput({
      market: baseMarket({ volume24hUsd: 50_000_000 }),
      exchange: { venueCount: 2, divergencePct: 0.1, spreadPct: 0.1, liquidityGrade: "deep",
                  volume24hUsd: 40_000_000, consensusPrice: 100, notes: [] } as never,
    }))
    expect(r.riskFlags.some(f => /wash trading/i.test(f))).toBe(false)
  })
})

describe("turnover is scored as a band, not a slope", () => {
  it("does not award full marks for implausible turnover", () => {
    const healthy = scoreCrypto(baseInput({ market: baseMarket({ volume24hUsd: 5e7, marketCapUsd: 1e9 }) }))   // 5%
    const absurd  = scoreCrypto(baseInput({ market: baseMarket({ volume24hUsd: 2e9, marketCapUsd: 1e9 }) }))   // 200%
    expect(absurd.qualityScore!).toBeLessThan(healthy.qualityScore!)
  })

  it("still penalises a near-dead market", () => {
    const dead    = scoreCrypto(baseInput({ market: baseMarket({ volume24hUsd: 1e5, marketCapUsd: 1e9 }) }))   // 0.01%
    const healthy = scoreCrypto(baseInput({ market: baseMarket({ volume24hUsd: 5e7, marketCapUsd: 1e9 }) }))
    expect(dead.qualityScore!).toBeLessThan(healthy.qualityScore!)
  })
})

describe("on-chain settlement counts as economic substance", () => {
  it("does not cap a settlement chain with real on-chain activity as speculative", () => {
    // A payments chain: no DeFi TVL, no protocol fees we capture, but a real ledger.
    const chain = scoreCrypto(baseInput({
      protocolRevenue30dUsd: null, tvlUsd: null, devActivity: null,
      onChainPercentile: 70,
    }))
    expect(chain.qualityScore!).toBeGreaterThan(45)
  })

  it("still caps a token with no on-chain read and nothing else", () => {
    const meme = scoreCrypto(baseInput({
      protocolRevenue30dUsd: null, tvlUsd: null, devActivity: null, onChainPercentile: null,
    }))
    expect(meme.qualityScore!).toBeLessThanOrEqual(45)
  })
})
