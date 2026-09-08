// Prose checks — the tests that matter are the ones proving a defect is
// actually CAUGHT. A check that returns a report for everything would pass a
// "does it run" test while letting invented figures and truncated scripts
// through, which is the exact failure this exists to prevent.
import { describe, it, expect } from "vitest"
import { checkProse, claimNumbers, issuesAsInstructions } from "@/lib/content/prose-check"

const CONTEXT = `RUN CONTEXT
Median sale price in the area is $412,000. Inventory is down 18%.
The shop has been open 7 years and serves 250 customers a week.`

function codes(body: string, opts: Parameters<typeof checkProse>[1] = { kind: "script", requireCta: false }) {
  return checkProse(body, opts).issues.map((i) => i.code)
}

describe("invented numbers — the most damaging thing the pipeline can emit", () => {
  it("flags a figure that appears nowhere in the grounding", () => {
    const body = "Homes here sell for $850,000 on average. Call us today to book a valuation."
    const found = codes(body, { kind: "script", context: CONTEXT, requireCta: true })
    expect(found).toContain("unsupported-number")
  })

  it("accepts a figure taken verbatim from the grounding", () => {
    const body = "The median sale price here is $412,000 right now. Book a valuation with us this week."
    const found = codes(body, { kind: "script", context: CONTEXT, requireCta: true })
    expect(found).not.toContain("unsupported-number")
  })

  it("matches across formatting, so $412,000 and 412000 are the same number", () => {
    const body = "Median price sits at 412000 today. Come in and we will walk you through it."
    const found = codes(body, { kind: "script", context: CONTEXT, requireCta: true })
    expect(found).not.toContain("unsupported-number")
  })

  it("expands magnitude suffixes before deciding a number is invented", () => {
    const context = "Total volume last year was 2,400,000 dollars."
    const body = "We moved $2.4M last year. Call us to talk numbers."
    const found = codes(body, { kind: "script", context, requireCta: true })
    expect(found).not.toContain("unsupported-number")
  })

  it("treats structural numbers as scaffolding, not claims", () => {
    // "Slide 3" and "beat 2" are not assertions about the world.
    expect(claimNumbers("Slide 3 of 5. Beat 2 lands here.")).toHaveLength(0)
  })

  it("treats units and large values as claims", () => {
    const found = claimNumbers("We saw 37% growth, $1,200 saved, and 450 signups.")
    expect(found).toEqual(expect.arrayContaining(["37%", "$1,200", "450"]))
  })
})

describe("truncation — invisible without a check", () => {
  it("catches copy that stops mid-sentence", () => {
    const body = "Here is the thing nobody tells you about pricing a home in this market. The first mistake is"
    expect(codes(body)).toContain("truncated")
  })

  it("accepts copy that ends on terminal punctuation", () => {
    const body = "Here is the thing nobody tells you about pricing a home. Most sellers guess. Do not guess."
    expect(codes(body)).not.toContain("truncated")
  })
})

describe("multi-section packs", () => {
  const SECTIONS = ["=== TIKTOK / REEL", "=== EMAIL"]

  it("catches a pack that is missing a required section", () => {
    const body = "=== TIKTOK / REEL ===\nThis is the spoken script and it runs a while. Come in this week."
    const report = checkProse(body, { kind: "repurpose", requiredSections: SECTIONS, requireCta: true })
    expect(report.issues.map((i) => i.code)).toContain("missing-section")
    expect(report.passed).toBe(false)
  })

  it("passes when every required section is present", () => {
    const body =
      "=== TIKTOK / REEL ===\nShort punch. Then a longer line that carries the actual argument all the way through.\n" +
      "=== EMAIL ===\nSubject: the one number that matters.\nBook a call with us this week."
    const found = checkProse(body, { kind: "repurpose", requiredSections: SECTIONS, requireCta: true })
      .issues.map((i) => i.code)
    expect(found).not.toContain("missing-section")
  })
})

describe("editorial quality", () => {
  it("catches leftover placeholders the writer was told to fill", () => {
    const body = "Welcome to [business name], where we do great work. Call us today to get started."
    expect(codes(body)).toContain("placeholder")
  })

  it("catches cliches standing in for a specific claim", () => {
    const body = "In today's fast-paced world, our seamless service is a game-changer. Call us now to book."
    expect(codes(body)).toContain("cliche")
  })

  it("catches a hook that opens on filler", () => {
    const body = "Have you ever wondered how homes get priced? Here is the answer. Call us today."
    expect(codes(body)).toContain("weak-opener")
  })

  it("catches monotone rhythm", () => {
    // Six sentences, all the same length — the clearest signal of unedited prose.
    const body = Array.from({ length: 6 }, (_, i) => `This is sentence number ${i} here now.`).join(" ")
    expect(codes(body)).toContain("monotone-rhythm")
  })

  it("does not flag rhythm when sentence length actually varies", () => {
    const body = "Stop. Most sellers price on feeling, not on what the last three comparable homes " +
                 "actually closed at, and that single mistake costs them weeks on market. Do not guess. " +
                 "Ask instead."
    expect(codes(body)).not.toContain("monotone-rhythm")
  })

  it("catches missing calls to action where the format needs one", () => {
    const body = "Most sellers price on feeling. The last three comparables tell a different story entirely. " +
                 "That gap is where money disappears."
    expect(codes(body, { kind: "script", requireCta: true })).toContain("no-cta")
  })

  it("ignores direction blocks when measuring the spoken copy", () => {
    const body = "[b-roll: kitchen pan] Stop guessing. [on-screen text: 412000] Book a valuation with us."
    const report = checkProse(body, { kind: "script", requireCta: true })
    // Bracketed directions are not spoken, so they must not inflate the count.
    expect(report.stats.words).toBeLessThan(12)
  })
})

describe("scoring and reporting", () => {
  it("fails anything carrying a fatal defect regardless of the rest", () => {
    const body = "Homes here sell for $850,000 on average and that is the whole story. Call us today to book."
    const report = checkProse(body, { kind: "script", context: CONTEXT, requireCta: true })
    expect(report.passed).toBe(false)
  })

  it("passes clean, grounded, varied copy", () => {
    const body = "Stop. The median here is $412,000, and inventory is down 18%. " +
                 "That combination is why the house two streets over went in a weekend while yours sat. " +
                 "Book a valuation with us this week."
    const report = checkProse(body, { kind: "script", context: CONTEXT, requireCta: true })
    expect(report.passed).toBe(true)
    expect(report.score).toBeGreaterThanOrEqual(60)
  })

  it("orders revision instructions with fatal defects first", () => {
    const body = "In today's fast-paced world our service is a game-changer and we do it for $999,999 flat"
    const report = checkProse(body, { kind: "script", context: CONTEXT, requireCta: true })
    const lines = issuesAsInstructions(report).split("\n")
    expect(lines[0]).toContain("[fatal]")
  })
})

describe("two-digit claims attached to a noun", () => {
  it("catches an invented count that carries a unit", () => {
    const body = "We serve 40 customers a day here, every day. Come in and see for yourself."
    const found = checkProse(body, { kind: "script", context: CONTEXT, requireCta: true })
      .issues.map((i) => i.code)
    expect(found).toContain("unsupported-number")
  })

  it("accepts a two-digit count that IS in the grounding", () => {
    const body = "We have been open 7 years and we see 250 customers a week. Come by and say hello."
    const found = checkProse(body, { kind: "script", context: CONTEXT, requireCta: true })
      .issues.map((i) => i.code)
    expect(found).not.toContain("unsupported-number")
  })

  it("still ignores the small integers that structure a list", () => {
    expect(claimNumbers("5 tips, 3 mistakes, and 2 rules.")).toHaveLength(0)
  })
})

describe("one figure, one defect", () => {
  it("reports an invented figure once rather than once per overlapping pattern", () => {
    // "$687,000" also matches as "687,000" and "687". Reporting it four times
    // buries the real defect list and multiplies the penalty for one mistake.
    const body = "The average home here sells for $687,000 in two weeks. Call us to book a valuation."
    const unsupported = checkProse(body, { kind: "script", context: CONTEXT, requireCta: true })
      .issues.filter((i) => i.code === "unsupported-number")
    expect(unsupported).toHaveLength(1)
    expect(unsupported[0].evidence).toBe("$687,000")
  })

  it("recognises 'contact' as a call to action", () => {
    const body = "Most sellers price on feeling and lose weeks. Contact us before you list anything."
    expect(codes(body, { kind: "script", requireCta: true })).not.toContain("no-cta")
  })
})
