// Pre-foreclosure prediction — the forecast that runs before any filing.
//
// Two properties are protected here, both added after an audit found the engine
// scoring against its own purpose:
//
//   1. The signals that fire hardest — "price reduced", "must sell", "as-is" —
//      only EXIST in a listing description, so an actively marketed house looked
//      motivated while an identical off-market one looked like nothing. That is
//      backwards for finding owners nobody else has reached.
//   2. There was no notion of age at all, so a filing from 2021 and one from
//      last week produced the same forecast.
import { describe, it, expect } from "vitest"
import { predictPreForeclosure, isOnMarket, newestSignalAgeDays, isConfirmedForeclosure } from "@/lib/predictive"
import type { ForeclosureLead } from "@/lib/agents/foreclosure-agent"

const NOW = new Date("2026-09-24T00:00:00Z")
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString()

const lead = (o: Record<string, unknown> = {}) =>
  ({ address: "1 Test St", city: "Columbus", state: "OH", zip: "43201", ...o }) as unknown as ForeclosureLead

describe("telling an off-market owner from a listed one", () => {
  it("flags a property with days on market as listed", () => {
    expect(isOnMarket(lead({ daysOnMarket: 42 }))).toBe(true)
  })

  it("flags a property with a list price as listed", () => {
    expect(isOnMarket(lead({ listPrice: 259000 }))).toBe(true)
  })

  it("reads listing language as listed", () => {
    expect(isOnMarket(lead({ distressSignals: ["Redfin active listing"] }))).toBe(true)
  })

  it("treats an EXPIRED listing as off-market, because that is what it is", () => {
    // They tried to sell, the market said no, and the agent is gone. One of the
    // better signals there is — and the opposite of being listed.
    expect(isOnMarket(lead({ distressSignals: ["Expired listing 90+ days"] }))).toBe(false)
  })

  it("leaves a quiet off-market property unflagged", () => {
    expect(isOnMarket(lead({ distressSignals: ["Tax delinquent (open data)"] }))).toBe(false)
  })

  it("carries the flag onto the prediction so callers can filter on it", () => {
    const p = predictPreForeclosure(lead({ daysOnMarket: 10, distressSignals: ["price reduced", "as-is"] }))
    expect(p.onMarket).toBe(true)
  })

  it("still forecasts for an off-market owner with real distress", () => {
    const p = predictPreForeclosure(lead({
      distressSignals: ["Tax delinquent (open data)", "Vacant / abandoned (open data)"],
      occupancy: "vacant",
    }))
    expect(p.onMarket).toBe(false)
    expect(p.predicted).toBe(true)
    expect(p.probability).toBeGreaterThan(40)
  })
})

describe("how old the evidence is", () => {
  it("reports the age of the freshest dated signal", () => {
    expect(newestSignalAgeDays(lead({ recordingDate: daysAgo(30) }), NOW)).toBe(30)
  })

  it("takes the newest when several dates are present", () => {
    const age = newestSignalAgeDays(lead({ recordingDate: daysAgo(400), auctionDate: daysAgo(12) }), NOW)
    expect(age).toBe(12)
  })

  it("returns null rather than zero when nothing is dated", () => {
    // Zero would read as "filed today", which is the opposite of the truth.
    expect(newestSignalAgeDays(lead({}), NOW)).toBeNull()
  })

  it("ignores an unparseable date", () => {
    expect(newestSignalAgeDays(lead({ recordingDate: "not a date" }), NOW)).toBeNull()
  })

  it("puts the age on the prediction", () => {
    // predictPreForeclosure reads the real clock, so this is a day either side
    // of the fixture rather than an exact match.
    const p = predictPreForeclosure(lead({ recordingDate: daysAgo(45), distressSignals: ["tax delinquent"] }))
    expect(p.signalAgeDays).toBeGreaterThanOrEqual(45)
    expect(p.signalAgeDays).toBeLessThanOrEqual(46)
  })
})

describe("forecasts and filings stay separate", () => {
  it("does not forecast a property that is already being sold", () => {
    const l = lead({ foreclosureStage: "AUCTION", auctionDate: daysAgo(-14) })
    if (isConfirmedForeclosure(l)) {
      const p = predictPreForeclosure(l)
      expect(p.confirmed).toBe(true)
      expect(p.predicted).toBe(false)
    }
  })

  it("keeps the on-market and age fields on a confirmed filing too", () => {
    const l = lead({ foreclosureStage: "AUCTION", auctionDate: daysAgo(-7), recordingDate: daysAgo(20) })
    const p = predictPreForeclosure(l)
    expect(p).toHaveProperty("onMarket")
    expect(p).toHaveProperty("signalAgeDays")
  })
})

describe("stacking still drives the forecast", () => {
  it("rates several independent signals above one", () => {
    const one = predictPreForeclosure(lead({ distressSignals: ["tax delinquent"] })).probability
    const many = predictPreForeclosure(lead({
      distressSignals: ["tax delinquent", "vacant", "code violation"], occupancy: "vacant",
    })).probability
    expect(many).toBeGreaterThan(one)
  })

  it("reports low confidence on a single signal", () => {
    expect(predictPreForeclosure(lead({ distressSignals: ["absentee"] })).confidence).toBe("low")
  })
})
