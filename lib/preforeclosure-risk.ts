// Who is LIKELY to need to sell, before any filing says so.
//
// THE DIFFERENCE FROM DISTRESS SCORING. lib/distress-score.ts reads what has
// already happened — a notice of default, a tax deed sale, a sheriff's
// calendar. By the time those exist the property is public, and every investor
// with the same list is calling the same owner. This module is about the window
// before that: an owner whose circumstances say a sale is coming, months before
// a clerk stamps anything.
//
// WHAT IT IS BUILT ON. Property-level mortgage delinquency is behind a Black
// Knight or CoreLogic licence, and the spec says so (§2.5). What is free and
// public is the pattern that precedes a filing:
//
//   Tax arrears are the single best leading indicator there is. Someone who
//   stops paying property tax has usually stopped paying the mortgage first —
//   the tax bill is annual and the mortgage is monthly, so the tax record is
//   the one that becomes public.
//
//   Absentee ownership removes the emotional anchor. An out-of-state owner
//   with a problem property sells; an owner-occupier fights to stay.
//
//   Vacancy means the property is already costing money and returning none.
//
//   Estate and heir vesting means the person who wanted the house is gone.
//
// ON-MARKET PROPERTIES ARE EXCLUDED OUTRIGHT. A house with a sign in the yard
// has an agent, a price and a process. There is no motivation to uncover and no
// discount to win — the whole point here is the owner nobody else has found.
//
// Deterministic, and it never claims to know a mortgage is delinquent. It says
// which owners look like the ones who file, and why.

export interface RiskInputs {
  /** Years of unpaid property tax. The strongest public leading indicator. */
  taxYearsDelinquent?: number | null
  /** Any tax arrears at all, when the count is unknown. */
  taxDelinquent?: boolean | null
  /** Owner's mailing address differs from the property. */
  absenteeOwner?: boolean | null
  /** Mailing address is in a different state entirely. */
  outOfStateOwner?: boolean | null
  vacant?: boolean | null
  /** Open code-enforcement cases. */
  codeViolations?: number | null
  /** Years since the owner acquired it. */
  yearsOwned?: number | null
  /** Vesting name suggesting an estate, heirs or a trust after death. */
  estateVesting?: boolean | null
  /** Loan-to-value where known. Above 1 is underwater. */
  ltv?: number | null
  /** Utilities disconnected — vacancy confirmed by a third party. */
  utilityShutoff?: boolean | null
  /** Listed for sale right now, which disqualifies outright. */
  onMarket?: boolean | null
  /** Listed and failed to sell — motivated, and no longer competing with an agent. */
  expiredListing?: boolean | null
  /** A filing already exists; this module then has nothing to add. */
  hasPublicFiling?: boolean | null
}

export interface RiskFactor {
  id: string
  points: number
  label: string
  /** Why this predicts a sale, not merely that it scored. */
  reason: string
}

export type RiskBand = "IMMINENT" | "ELEVATED" | "WATCH" | "BACKGROUND" | "EXCLUDED"

export interface PreforeclosureRisk {
  score: number
  band: RiskBand
  factors: RiskFactor[]
  /** Set when the property is disqualified rather than scored. */
  excludedBecause: string | null
  /** How much of the picture we actually had. */
  inputsPresent: number
  summary: string
  /** What to do about it, in one line. */
  action: string
}

// Weights reflect how strongly each precedes an actual filing, not how bad it
// sounds. Tax arrears lead; a single code violation follows a problem rather
// than predicting one.
const WEIGHTS = {
  taxDelinquent4yr: 34,
  taxDelinquent2yr: 26,
  taxDelinquentUnknown: 16,
  vacant: 18,
  outOfState: 14,
  absentee: 9,
  estateVesting: 16,
  underwater: 15,
  nearUnderwater: 7,
  longTenure: 6,
  codeViolations: 10,
  utilityShutoff: 12,
  expiredListing: 12,
} as const

export const RISK_BANDS: Array<{ band: RiskBand; min: number; action: string }> = [
  { band: "IMMINENT",   min: 70, action: "Approach now — this owner looks like the ones who file within a year." },
  { band: "ELEVATED",   min: 50, action: "Direct mail and a follow-up call. Motivation is likely and nobody else is looking yet." },
  { band: "WATCH",      min: 30, action: "Quarterly drip. Re-score when the next tax roll lands." },
  { band: "BACKGROUND", min: 0,  action: "No action. Keep it in the universe for re-scoring." },
]

// Below this many known inputs the score is a guess dressed as a number.
export const MIN_INPUTS_FOR_CONFIDENCE = 3

export function assessPreforeclosureRisk(input: RiskInputs): PreforeclosureRisk {
  // ── Exclusions first. A scored number invites comparison, and these are not
  // in the comparison at all.
  if (input.onMarket === true) {
    return {
      score: 0, band: "EXCLUDED", factors: [],
      excludedBecause: "Listed for sale — it has an agent, a price and a process. " +
                       "There is no hidden motivation here and no discount to win.",
      inputsPresent: 0,
      summary: "Excluded: currently on the market.",
      action: "Skip. Revisit only if the listing expires unsold.",
    }
  }

  if (input.hasPublicFiling === true) {
    return {
      score: 0, band: "EXCLUDED", factors: [],
      excludedBecause: "A public filing already exists, so this is a distress lead rather than a risk " +
                       "prediction — score it with the signal-stacking engine instead.",
      inputsPresent: 0,
      summary: "Excluded: already filed.",
      action: "Route to distress scoring, which reads the filing itself.",
    }
  }

  const factors: RiskFactor[] = []
  let known = 0
  const seen = (v: unknown) => { if (v !== null && v !== undefined) known++ }

  // ── Tax arrears: the leading indicator ───────────────────────────────────
  seen(input.taxYearsDelinquent ?? input.taxDelinquent)
  const years = input.taxYearsDelinquent ?? null
  if (years !== null && years >= 4) {
    factors.push({
      id: "tax-4yr", points: WEIGHTS.taxDelinquent4yr, label: `${years} years of unpaid property tax`,
      reason: "At four years most states are at or near the point of selling the property for the debt. " +
              "An owner who has let it run this far has usually stopped servicing the mortgage too.",
    })
  } else if (years !== null && years >= 2) {
    factors.push({
      id: "tax-2yr", points: WEIGHTS.taxDelinquent2yr, label: `${years} years of unpaid property tax`,
      reason: "Two years of arrears is deliberate, not an oversight — the county has written repeatedly by now.",
    })
  } else if (input.taxDelinquent === true) {
    factors.push({
      id: "tax-unknown", points: WEIGHTS.taxDelinquentUnknown, label: "Property tax in arrears",
      reason: "The tax bill is annual and the mortgage is monthly, so tax arrears usually appear AFTER " +
              "mortgage trouble has already started — it is the part that becomes public.",
    })
  }

  // ── The property is not being lived in ───────────────────────────────────
  seen(input.vacant)
  if (input.vacant === true) {
    factors.push({
      id: "vacant", points: WEIGHTS.vacant, label: "Vacant",
      reason: "An empty property costs money every month and returns none. That arithmetic ends in a sale.",
    })
  }

  seen(input.utilityShutoff)
  if (input.utilityShutoff === true) {
    factors.push({
      id: "utility", points: WEIGHTS.utilityShutoff, label: "Utilities disconnected",
      reason: "Confirms the vacancy independently, and a disconnection for non-payment is a cash-flow fact.",
    })
  }

  // ── Distance from the asset ──────────────────────────────────────────────
  seen(input.outOfStateOwner ?? input.absenteeOwner)
  if (input.outOfStateOwner === true) {
    factors.push({
      id: "out-of-state", points: WEIGHTS.outOfState, label: "Owner lives in another state",
      reason: "Distance removes the emotional anchor and makes managing a problem property impractical. " +
              "Out-of-state owners sell; owner-occupiers fight to stay.",
    })
  } else if (input.absenteeOwner === true) {
    factors.push({
      id: "absentee", points: WEIGHTS.absentee, label: "Absentee owner",
      reason: "The mailing address is not the property, so nobody is living with the problem daily.",
    })
  }

  // ── The person who wanted the house is gone ──────────────────────────────
  seen(input.estateVesting)
  if (input.estateVesting === true) {
    factors.push({
      id: "estate", points: WEIGHTS.estateVesting, label: "Held by an estate or heirs",
      reason: "Heirs rarely want the house — they want it settled. Often several of them, in different cities, " +
              "who agree on little except selling.",
    })
  }

  // ── Money ────────────────────────────────────────────────────────────────
  seen(input.ltv)
  if (input.ltv !== null && input.ltv !== undefined) {
    if (input.ltv > 1) {
      factors.push({
        id: "underwater", points: WEIGHTS.underwater, label: `Underwater (LTV ${(input.ltv * 100).toFixed(0)}%)`,
        reason: "Owing more than it is worth removes the reason to keep paying and is the classic precursor " +
                "to a strategic default. Note it also caps what can be offered without a short sale.",
      })
    } else if (input.ltv > 0.9) {
      factors.push({
        id: "thin-equity", points: WEIGHTS.nearUnderwater, label: `Thin equity (LTV ${(input.ltv * 100).toFixed(0)}%)`,
        reason: "Almost no cushion — one missed quarter and selling stops being a choice.",
      })
    }
  }

  // ── Neglect ──────────────────────────────────────────────────────────────
  seen(input.codeViolations)
  const violations = input.codeViolations ?? 0
  if (violations > 0) {
    // Capped: five violations is one owner who has given up, not five problems.
    const points = Math.min(WEIGHTS.codeViolations, 4 + violations * 3)
    factors.push({
      id: "code", points, label: `${violations} open code violation(s)`,
      reason: "An owner who will not cut the grass or board a window is an owner who cannot or will not spend " +
              "on the property at all.",
    })
  }

  // ── Tenure ───────────────────────────────────────────────────────────────
  seen(input.yearsOwned)
  if (input.yearsOwned !== null && input.yearsOwned !== undefined && input.yearsOwned >= 15) {
    factors.push({
      id: "tenure", points: WEIGHTS.longTenure, label: `Owned ${Math.round(input.yearsOwned)} years`,
      reason: "Long tenure means real equity, which makes a fast cash sale possible — and often an ageing owner.",
    })
  }

  // ── Tried and failed to sell ─────────────────────────────────────────────
  seen(input.expiredListing)
  if (input.expiredListing === true) {
    factors.push({
      id: "expired", points: WEIGHTS.expiredListing, label: "Listing expired unsold",
      reason: "They already decided to sell and the market said no. Now there is no agent in the way.",
    })
  }

  factors.sort((a, b) => b.points - a.points)
  const raw = factors.reduce((sum, f) => sum + f.points, 0)
  const score = Math.min(100, Math.round(raw))

  const band = (RISK_BANDS.find(b => score >= b.min) ?? RISK_BANDS[RISK_BANDS.length - 1])

  const thin = known < MIN_INPUTS_FOR_CONFIDENCE
  const summary = factors.length === 0
    ? known === 0
      ? "Nothing known about this owner's circumstances — not a low-risk property, an unexamined one."
      : "No risk factors found on what was checked."
    : `${score}/100 (${band.band}) from ${factors.length} factor(s): ` +
      factors.slice(0, 3).map(f => f.label).join(", ") + "." +
      (thin ? ` Only ${known} input(s) were known, so treat this as a floor rather than a verdict.` : "")

  return {
    score,
    band: band.band,
    factors,
    excludedBecause: null,
    inputsPresent: known,
    summary,
    action: thin && score < 70
      ? "Gather more on this owner before spending on outreach — the score rests on very little."
      : band.action,
  }
}

/**
 * Rank a set of off-market properties by how likely the owner is to sell.
 *
 * Excluded properties sink to the bottom rather than being removed, so a caller
 * can see WHY something it expected is missing.
 */
export function rankByRisk<T>(
  items: T[],
  toInputs: (item: T) => RiskInputs,
): Array<{ item: T; risk: PreforeclosureRisk }> {
  return items
    .map(item => ({ item, risk: assessPreforeclosureRisk(toInputs(item)) }))
    .sort((a, b) => {
      if (a.risk.band === "EXCLUDED" && b.risk.band !== "EXCLUDED") return 1
      if (b.risk.band === "EXCLUDED" && a.risk.band !== "EXCLUDED") return -1
      return b.risk.score - a.risk.score || b.risk.inputsPresent - a.risk.inputsPresent
    })
}
