// Contradiction detection — management's claims checked against audited
// numbers. The no-narrative branch is tested explicitly: it must return
// null, not a neutral 50, or every un-researched ticker silently fails the
// conviction gate that reads this value (the bug this system shipped once
// already, see lib/conviction.ts tests).
import { describe, it, expect } from "vitest"
import { checkContradictions } from "@/lib/contradiction-check"
import type { NarrativeRead } from "@/lib/edgar-narrative"
import type { ForwardSignals } from "@/lib/forward-signals"
import type { AccountingQuality } from "@/lib/accounting-quality"
import type { BalanceSheetRisk } from "@/lib/balance-sheet-risk"
import type { CapitalAllocationResult } from "@/lib/capital-allocation"
import type { NormalizedFundamentals } from "@/lib/edgar-normalize"

function narrative(overrides: Partial<NarrativeRead> = {}): NarrativeRead {
  return {
    strategy: [], growthDrivers: [], headwinds: [], capitalPlans: [],
    outlookTone: "unclear", toneEvidence: "", summary: "",
    sourceUrl: "https://example.com", filingDate: "2026-01-01",
    ...overrides,
  }
}

function baseArgs(overrides: Partial<{
  narrative: NarrativeRead | null
  fundamentals: NormalizedFundamentals
  forward: ForwardSignals
  accounting: AccountingQuality
  balanceSheet: BalanceSheetRisk
  capitalAllocation: CapitalAllocationResult
}> = {}) {
  return {
    narrative: narrative(),
    fundamentals: { netMarginPct: 10, operatingMarginPct: 12 } as NormalizedFundamentals,
    forward: { revenueAccelerationPct: 0 } as ForwardSignals,
    accounting: { avgCashConversion: 0.9, inventoryTurnsTrend: 0, dsoTrendDays: 0 } as AccountingQuality,
    balanceSheet: { riskPenalty: 0, debtWallToFcfYears: 0, sbcToRevenuePct: 0 } as BalanceSheetRisk,
    capitalAllocation: { avgBuybackPricePercentile: null } as CapitalAllocationResult,
    ...overrides,
  }
}

describe("checkContradictions — no narrative available", () => {
  it("returns credibilityScore null, not a neutral 50", () => {
    const result = checkContradictions(baseArgs({ narrative: null }))
    expect(result.credibilityScore).toBeNull()
    expect(result.riskPenalty).toBe(0)
    expect(result.contradictions).toHaveLength(0)
  })
})

describe("checkContradictions — growth claim vs. actual deceleration", () => {
  it("flags a high-severity contradiction when growth is claimed but decelerating sharply", () => {
    const result = checkContradictions(baseArgs({
      narrative: narrative({ growthDrivers: ["We delivered record revenue growth this quarter."] }),
      forward: { revenueAccelerationPct: -12 } as ForwardSignals,
    }))
    expect(result.contradictions.length).toBeGreaterThan(0)
    expect(result.contradictions[0].severity).toBe("high")
    expect(result.credibilityScore).toBeLessThan(100)
    expect(result.riskPenalty).toBeGreaterThan(0)
  })

  it("does not flag a contradiction when no growth claim was made", () => {
    const result = checkContradictions(baseArgs({
      narrative: narrative({ growthDrivers: [] }),
      forward: { revenueAccelerationPct: -12 } as ForwardSignals,
    }))
    expect(result.contradictions).toHaveLength(0)
  })
})

describe("checkContradictions — cash generation claim vs. weak conversion", () => {
  it("flags when 'strong cash flow' is claimed but conversion is below 0.75", () => {
    const result = checkContradictions(baseArgs({
      narrative: narrative({ growthDrivers: ["Strong cash flow generation continued this year."] }),
      accounting: { avgCashConversion: 0.5, inventoryTurnsTrend: 0, dsoTrendDays: 0 } as AccountingQuality,
    }))
    expect(result.contradictions.some(c => c.reality.includes("cash"))).toBe(true)
  })
})

describe("checkContradictions — debt maturity omission", () => {
  it("flags an omission when a large debt wall is never discussed", () => {
    const result = checkContradictions(baseArgs({
      narrative: narrative({ summary: "We had a fine year with no notable commentary here." }),
      balanceSheet: { riskPenalty: 0, debtWallToFcfYears: 3, sbcToRevenuePct: 0 } as BalanceSheetRisk,
    }))
    expect(result.omissions.length).toBeGreaterThan(0)
  })

  it("does not flag the omission when debt IS discussed", () => {
    const result = checkContradictions(baseArgs({
      narrative: narrative({ headwinds: ["We are actively managing our debt maturity and refinancing plans."] }),
      balanceSheet: { riskPenalty: 0, debtWallToFcfYears: 3, sbcToRevenuePct: 0 } as BalanceSheetRisk,
    }))
    expect(result.omissions).toHaveLength(0)
  })
})

describe("checkContradictions — clean narrative scores full credibility", () => {
  it("no claims, no contradictions → credibilityScore 100", () => {
    const result = checkContradictions(baseArgs({ narrative: narrative() }))
    expect(result.credibilityScore).toBe(100)
    expect(result.flags).toHaveLength(0)
  })
})
