// Predicting who will need to sell, before any filing exists.
//
// The point of this module is the window BEFORE a notice of default, when the
// owner is findable and nobody else is calling. So the tests protect the three
// things that make it useful rather than merely plausible: it excludes
// properties that are already on the market, it ranks tax arrears above
// cosmetic neglect, and it says when it does not know enough to be trusted.
import { describe, it, expect } from "vitest"
import {
  assessPreforeclosureRisk, rankByRisk, MIN_INPUTS_FOR_CONFIDENCE,
  type RiskInputs,
} from "@/lib/preforeclosure-risk"

describe("properties that are not the point", () => {
  it("excludes anything currently listed", () => {
    // A house with a sign in the yard has an agent, a price and a process.
    const r = assessPreforeclosureRisk({ onMarket: true, taxYearsDelinquent: 4, vacant: true })
    expect(r.band).toBe("EXCLUDED")
    expect(r.score).toBe(0)
    expect(r.excludedBecause).toContain("no discount to win")
  })

  it("excludes anything that has already been filed on", () => {
    // That is a distress lead, not a prediction — and a different module reads it.
    const r = assessPreforeclosureRisk({ hasPublicFiling: true, taxYearsDelinquent: 3 })
    expect(r.band).toBe("EXCLUDED")
    expect(r.action).toContain("distress scoring")
  })

  it("does NOT exclude a listing that expired unsold", () => {
    // They already decided to sell and the market said no. No agent in the way.
    const r = assessPreforeclosureRisk({ expiredListing: true, onMarket: false, vacant: true })
    expect(r.band).not.toBe("EXCLUDED")
    expect(r.factors.some(f => f.id === "expired")).toBe(true)
  })
})

describe("tax arrears lead everything else", () => {
  it("scores four years of arrears above any single other factor", () => {
    const tax = assessPreforeclosureRisk({ taxYearsDelinquent: 4 }).score
    for (const other of [
      { vacant: true }, { outOfStateOwner: true }, { estateVesting: true },
      { codeViolations: 5 }, { ltv: 1.2 }, { expiredListing: true },
    ] as RiskInputs[]) {
      expect(tax).toBeGreaterThan(assessPreforeclosureRisk(other).score)
    }
  })

  it("scales with how long the arrears have run", () => {
    const one = assessPreforeclosureRisk({ taxDelinquent: true }).score
    const two = assessPreforeclosureRisk({ taxYearsDelinquent: 2 }).score
    const four = assessPreforeclosureRisk({ taxYearsDelinquent: 4 }).score
    expect(one).toBeLessThan(two)
    expect(two).toBeLessThan(four)
  })

  it("explains WHY tax arrears predict a sale, not just that they scored", () => {
    const r = assessPreforeclosureRisk({ taxDelinquent: true })
    expect(r.factors[0].reason).toContain("becomes public")
  })
})

describe("stacking circumstances", () => {
  it("reaches IMMINENT when several independent circumstances agree", () => {
    // Four years of arrears, empty, owned by someone in another state.
    const r = assessPreforeclosureRisk({
      taxYearsDelinquent: 4, vacant: true, outOfStateOwner: true, codeViolations: 2,
    })
    expect(r.score).toBeGreaterThanOrEqual(70)
    expect(r.band).toBe("IMMINENT")
  })

  it("leaves a single ordinary circumstance in the background", () => {
    const r = assessPreforeclosureRisk({ absenteeOwner: true, vacant: false, taxDelinquent: false })
    expect(r.band).toBe("BACKGROUND")
  })

  it("ranks an out-of-state owner above a merely absentee one", () => {
    const far = assessPreforeclosureRisk({ outOfStateOwner: true }).score
    const near = assessPreforeclosureRisk({ absenteeOwner: true }).score
    expect(far).toBeGreaterThan(near)
  })

  it("does not let many code violations swamp the score", () => {
    // Five violations is one owner who has given up, not five problems.
    const five = assessPreforeclosureRisk({ codeViolations: 5 }).score
    const twenty = assessPreforeclosureRisk({ codeViolations: 20 }).score
    expect(twenty).toBe(five)
  })

  it("caps at 100 however much piles up", () => {
    const r = assessPreforeclosureRisk({
      taxYearsDelinquent: 6, vacant: true, outOfStateOwner: true, estateVesting: true,
      ltv: 1.3, codeViolations: 4, yearsOwned: 25, utilityShutoff: true, expiredListing: true,
    })
    expect(r.score).toBe(100)
  })
})

describe("saying when it does not know enough", () => {
  it("does not call an unexamined property low risk", () => {
    const r = assessPreforeclosureRisk({})
    expect(r.summary).toContain("not a low-risk property, an unexamined one")
  })

  it("marks a score built on almost nothing as a floor", () => {
    const r = assessPreforeclosureRisk({ vacant: true })
    expect(r.inputsPresent).toBeLessThan(MIN_INPUTS_FOR_CONFIDENCE)
    expect(r.summary).toContain("floor rather than a verdict")
    expect(r.action).toContain("Gather more")
  })

  it("stops hedging once enough is known", () => {
    const r = assessPreforeclosureRisk({
      taxYearsDelinquent: 4, vacant: true, outOfStateOwner: true, codeViolations: 1,
    })
    expect(r.inputsPresent).toBeGreaterThanOrEqual(MIN_INPUTS_FOR_CONFIDENCE)
    expect(r.summary).not.toContain("floor rather than a verdict")
  })
})

describe("underwater owners", () => {
  it("scores a genuinely underwater owner above one with thin equity", () => {
    expect(assessPreforeclosureRisk({ ltv: 1.2 }).score)
      .toBeGreaterThan(assessPreforeclosureRisk({ ltv: 0.95 }).score)
  })

  it("warns that being underwater caps what can be offered", () => {
    const r = assessPreforeclosureRisk({ ltv: 1.2 })
    expect(r.factors[0].reason).toContain("short sale")
  })

  it("ignores healthy equity entirely", () => {
    expect(assessPreforeclosureRisk({ ltv: 0.4 }).factors).toHaveLength(0)
  })
})

describe("ranking a universe", () => {
  it("puts the most motivated owner first and sinks the excluded", () => {
    const ranked = rankByRisk(
      [
        { id: "listed", inputs: { onMarket: true, taxYearsDelinquent: 5 } },
        { id: "quiet", inputs: { absenteeOwner: true } },
        { id: "motivated", inputs: { taxYearsDelinquent: 4, vacant: true, outOfStateOwner: true } },
      ],
      x => x.inputs as RiskInputs,
    )
    expect(ranked[0].item.id).toBe("motivated")
    expect(ranked[ranked.length - 1].item.id).toBe("listed")
  })

  it("breaks a tie toward the owner we know more about", () => {
    const ranked = rankByRisk(
      [
        { id: "thin", inputs: { vacant: true } },
        { id: "known", inputs: { vacant: true, taxDelinquent: false, absenteeOwner: false, ltv: 0.5 } },
      ],
      x => x.inputs as RiskInputs,
    )
    expect(ranked[0].item.id).toBe("known")
  })
})
