// The investment verdict synthesis — runAgent is mocked so these never call
// a real model. What's under test is the parsing/validation contract: enum
// fallbacks, array caps, and clean failure when the model call throws.
import { describe, it, expect, vi } from "vitest"

vi.mock("@/lib/claude", () => ({ runAgent: vi.fn() }))
import { runAgent } from "@/lib/claude"
import { buildInvestmentVerdict, type VerdictInput } from "@/lib/investment-verdict"

function baseInput(overrides: Partial<VerdictInput> = {}): VerdictInput {
  return {
    symbol: "TEST", name: "Test Co",
    qualityScore: 70, riskScore: 30, strengthTier: "strong", actionSignal: "buy",
    convictionTier: "high", convictionSummary: "Cleared 8 of 9 gates.",
    valuationTier: "cheap_and_sound", valuationPercentile: 80,
    piotroskiScore: 7, altmanZone: "safe", beneishFlag: false,
    credibilityScore: 90, contradictionFlags: [],
    governanceSummary: "Well governed.", payAlignment: "aligned",
    ceoName: "Jane Doe", ceoTenureYears: 8, ceoIsFounder: false,
    insiderOwnershipPct: 6, boardSize: 9, independentDirectors: 7,
    leadershipScore: 78, leadershipStrengths: [], leadershipConcerns: [],
    relatedPartyTransactions: [], auditorConcerns: [], dualClass: false,
    capitalAllocationReasons: [], consistencyScore: 75,
    forwardScore: 65, forwardReasons: [],
    insiderSummary: null, litigationFlags: [], concentrationFlags: [],
    falsificationFragility: "robust", falsificationSummary: "Every condition sits clear.",
    falsificationTriggered: [],
    bearSummary: "Weak bear case.", bearKillShot: null,
    hasRestatement: false, goingConcernHits: 0,
    ...overrides,
  }
}

function mockAgentResponse(payload: Record<string, unknown>) {
  vi.mocked(runAgent).mockResolvedValueOnce(payload)
}

describe("buildInvestmentVerdict", () => {
  it("parses a well-formed response", async () => {
    mockAgentResponse({
      verdict: "Sound, well-governed, and currently cheap versus its own history.",
      managementQuality: "strong",
      leadQuality: "strong_lead",
      keyStrengths: ["Aligned pay", "High Piotroski"],
      keyConcerns: ["Thin margin"],
      conflictsOfInterest: [],
      confidenceCaveat: null,
    })
    const result = await buildInvestmentVerdict(baseInput())
    expect(result).not.toBeNull()
    expect(result!.managementQuality).toBe("strong")
    expect(result!.leadQuality).toBe("strong_lead")
    expect(result!.keyStrengths).toEqual(["Aligned pay", "High Piotroski"])
    expect(result!.conflictsOfInterest).toEqual([])
  })

  it("falls back to safe enum defaults on an invalid managementQuality/leadQuality", async () => {
    mockAgentResponse({
      verdict: "test", managementQuality: "amazing", leadQuality: "buy_now_10x",
      keyStrengths: [], keyConcerns: [], conflictsOfInterest: [], confidenceCaveat: null,
    })
    const result = await buildInvestmentVerdict(baseInput())
    expect(result!.managementQuality).toBe("unclear")
    expect(result!.leadQuality).toBe("worth_watching")
  })

  it("caps strengths/concerns/conflicts arrays", async () => {
    mockAgentResponse({
      verdict: "test", managementQuality: "strong", leadQuality: "strong_lead",
      keyStrengths: ["1", "2", "3", "4", "5", "6"],
      keyConcerns: ["1", "2", "3", "4", "5"],
      conflictsOfInterest: ["1", "2", "3", "4", "5", "6", "7", "8"],
      confidenceCaveat: null,
    })
    const result = await buildInvestmentVerdict(baseInput())
    expect(result!.keyStrengths).toHaveLength(4)
    expect(result!.keyConcerns).toHaveLength(4)
    expect(result!.conflictsOfInterest).toHaveLength(6)
  })

  it("passes through a disclosed conflict rather than dropping it", async () => {
    mockAgentResponse({
      verdict: "test", managementQuality: "concerning", leadQuality: "not_a_lead",
      keyStrengths: [], keyConcerns: [],
      conflictsOfInterest: ["Related-party lease with the CEO's family trust"],
      confidenceCaveat: null,
    })
    const result = await buildInvestmentVerdict(baseInput({
      relatedPartyTransactions: ["Related-party lease with the CEO's family trust"],
    }))
    expect(result!.conflictsOfInterest).toContain("Related-party lease with the CEO's family trust")
  })

  it("returns null when the model call throws", async () => {
    vi.mocked(runAgent).mockRejectedValueOnce(new Error("model unavailable"))
    const result = await buildInvestmentVerdict(baseInput())
    expect(result).toBeNull()
  })

  it("returns null on malformed JSON string response", async () => {
    vi.mocked(runAgent).mockResolvedValueOnce("not valid json {{{")
    const result = await buildInvestmentVerdict(baseInput())
    expect(result).toBeNull()
  })

  it("defaults confidenceCaveat to null when absent or blank", async () => {
    mockAgentResponse({
      verdict: "test", managementQuality: "adequate", leadQuality: "worth_watching",
      keyStrengths: [], keyConcerns: [], conflictsOfInterest: [], confidenceCaveat: "   ",
    })
    const result = await buildInvestmentVerdict(baseInput())
    expect(result!.confidenceCaveat).toBeNull()
  })
})
