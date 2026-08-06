// Benford's Law — forensic digit analysis on a company's own reported figures.
//
// In naturally occurring financial data that spans several orders of magnitude,
// leading digits are not uniformly distributed. A "1" leads about 30.1% of the
// time and a "9" about 4.6%, following log10(1 + 1/d). This is not a curiosity:
// it holds because such data is effectively scale-invariant, and it holds across
// revenues, assets, cash flows and expenses alike.
//
// Numbers that people invent do not follow it. Fabricated or manipulated figures
// over-represent middle and high leading digits, because humans producing
// "plausible" numbers spread them evenly and avoid the run of small leading
// digits that real data produces. Nigrini's work established this as a standard
// forensic-accounting technique, and it is used in actual fraud examinations.
//
// WHAT THIS IS AND IS NOT. A deviation is NOT evidence of fraud. Legitimate
// causes are common: a company with few distinct line items, values clustered
// by regulation or contract, or heavy rounding at a single scale. So this
// produces a flag for attention with its own confidence attached, never an
// accusation, and it is never a disqualifier on its own.
//
// It also costs nothing and needs no new data source — every number it tests is
// already in the companyfacts payload we fetch to compute ratios.
import type { CompanyFacts } from "./edgar-client"

export interface BenfordResult {
  /** Observed share of each leading digit 1-9. */
  observed: number[]
  expected: number[]
  sampleSize: number
  /** Mean absolute deviation across the nine digits — Nigrini's statistic. */
  mad: number
  conformity: "close" | "acceptable" | "marginal" | "nonconforming" | "insufficient_data"
  /** Digits materially over-represented versus expectation. */
  overRepresented: number[]
  flags: string[]
  riskPenalty: number
}

// P(leading digit = d) = log10(1 + 1/d)
const EXPECTED = Array.from({ length: 9 }, (_, i) => Math.log10(1 + 1 / (i + 1)))

// Below this the distribution is not estimable — with 50 numbers a single digit
// is worth 2 percentage points and normal variation swamps any real signal.
// Nigrini recommends several hundred; 150 is the floor where this is worth
// reporting at all, and it is reported with that caveat attached.
const MIN_SAMPLE = 150

// Nigrini's published MAD thresholds for first-digit tests.
const MAD_CLOSE = 0.006
const MAD_ACCEPTABLE = 0.012
const MAD_MARGINAL = 0.015

function leadingDigit(value: number): number | null {
  const v = Math.abs(value)
  if (!isFinite(v) || v === 0) return null
  // Normalize into [1, 10) without string parsing, which mishandles exponent
  // notation on very large or very small values.
  const scaled = v / Math.pow(10, Math.floor(Math.log10(v)))
  const d = Math.floor(scaled)
  return d >= 1 && d <= 9 ? d : null
}

// Collects every reported USD figure across all concepts and periods.
//
// USD only, deliberately. Benford applies to unconstrained quantities that span
// orders of magnitude. Per-share amounts cluster in a narrow band, and counts
// and ratios are bounded, so including them would test a distribution the law
// never claimed to describe and produce false deviations.
function collectValues(facts: CompanyFacts): number[] {
  const byTaxonomy = (facts as {
    facts?: Record<string, Record<string, { units?: Record<string, Array<{ val?: number }>> }>>
  }).facts
  if (!byTaxonomy) return []

  const values: number[] = []
  const seen = new Set<string>()

  for (const tags of Object.values(byTaxonomy)) {
    for (const [tag, concept] of Object.entries(tags)) {
      const rows = concept?.units?.USD
      if (!Array.isArray(rows)) continue
      for (const row of rows) {
        const v = row?.val
        if (typeof v !== "number" || !isFinite(v) || v === 0) continue
        // The same figure is restated across many filings; counting each
        // occurrence would weight repeatedly-restated concepts far too heavily
        // and distort the distribution toward whatever those happen to lead with.
        const key = `${tag}:${v}`
        if (seen.has(key)) continue
        seen.add(key)
        values.push(v)
      }
    }
  }
  return values
}

export function analyzeBenford(facts: CompanyFacts): BenfordResult {
  const values = collectValues(facts)
  const counts = new Array(9).fill(0)
  let total = 0

  for (const v of values) {
    const d = leadingDigit(v)
    if (d === null) continue
    counts[d - 1]++
    total++
  }

  if (total < MIN_SAMPLE) {
    return {
      observed: new Array(9).fill(0), expected: EXPECTED, sampleSize: total, mad: 0,
      conformity: "insufficient_data", overRepresented: [],
      flags: [], riskPenalty: 0,
    }
  }

  const observed = counts.map(c => c / total)
  const mad = observed.reduce((s, o, i) => s + Math.abs(o - EXPECTED[i]), 0) / 9

  const conformity: BenfordResult["conformity"] =
    mad < MAD_CLOSE ? "close"
    : mad < MAD_ACCEPTABLE ? "acceptable"
    : mad < MAD_MARGINAL ? "marginal"
    : "nonconforming"

  // Digits appearing at least 40% more often than expected. Relative rather
  // than absolute, because a 2-point excess on digit 1 (expected 30%) is noise
  // while the same excess on digit 9 (expected 4.6%) is a 43% overshoot.
  const overRepresented = observed
    .map((o, i) => ({ digit: i + 1, ratio: o / EXPECTED[i] }))
    .filter(x => x.ratio >= 1.4)
    .map(x => x.digit)

  const flags: string[] = []
  let riskPenalty = 0

  if (conformity === "nonconforming") {
    flags.push(`⚠ Reported figures deviate from the Benford distribution that naturally occurring financial data follows (MAD ${mad.toFixed(4)} across ${total.toLocaleString()} values). This is a prompt to read the filings more carefully, not evidence of wrongdoing — few distinct line items, contractually fixed values, or heavy rounding all produce the same deviation.`)
    riskPenalty = 8
  } else if (conformity === "marginal") {
    flags.push(`Reported figures deviate mildly from the expected Benford distribution (MAD ${mad.toFixed(4)}). Within the range normal accounting practices can produce.`)
    riskPenalty = 3
  }

  if (overRepresented.length > 0 && conformity !== "close" && conformity !== "acceptable") {
    flags.push(`Leading digit${overRepresented.length > 1 ? "s" : ""} ${overRepresented.join(", ")} appear${overRepresented.length > 1 ? "" : "s"} materially more often than expected — the pattern associated with figures that were chosen rather than measured.`)
  }

  return { observed, expected: EXPECTED, sampleSize: total, mad, conformity, overRepresented, flags, riskPenalty }
}
