// The opportunity screen's gates — every one of these is a hard disqualifier
// by design (see lib/opportunity-screen.ts header). These tests exist to
// keep that contract: a fact-based disqualifier must reject regardless of
// how good the surrounding numbers look, and a below-bar conviction tier
// (added this session) must actually reject, not just get computed and
// ignored — that was the exact bug fixed earlier in this system.
import { describe, it, expect } from "vitest"
import { disqualify, hasDisqualifyingRedFlag } from "@/lib/opportunity-screen"

function goodTicker(overrides: Record<string, unknown> = {}) {
  return {
    symbol: "GOOD", name: "Good Co", sector: "Software", exchange: "NASDAQ", sicCode: "7372",
    qualityScore: 70, riskScore: 30, dataConfidence: "high",
    valuationScore: 70, valuationPercentile: 70, fcfYieldPct: 6,
    piotroskiScore: 7, altmanZone: "safe", beneishFlag: false,
    goingConcernHits: 0, revenueTtm: 2_000_000_000, freeCashFlowTtm: 200_000_000,
    hasRestatement: false, debtWallToFcfYears: 0.5,
    actionSignal: "buy", riskFlags: [],
    convictionTier: "high", convictionSummary: "Cleared 9 of 10 gates.", credibilityScore: 90,
    falsificationFragility: "robust", falsificationSummary: null, falsificationTriggered: null,
    ...overrides,
  }
}

describe("hasDisqualifyingRedFlag — facts that end the conversation", () => {
  it("passes a genuinely sound company", () => {
    expect(hasDisqualifyingRedFlag(goodTicker() as never)).toBeNull()
  })

  it("rejects low/insufficient data confidence", () => {
    expect(hasDisqualifyingRedFlag(goodTicker({ dataConfidence: "low" }) as never)).not.toBeNull()
  })

  it("rejects an active going-concern disclosure", () => {
    expect(hasDisqualifyingRedFlag(goodTicker({ goingConcernHits: 1 }) as never)).not.toBeNull()
  })

  it("rejects a restatement", () => {
    expect(hasDisqualifyingRedFlag(goodTicker({ hasRestatement: true }) as never)).not.toBeNull()
  })

  it("rejects Altman distress zone", () => {
    expect(hasDisqualifyingRedFlag(goodTicker({ altmanZone: "distress" }) as never)).not.toBeNull()
  })

  it("rejects a Beneish manipulation flag", () => {
    expect(hasDisqualifyingRedFlag(goodTicker({ beneishFlag: true }) as never)).not.toBeNull()
  })

  it("rejects a below-bar conviction tier even with clean individual facts", () => {
    // This is the wiring fixed this session: conviction used to be computed
    // and stored, and never actually gated anything.
    const reason = hasDisqualifyingRedFlag(goodTicker({ convictionTier: "below-bar", convictionSummary: "Failed 5 of 9 gates." }) as never)
    expect(reason).toBe("Failed 5 of 9 gates.")
  })
})

describe("disqualify — thresholds beyond the hard facts", () => {
  it("rejects below the quality floor", () => {
    expect(disqualify(goodTicker({ qualityScore: 40 }) as never)).not.toBeNull()
  })

  it("rejects above the risk ceiling", () => {
    expect(disqualify(goodTicker({ riskScore: 80 }) as never)).not.toBeNull()
  })

  it("rejects a deteriorating Piotroski trend", () => {
    expect(disqualify(goodTicker({ piotroskiScore: 2 }) as never)).not.toBeNull()
  })

  it("rejects when not priced below its own historical norm", () => {
    expect(disqualify(goodTicker({ valuationScore: 30 }) as never)).not.toBeNull()
  })

  it("rejects negative free cash flow even when 'cheap'", () => {
    expect(disqualify(goodTicker({ freeCashFlowTtm: -1 }) as never)).not.toBeNull()
  })

  it("rejects mega-caps as having no informational edge", () => {
    expect(disqualify(goodTicker({ revenueTtm: 100_000_000_000 }) as never)).not.toBeNull()
  })

  it("rejects companies too small to be a realistic liquid holding", () => {
    expect(disqualify(goodTicker({ revenueTtm: 10_000_000 }) as never)).not.toBeNull()
  })

  it("a company that clears every gate is never rejected", () => {
    expect(disqualify(goodTicker() as never)).toBeNull()
  })
})
