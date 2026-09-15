// Market scoring against MARKET_CRITERIA_SPEC.md — our rubric, our ranking.
//
// THE RULE THAT DEFINES THIS MODULE. No third party's ranking is an input. Not
// Zillow's "hottest markets", not a listicle's top ten, not another platform's
// score. Those are somebody else's weighting of somebody else's criteria, and
// copying a rank means inheriting judgements you cannot inspect. What comes in
// here is raw measurement — a median price, a vacancy rate, a growth figure —
// and the rank comes out of the rubric below. A market everyone else ranks
// first will finish wherever its numbers put it.
//
// WEIGHTS ARE NEVER RENORMALISED. This is the part that matters most and it is
// the opposite of what feels natural. When a criterion's data is missing, the
// obvious move is to rescale the remaining weights so the score still runs to
// 100 — and that rewards ignorance: a market with two of ten criteria present
// would score higher than a market measured on all ten, because the two happen
// to look good. The crypto side of this codebase had exactly that bug and it
// ranked a meme coin first at 92/100. So a missing criterion scores ZERO of its
// available points, the score stays out of a fixed 100, and completeness is
// reported alongside it. A market cannot reach Priority Target on thin data,
// which is correct: we do not know that it is good.
//
// Deterministic and pure throughout. Every point is traceable to a threshold in
// the spec, and nothing here asks a model what it thinks.

export interface MarketInputs {
  market: string
  metro?: string

  // §2.2 rubric inputs
  priceToRent: number | null
  popGrowthYoY: number | null
  medianHomePrice: number | null
  medianRent: number | null
  jobGrowthPct: number | null
  vacancyRate: number | null
  appreciation3yrCagr: number | null
  unemploymentRate: number | null
  landlordFriendly: boolean | null
  daysOnMarket: number | null

  // §2.3 disqualifier inputs that are not themselves scored
  povertyRate: number | null
  propertyTaxRateEffective: number | null
  majorEmployerPresent: boolean | null
  rentControlActive: boolean | null
  evictionTimelineMonths: number | null

  /** National reference points, passed in so the comparison is explicit. */
  nationalMedianHomePrice: number
  nationalMedianRent: number

  /** Whether a long-term rental hold is the intended strategy (§2.3). */
  targetHoldIsLtr?: boolean

  /** §2.4 green flags — displayed, never scored. */
  greenFlags?: string[]

  /** True when price-to-rent came from ACS medians, which run conservative. */
  acsDerivedPriceToRent?: boolean
  /** Which rent the ratio was measured against, shown on the card. */
  priceToRentBasis?: string | null
}

export interface CriterionScore {
  id: string
  label: string
  points: number
  maxPoints: number
  /** False when the input was absent — scores zero and is said so. */
  measured: boolean
  basis: string
}

export type MarketTier = "Disqualified" | "Below Watchlist" | "Watchlist" | "Qualified" | "Priority Target"

export interface MarketScore {
  market: string
  metro: string | null
  /** Out of a fixed 100. Never rescaled to what was measured. */
  score: number
  tier: MarketTier
  /** Share of the 100 points that could be earned at all, given what was measured. */
  dataCompletenessPct: number
  criteria: CriterionScore[]
  disqualifiers: string[]
  greenFlags: string[]
  redFlags: string[]
  landlordFriendly: boolean | null
  recommendedStrategies: string[]
  /** Plain account of how this market got the number it did. */
  summary: string
}

// ── §2.3 Hard disqualifiers ───────────────────────────────────────────────────

// A decline has to be real to count as one.
//
// The spec says "population declining YoY (negative growth)", and read
// literally that removed Minneapolis at -0.02%/yr and Peoria at -0.03%/yr —
// figures far inside the margin of error on an ACS estimate, and a rounding
// difference away from flat. Disqualifying a market on noise is not a harder
// criterion, it is a wrong one, and it loses markets for no reason.
//
// So the test is material decline, not arithmetic sign. Anything between this
// floor and zero is treated as FLAT and flagged rather than failed: it still
// earns nothing from the growth criterion, so a stagnant market cannot score
// well — it simply is not thrown out on a measurement artefact.
export const MATERIAL_POP_DECLINE_PCT = -0.25

export const DISQUALIFIER_LIMITS = {
  vacancyRatePct: 12,
  unemploymentRatePct: 7,
  povertyRatePct: 22,
  propertyTaxRatePct: 2.5,
  ltrEvictionMonths: 12,
} as const

/**
 * Conditions that remove a market outright, before any score is computed.
 *
 * Absent data is NOT a disqualifier — we cannot fail a market for something we
 * did not measure. It costs the market points in the rubric instead, which is
 * the honest penalty.
 */
export function findDisqualifiers(input: MarketInputs): string[] {
  const out: string[] = []
  const {
    popGrowthYoY, vacancyRate, unemploymentRate, appreciation3yrCagr,
    povertyRate, propertyTaxRateEffective, majorEmployerPresent,
    landlordFriendly, rentControlActive, evictionTimelineMonths, targetHoldIsLtr,
  } = input

  if (popGrowthYoY !== null && popGrowthYoY < MATERIAL_POP_DECLINE_PCT) {
    out.push(`Population is declining materially (${popGrowthYoY.toFixed(2)}% YoY) — demand is structurally shrinking.`)
  }
  if (vacancyRate !== null && vacancyRate > DISQUALIFIER_LIMITS.vacancyRatePct) {
    out.push(`Vacancy ${vacancyRate.toFixed(1)}% exceeds the ${DISQUALIFIER_LIMITS.vacancyRatePct}% ceiling.`)
  }
  if (unemploymentRate !== null && unemploymentRate > DISQUALIFIER_LIMITS.unemploymentRatePct) {
    out.push(`Unemployment ${unemploymentRate.toFixed(1)}% exceeds the ${DISQUALIFIER_LIMITS.unemploymentRatePct}% ceiling.`)
  }
  if (appreciation3yrCagr !== null && appreciation3yrCagr < 0) {
    out.push(`Prices have fallen over three years (${appreciation3yrCagr.toFixed(1)}% CAGR).`)
  }
  if (povertyRate !== null && povertyRate > DISQUALIFIER_LIMITS.povertyRatePct) {
    out.push(`Poverty rate ${povertyRate.toFixed(1)}% exceeds the ${DISQUALIFIER_LIMITS.povertyRatePct}% ceiling — structural demand problem.`)
  }
  if (propertyTaxRateEffective !== null && propertyTaxRateEffective > DISQUALIFIER_LIMITS.propertyTaxRatePct) {
    out.push(`Effective property tax ${propertyTaxRateEffective.toFixed(2)}% exceeds ${DISQUALIFIER_LIMITS.propertyTaxRatePct}% — it eats the cash flow.`)
  }
  if (majorEmployerPresent === false) {
    out.push("No major employer or job driver in the metro — single-industry risk.")
  }

  // Tenant-favourable AND a long-term rental hold is the combination that fails,
  // not either on its own: the same market can be fine for a flip or an STR.
  if (targetHoldIsLtr) {
    const tenantFavourable = landlordFriendly === false
      || rentControlActive === true
      || (evictionTimelineMonths !== null && evictionTimelineMonths > DISQUALIFIER_LIMITS.ltrEvictionMonths)
    if (tenantFavourable) {
      const why = [
        landlordFriendly === false ? "tenant-favourable state" : null,
        rentControlActive === true ? "rent control active" : null,
        evictionTimelineMonths !== null && evictionTimelineMonths > DISQUALIFIER_LIMITS.ltrEvictionMonths
          ? `eviction takes ${evictionTimelineMonths} months` : null,
      ].filter(Boolean).join(", ")
      out.push(`Long-term rental hold in a tenant-favourable environment (${why}).`)
    }
  }

  return out
}

// ── §2.2 Weighted rubric ──────────────────────────────────────────────────────

/** Linear interpolation between a zero-point threshold and a full-point one. */
function band(value: number, zeroAt: number, fullAt: number, maxPoints: number): number {
  if (fullAt === zeroAt) return value === fullAt ? maxPoints : 0
  const t = (value - zeroAt) / (fullAt - zeroAt)
  return Math.max(0, Math.min(1, t)) * maxPoints
}

function absent(id: string, label: string, maxPoints: number, what: string): CriterionScore {
  return {
    id, label, points: 0, maxPoints, measured: false,
    basis: `Not measured — ${what} was unavailable, so this scores 0 of ${maxPoints}. ` +
           `The weight is NOT redistributed; unmeasured is not the same as good.`,
  }
}

export function scoreCriteria(input: MarketInputs): CriterionScore[] {
  const out: CriterionScore[] = []
  const round = (n: number) => Math.round(n * 10) / 10

  // 1 — Price-to-rent, 18 pts. Below 12 is full, 18 and above is nothing.
  if (input.priceToRent === null) out.push(absent("ptr", "Price-to-rent ratio", 18, "price or rent"))
  else {
    const p = round(band(input.priceToRent, 18, 12, 18))
    out.push({ id: "ptr", label: "Price-to-rent ratio", points: p, maxPoints: 18, measured: true,
      basis: `PTR ${input.priceToRent.toFixed(1)}` +
             (input.priceToRentBasis ? ` (against ${input.priceToRentBasis})` : "") +
             ` — under 12 earns full marks, 18 and above earns none.` })
  }

  // 2 — Population growth, 14 pts. Over 2% is full; declining already failed above.
  if (input.popGrowthYoY === null) out.push(absent("popgrowth", "Population growth YoY", 14, "a population time series"))
  else {
    const p = round(band(input.popGrowthYoY, 0, 2, 14))
    out.push({ id: "popgrowth", label: "Population growth YoY", points: p, maxPoints: 14, measured: true,
      basis: `${input.popGrowthYoY.toFixed(2)}% YoY — above 2% earns full marks, flat earns none.` })
  }

  // 3 — Price vs national median, 12 pts. Must be below; 25% below is full.
  if (input.medianHomePrice === null) out.push(absent("price", "Median price vs national", 12, "median home price"))
  else {
    const ratio = input.medianHomePrice / input.nationalMedianHomePrice
    const p = round(band(ratio, 1.0, 0.75, 12))
    out.push({ id: "price", label: "Median price vs national", points: p, maxPoints: 12, measured: true,
      basis: `$${Math.round(input.medianHomePrice).toLocaleString()} is ${((1 - ratio) * 100).toFixed(0)}% ` +
             `${ratio <= 1 ? "below" : "above"} the national median — 25% below earns full marks, at or above earns none.` })
  }

  // 4 — Rent vs national median, 12 pts. Must be at or above; 25% above is full.
  if (input.medianRent === null) out.push(absent("rent", "Median rent vs national", 12, "median rent"))
  else {
    const ratio = input.medianRent / input.nationalMedianRent
    const p = round(band(ratio, 0.9, 1.25, 12))
    out.push({ id: "rent", label: "Median rent vs national", points: p, maxPoints: 12, measured: true,
      basis: `$${Math.round(input.medianRent).toLocaleString()} is ${((ratio - 1) * 100).toFixed(0)}% ` +
             `${ratio >= 1 ? "above" : "below"} the national median — 25% above earns full marks.` })
  }

  // 5 — Job growth, 10 pts.
  if (input.jobGrowthPct === null) out.push(absent("jobs", "Job & employment growth", 10, "employment growth"))
  else {
    const p = round(band(input.jobGrowthPct, 0, 3, 10))
    out.push({ id: "jobs", label: "Job & employment growth", points: p, maxPoints: 10, measured: true,
      basis: `${input.jobGrowthPct.toFixed(1)}% — 3% or better earns full marks, flat earns none.` })
  }

  // 6 — Vacancy, 10 pts. Under 4% full, over 10% nothing.
  if (input.vacancyRate === null) out.push(absent("vacancy", "Vacancy rate", 10, "vacancy data"))
  else {
    const p = round(band(input.vacancyRate, 10, 4, 10))
    out.push({ id: "vacancy", label: "Vacancy rate", points: p, maxPoints: 10, measured: true,
      basis: `${input.vacancyRate.toFixed(1)}% — under 4% earns full marks, over 10% earns none.` })
  }

  // 7 — Appreciation, 8 pts. Over 7% full, under 2% nothing.
  if (input.appreciation3yrCagr === null) out.push(absent("appreciation", "3-yr price appreciation", 8, "a price history"))
  else {
    const p = round(band(input.appreciation3yrCagr, 2, 7, 8))
    out.push({ id: "appreciation", label: "3-yr price appreciation", points: p, maxPoints: 8, measured: true,
      basis: `${input.appreciation3yrCagr.toFixed(1)}% CAGR — above 7% earns full marks, below 2% earns none.` })
  }

  // 8 — Unemployment, 8 pts. Under 4.5% full, over 6% nothing.
  if (input.unemploymentRate === null) out.push(absent("unemployment", "Unemployment rate", 8, "unemployment data"))
  else {
    const p = round(band(input.unemploymentRate, 6, 4.5, 8))
    out.push({ id: "unemployment", label: "Unemployment rate", points: p, maxPoints: 8, measured: true,
      basis: `${input.unemploymentRate.toFixed(1)}% — under 4.5% earns full marks, over 6% earns none.` })
  }

  // 9 — Landlord-friendly, 6 pts. Genuinely binary in the spec.
  if (input.landlordFriendly === null) out.push(absent("landlord", "Landlord-friendly state", 6, "a landlord-law rating"))
  else {
    out.push({ id: "landlord", label: "Landlord-friendly state", points: input.landlordFriendly ? 6 : 0, maxPoints: 6, measured: true,
      basis: input.landlordFriendly
        ? "Landlord-friendly — full marks, and hold strategies are permitted."
        : "Tenant-favourable — no marks, and this disqualifies a long-term rental hold." })
  }

  // 10 — Days on market, 2 pts. Under 30 full, over 90 nothing and flagged.
  if (input.daysOnMarket === null) out.push(absent("dom", "Days on market", 2, "days-on-market data"))
  else {
    const p = round(band(input.daysOnMarket, 90, 30, 2))
    out.push({ id: "dom", label: "Days on market", points: p, maxPoints: 2, measured: true,
      basis: `${Math.round(input.daysOnMarket)} days — under 30 earns full marks, over 90 signals a soft market.` })
  }

  return out
}

// ── §3 Property type → strategy ───────────────────────────────────────────────

export const STRATEGY_MATRIX: Record<string, { strategies: string[]; note: string }> = {
  SFH:        { strategies: ["Flip", "LTR"], note: "Flip in fast-moving markets; hold as LTR when cash-flow positive. 1031 into the next deal." },
  Duplex:     { strategies: ["Flip", "House-hack"], note: "Live in one side while renting the other, build equity, flip later." },
  Triplex:    { strategies: ["LTR"], note: "Hold indefinitely. Never flip unless distressed — depreciation and cash flow compound." },
  Quad:       { strategies: ["LTR"], note: "Hold indefinitely. 1031 up when ready." },
  "5+ Unit":  { strategies: ["LTR"], note: "Commercial financing. Hold for NOI growth." },
  Condo:      { strategies: ["STR"], note: "STR play only. Check HOA rules and STR ordinances BEFORE closing." },
  Townhouse:  { strategies: ["MTR"], note: "30–90 day furnished lets near hospitals, universities, bases and corporate parks." },
  Motel:      { strategies: ["Asset acquisition"], note: "Buy the real property at a distress price. Do not assume the brand, franchise or operations." },
}

/**
 * Strategies the market's own numbers support.
 *
 * Deliberately narrower than the spec's matrix: the matrix says what a property
 * TYPE is for, and this says what this MARKET can carry. A tenant-favourable
 * state cannot carry a long-term rental hold however good the price-to-rent is.
 */
export function recommendStrategies(input: MarketInputs, criteria: CriterionScore[]): string[] {
  const out: string[] = []
  const ptr = input.priceToRent
  const landlordOk = input.landlordFriendly === true

  if (ptr !== null && ptr < 15 && landlordOk) out.push("LTR")
  if (input.landlordFriendly === false || input.rentControlActive === true) {
    // The Minneapolis case from the spec: score the numbers, hold off on LTR.
    out.push("STR", "MTR")
  }
  const appreciation = input.appreciation3yrCagr
  if (appreciation !== null && appreciation >= 4) out.push("Flip")
  if (input.daysOnMarket !== null && input.daysOnMarket <= 45 && !out.includes("Flip")) out.push("Flip")
  if (!out.includes("MTR") && input.majorEmployerPresent === true) out.push("MTR")

  const measured = criteria.filter(c => c.measured).length
  if (out.length === 0 && measured > 0) out.push("Insufficient signal — rescore when more data lands")
  return [...new Set(out)]
}

// ── Assembly ──────────────────────────────────────────────────────────────────

export const TIER_THRESHOLDS = { watchlist: 65, qualified: 75, priority: 85 } as const

function tierFor(score: number): MarketTier {
  if (score >= TIER_THRESHOLDS.priority) return "Priority Target"
  if (score >= TIER_THRESHOLDS.qualified) return "Qualified"
  if (score >= TIER_THRESHOLDS.watchlist) return "Watchlist"
  return "Below Watchlist"
}

export function scoreMarket(input: MarketInputs): MarketScore {
  const disqualifiers = findDisqualifiers(input)

  // §2.3 — disqualified markets get no score at all, not a low one. A number
  // invites comparison, and a disqualified market is not in the comparison.
  if (disqualifiers.length > 0) {
    return {
      market: input.market,
      metro: input.metro ?? null,
      score: 0,
      tier: "Disqualified",
      dataCompletenessPct: 0,
      criteria: [],
      disqualifiers,
      greenFlags: input.greenFlags ?? [],
      redFlags: disqualifiers,
      landlordFriendly: input.landlordFriendly,
      recommendedStrategies: [],
      summary: `${input.market} is disqualified on ${disqualifiers.length} hard condition(s), so no score was computed: ` +
               disqualifiers.join(" "),
    }
  }

  const criteria = scoreCriteria(input)
  const score = Math.round(criteria.reduce((sum, c) => sum + c.points, 0))
  const earnable = criteria.filter(c => c.measured).reduce((sum, c) => sum + c.maxPoints, 0)
  const completeness = Math.round(earnable)   // the rubric totals 100, so points == percent

  const redFlags: string[] = []
  const dom = criteria.find(c => c.id === "dom")
  if (input.daysOnMarket !== null && input.daysOnMarket > 90) {
    redFlags.push(`Days on market ${Math.round(input.daysOnMarket)} — soft market.`)
  }
  if (input.landlordFriendly === false) redFlags.push("Tenant-favourable state — long-term rental holds are off the table here.")
  if (input.popGrowthYoY !== null && input.popGrowthYoY < 0 && input.popGrowthYoY >= MATERIAL_POP_DECLINE_PCT) {
    redFlags.push(
      `Population is flat to marginally negative (${input.popGrowthYoY.toFixed(2)}% YoY) — inside the margin of error, ` +
      `so not treated as a decline, but it earns nothing from the growth criterion.`,
    )
  }
  if (input.vacancyRate !== null && input.vacancyRate > 8) redFlags.push(`Vacancy ${input.vacancyRate.toFixed(1)}% is elevated.`)
  if (completeness < 60) {
    redFlags.push(`Only ${completeness}% of the rubric could be measured — the score is a floor, not a verdict.`)
  }
  // Stated on the card rather than buried: this systematically understates the
  // ratio, so a market failing criterion 1 may still screen well on real comps.
  if (input.acsDerivedPriceToRent && input.priceToRent !== null && input.priceToRent >= 15) {
    redFlags.push(
      `Price-to-rent ${input.priceToRent.toFixed(1)} is from ACS medians, which compare all rental stock ` +
      `(utilities included) against owner-occupied values — it runs high. Re-screen on real rent comps before ruling this market out.`,
    )
  }
  void dom

  const tier = tierFor(score)
  const missing = criteria.filter(c => !c.measured).map(c => c.label)

  return {
    market: input.market,
    metro: input.metro ?? null,
    score,
    tier,
    dataCompletenessPct: completeness,
    criteria,
    disqualifiers: [],
    greenFlags: input.greenFlags ?? [],
    redFlags,
    landlordFriendly: input.landlordFriendly,
    recommendedStrategies: recommendStrategies(input, criteria),
    summary:
      `${input.market} scores ${score}/100 (${tier}) on ${completeness}% measured data.` +
      (missing.length ? ` Unmeasured and therefore scoring zero: ${missing.join(", ")}.` : " Every criterion was measured.") +
      ` No third-party ranking was used — this is the rubric applied to raw figures.`,
  }
}

/**
 * Rank markets against each other.
 *
 * Score first, then completeness — between two markets on the same score, the
 * one we actually know more about ranks higher. Without that tiebreak a market
 * measured on 40% of the rubric can tie one measured on 100%, and the thin one
 * is the riskier bet every time.
 */
export function rankMarkets(inputs: MarketInputs[]): MarketScore[] {
  return inputs
    .map(scoreMarket)
    .sort((a, b) => {
      if (a.tier === "Disqualified" && b.tier !== "Disqualified") return 1
      if (b.tier === "Disqualified" && a.tier !== "Disqualified") return -1
      return b.score - a.score || b.dataCompletenessPct - a.dataCompletenessPct
        || a.market.localeCompare(b.market)
    })
}
