// Customer/geographic concentration — full-text detection over filing prose
// (see lib/concentration-risk.ts for why this isn't dimensional XBRL parsing).
import { describe, it, expect } from "vitest"
import { detectConcentrationRisk } from "@/lib/concentration-risk"

// Padding to clear the 2000-character floor that guards against firing on
// filings too short for "no concentration language found" to mean anything.
const PADDING = "This is background business description text that adds length without matching any concentration pattern. ".repeat(20)

describe("detectConcentrationRisk", () => {
  it("returns null below the minimum text length", () => {
    expect(detectConcentrationRisk("short text", "also short")).toBeNull()
  })

  it("finds no concentration language in generic prose and returns an empty, unpenalized read", () => {
    const result = detectConcentrationRisk(PADDING, PADDING)
    expect(result).not.toBeNull()
    expect(result!.riskPenalty).toBe(0)
    expect(result!.flags).toHaveLength(0)
  })

  it("flags material customer concentration above 25% with the higher penalty", () => {
    const text = `${PADDING} Our largest customer accounted for 32% of total revenue in the most recent fiscal year. ${PADDING}`
    const result = detectConcentrationRisk(text, null)
    expect(result!.maxCustomerPct).toBe(32)
    expect(result!.riskPenalty).toBe(12)
    expect(result!.flags[0]).toContain("Customer concentration")
  })

  it("flags customer concentration between 10-25% with the lower penalty", () => {
    const text = `${PADDING} Our largest customer accounted for 15% of total revenue in the most recent fiscal year. ${PADDING}`
    const result = detectConcentrationRisk(text, null)
    expect(result!.maxCustomerPct).toBe(15)
    expect(result!.riskPenalty).toBe(6)
  })

  it("does not penalize customer concentration below the 10% floor", () => {
    const text = `${PADDING} Our largest customer accounted for 4% of total revenue in the most recent fiscal year. ${PADDING}`
    const result = detectConcentrationRisk(text, null)
    expect(result!.maxCustomerPct).toBe(4)
    expect(result!.riskPenalty).toBe(0)
    expect(result!.flags).toHaveLength(0)
  })

  it("reports geographic concentration as an informational note, never a penalty", () => {
    const text = `${PADDING} Approximately 61% of our revenue was generated outside the United States in the most recent fiscal year. ${PADDING}`
    const result = detectConcentrationRisk(text, null)
    expect(result!.geographicConcentrationSentences.length).toBeGreaterThan(0)
    expect(result!.notes.length).toBeGreaterThan(0)
    expect(result!.riskPenalty).toBe(0)
    expect(result!.flags).toHaveLength(0)
  })
})
