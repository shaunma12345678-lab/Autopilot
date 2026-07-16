// Unit tests for the money math — the pure functions where a silent bug costs
// a user a real deal. No network, fully deterministic.

import { describe, it, expect } from "vitest"
import { analyzeDeal } from "@/lib/deal-analysis"
import { potentialScore, zipDensityMap, POTENTIAL_VERSION } from "@/lib/potential-score"
import { applyOutcomes, computeForecastStats, emptyLedger } from "@/lib/forecast-ledger"
import { indexSig, computeConfidence, SOURCE_TRUST } from "@/lib/property-index"
import { hasFeature } from "@/lib/plans"
import { dealBrief } from "@/lib/deal-brief"
import type { ForeclosureLead } from "@/lib/agents/foreclosure-agent"

function lead(over: Partial<ForeclosureLead> = {}): ForeclosureLead {
  return {
    attomId: 1, address: "123 Main St", city: "Memphis", state: "TN", zip: "38118",
    ownerName: "Jane Doe", ownerName2: null, ownerType: "individual", isAbsentee: false,
    mailingAddress: null, yearsOwned: 8, phone: null, email: null, linkedInUrl: null, contactConfidence: null,
    foreclosureType: "NOD", foreclosureStage: "NOTICE_OF_DEFAULT", recordingDate: "2026-06-01",
    daysOnFile: 30, defaultAmount: 12000, lender: "Bank", auctionDate: null,
    estimatedValue: 200000, avmValue: null, avmConfidence: null, purchasePrice: 120000, purchaseDate: "2018-05-01",
    totalLiens: 90000, lienCount: 1, estimatedEquity: 110000, equityPercent: 55, taxDelinquent: false,
    propertyType: "Single Family", beds: 3, baths: 2, sqft: 1400, yearBuilt: 1985, lotSize: null,
    score: 72, priority: "HOT", scoreBreakdown: { equity: 20, distress: 20, stage: 15, owner: 10, property: 7 },
    scoreReason: "NOD + equity", distressSignals: ["Notice of default filed"], dealCalc: null, outreach: null,
    rentEstimate: 1400, comps: [],
    ...over,
  } as unknown as ForeclosureLead
}

describe("analyzeDeal", () => {
  it("produces a coherent underwrite: MAO below ARV, breakdown consistent", () => {
    const d = analyzeDeal(lead())
    expect(d.hasValue).toBe(true)
    expect(d.arv).toBeGreaterThan(0)
    expect(d.mao).toBeLessThan(d.arv)
    expect(d.mao).toBeGreaterThan(0)
    expect(["A", "B", "C", "D", "F"]).toContain(d.grade)
    // The explicit MAO breakdown must reconcile: ARV − all line items = MAO.
    const b = d.maoDetail
    expect(b).not.toBeNull()
    if (!b) return
    const rebuilt = b.arv - b.commission - b.closingBuy - b.closingSell - b.holding - b.renovation - b.profit
    expect(Math.abs(rebuilt - b.mao)).toBeLessThanOrEqual(1)
  })

  it("anchors thin leads to fallbackValue and flags the estimate", () => {
    const thin = lead({ estimatedValue: null, avmValue: null, sqft: null, purchasePrice: null, comps: [] })
    const d = analyzeDeal(thin, undefined, { fallbackValue: 250000 })
    expect(d.hasValue).toBe(true)
    expect(d.valueEstimated).toBe(true)
    expect(d.arv).toBe(250000)
  })

  it("returns no value rather than inventing one", () => {
    const thin = lead({ estimatedValue: null, avmValue: null, sqft: null, purchasePrice: null, comps: [] })
    const d = analyzeDeal(thin)
    expect(d.hasValue).toBe(false)
  })
})

describe("potentialScore", () => {
  it("scores 0-100 with a full explainable breakdown", () => {
    const p = potentialScore(lead())
    expect(p.version).toBe(POTENTIAL_VERSION)
    expect(p.score).toBeGreaterThanOrEqual(0)
    expect(p.score).toBeLessThanOrEqual(100)
    expect(p.parts.length).toBeGreaterThanOrEqual(3)
    for (const part of p.parts) {
      expect(part.score).toBeGreaterThanOrEqual(0)
      expect(part.score).toBeLessThanOrEqual(100)
      expect(part.reason.length).toBeGreaterThan(0)
    }
  })

  it("renormalizes when context is missing (no fake liquidity/market points)", () => {
    const bare = potentialScore(lead())
    const withCtx = potentialScore(lead(), { marketUpside: 80, buyersInCounty: 20, zipDistressDensity: 70 })
    expect(bare.parts.find((p) => p.key === "liquidity")).toBeUndefined()
    expect(withCtx.parts.find((p) => p.key === "liquidity")).toBeDefined()
    expect(withCtx.parts.find((p) => p.key === "market")).toBeDefined()
  })

  it("zipDensityMap rates every zip 0-100", () => {
    const m = zipDensityMap([lead(), lead({ zip: "38118" }), lead({ zip: "38109", distressSignals: [] })])
    for (const v of m.values()) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(100)
    }
  })
})

describe("forecast ledger (outcome verification)", () => {
  it("predicted → later confirmed = verified hit with lead time", () => {
    let ledger = emptyLedger()
    ledger = applyOutcomes(ledger, [{ sig: "123mainst|38118", addr: "A", predicted: true, probability: 70, confirmed: false }])
    expect(Object.keys(ledger.pred)).toHaveLength(1)
    // Simulate the prediction having been made 30 days ago.
    ledger.pred["123mainst|38118"].t = new Date(Date.now() - 30 * 86400000).toISOString()
    ledger = applyOutcomes(ledger, [{ sig: "123mainst|38118", addr: "A", predicted: false, probability: 0, confirmed: true }])
    expect(ledger.hits).toHaveLength(1)
    expect(ledger.hits[0].leadDays).toBeGreaterThanOrEqual(29)
    expect(ledger.pred["123mainst|38118"]).toBeUndefined()
  })

  it("watched-but-not-flagged → confirmed = miss; first-seen-confirmed = preexisting (no credit either way)", () => {
    let ledger = emptyLedger()
    ledger = applyOutcomes(ledger, [{ sig: "456oakave|38109", addr: "W", predicted: false, probability: 0, confirmed: false }])
    ledger = applyOutcomes(ledger, [
      { sig: "456oakave|38109", addr: "W", predicted: false, probability: 0, confirmed: true },   // miss
      { sig: "789elmdr|38111", addr: "P", predicted: false, probability: 0, confirmed: true },   // preexisting
    ])
    expect(ledger.nMiss).toBe(1)
    expect(ledger.nPre).toBe(1)
    const stats = computeForecastStats(ledger)
    expect(stats.coveragePct).toBe(0)
    expect(stats.preexisting).toBe(1)
  })

  it("never double-counts a confirmed property", () => {
    let ledger = emptyLedger()
    const confirm = [{ sig: "321pinest|38112", addr: "C", predicted: false, probability: 0, confirmed: true }]
    ledger = applyOutcomes(ledger, confirm)
    ledger = applyOutcomes(ledger, confirm)
    expect(ledger.nPre).toBe(1)
  })
})

describe("property index primitives", () => {
  it("indexSig normalizes address variants to one identity", () => {
    expect(indexSig("123 Main St.", "38118")).toBe(indexSig("123 MAIN ST", "38118"))
    expect(indexSig("123 Main St", "38118")).not.toBe(indexSig("123 Main St", "38109"))
  })

  it("source trust ranks assessor above listings above web-AI", () => {
    expect(SOURCE_TRUST["county-assessor"]).toBeGreaterThan(SOURCE_TRUST["listing"])
    expect(SOURCE_TRUST["listing"]).toBeGreaterThan(SOURCE_TRUST["web-ai"])
  })

  it("confidence rises with trusted fields and stays in bounds", () => {
    const now = new Date().toISOString()
    const low = computeConfidence({}, false)
    const high = computeConfidence({
      ownerName: { v: "X", src: "county-assessor", t: 95, at: now },
      sqft: { v: 1400, src: "county-assessor", t: 95, at: now },
      yearBuilt: { v: 1985, src: "county-assessor", t: 95, at: now },
      estimatedValue: { v: 200000, src: "rentcast", t: 85, at: now },
      beds: { v: 3, src: "county-assessor", t: 95, at: now },
    }, true)
    expect(high).toBeGreaterThan(low)
    expect(high).toBeLessThanOrEqual(100)
    expect(low).toBeGreaterThanOrEqual(0)
  })
})

describe("plan gating", () => {
  it("tiers unlock cumulatively and legacy plans map safely", () => {
    expect(hasFeature("FREE", "deep-search")).toBe(false)
    expect(hasFeature("STARTER", "deep-search")).toBe(true)
    expect(hasFeature("STARTER", "predictive")).toBe(false)
    expect(hasFeature("PRO", "predictive")).toBe(true)
    expect(hasFeature("PRO", "inbound-sellers")).toBe(false)
    expect(hasFeature("AGENCY_GROWTH", "inbound-sellers")).toBe(true)
    expect(hasFeature("GROWTH", "deep-search")).toBe(true)         // legacy → STARTER-equivalent
    expect(hasFeature(null, "deep-search")).toBe(false)
    expect(hasFeature("ENTERPRISE", "inbound-sellers")).toBe(true)
  })
})

describe("dealBrief (due diligence)", () => {
  it("rich lead: high confidence, few gaps, explanation cites the verdict", () => {
    const b = dealBrief(lead({ occupancy: "vacant", phone: "555-1234" } as never))
    expect(b.confidence).toBeGreaterThanOrEqual(60)
    expect(b.gaps.filter((g) => g.severity === "high")).toHaveLength(0)
    expect(b.explanation).toContain("Verdict:")
    expect(b.checklist.length).toBeGreaterThanOrEqual(3)
  })

  it("thin lead: flags the blocking gaps with fixes, low confidence", () => {
    const b = dealBrief(lead({ estimatedValue: null, avmValue: null, sqft: null, purchasePrice: null, ownerName: "", comps: [] }))
    expect(b.confidence).toBeLessThan(45)
    const keys = b.gaps.map((g) => g.key)
    expect(keys).toContain("value")
    expect(keys).toContain("owner")
    for (const g of b.gaps) expect(g.fillWith.length).toBeGreaterThan(0)
    // High-severity gaps must sort first.
    const sev = b.gaps.map((g) => g.severity)
    expect(sev.indexOf("high")).toBe(0)
  })
})
