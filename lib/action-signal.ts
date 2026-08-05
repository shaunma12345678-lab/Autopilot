// Action signal — the BUY / HOLD / PASS readout.
//
// This is deliberately NOT a rename of the quality score. It's a two-axis
// decision matrix that combines fundamental strength, risk, and data
// confidence, because those three can disagree and the disagreement is the
// whole point: a company can score 80 on fundamentals and still be a PASS if
// its Altman Z-Score says distress, and a token can look cheap and still be a
// PASS if the contract can mint unlimited supply.
//
// Precedence, highest first:
//   1. Not enough data      -> no signal at all (never guess)
//   2. High risk            -> PASS regardless of how strong fundamentals look
//   3. Weak fundamentals    -> PASS
//   4. Strong + contained risk -> BUY
//   5. Everything else      -> HOLD
//
// COMPLIANCE NOTE: this is a summary of what the underlying data shows, shown
// alongside a persistent disclaimer, applied uniformly to every asset, and
// never tailored to any individual's circumstances. Keep it that way — the
// moment output is personalized to a user's portfolio or goals it stops being
// impersonal information. See components/dashboard/MarketsDisclaimer.tsx.

export type ActionSignal = "buy" | "hold" | "pass"

export interface ActionSignalResult {
  signal: ActionSignal | null
  label: string
  rationale: string
}

export interface ActionSignalInput {
  qualityScore: number | null
  riskScore: number | null
  dataConfidence: string
  /** Forward-looking composite. Strong current numbers with collapsing forward
   *  indicators is not a BUY — see the gate below. */
  forwardScore?: number | null
  /** Hard disqualifiers surfaced by the asset-specific scorer (honeypot, going concern, etc.). */
  hardFail?: { active: boolean; reason: string } | null
}

// ── Thresholds, CALIBRATED against the real distribution ───────────────────
//
// These are not guesses. Scoring a diversified 80-company universe produced:
//   quality: min 42 | p25 63 | median 69.5 | p75 75 | p90 79 | max 87
//   risk:    mean 30 | max 63
//   forward: mean 53
//
// The original BUY bar of 65 sat near the 35th percentile, so 78% of the
// universe came back BUY and 0% came back PASS. A signal that fires on three
// quarters of everything carries no information. These thresholds put BUY at
// roughly the top 15-20% and let genuinely weak names reach PASS.
//
// Re-derive these if the universe composition changes materially — a screen
// calibrated on large caps will behave differently on micro caps.
const RISK_DISQUALIFYING = 60
const RISK_CONTAINED = 40
const RISK_LOW = 25
const QUALITY_WEAK = 52          // below this, the fundamentals don't hold up
const QUALITY_STRONG = 76        // ~p80 of the observed distribution
const QUALITY_DECENT = 70        // ~p50-60, only reaches BUY with very low risk
const FORWARD_WEAK = 35          // collapsing forward indicators block a BUY
const FORWARD_ADEQUATE = 45
const FORWARD_GOOD = 55

export function deriveActionSignal(input: ActionSignalInput): ActionSignalResult {
  const { qualityScore, riskScore, dataConfidence, forwardScore, hardFail } = input

  // 1. Never emit a signal we can't stand behind.
  if (qualityScore === null || dataConfidence === "insufficient") {
    return {
      signal: null,
      label: "No signal",
      rationale: "Not enough reliable data to form a view — no signal is shown rather than guessing.",
    }
  }

  // 2. A hard disqualifier overrides everything else.
  if (hardFail?.active) {
    return { signal: "pass", label: "PASS", rationale: hardFail.reason }
  }

  const risk = riskScore ?? 50

  if (risk >= RISK_DISQUALIFYING) {
    return {
      signal: "pass",
      label: "PASS",
      rationale: `Risk score of ${risk}/100 is high enough to outweigh the fundamentals here, which score ${qualityScore}/100.`,
    }
  }

  if (qualityScore < QUALITY_WEAK) {
    return {
      signal: "pass",
      label: "PASS",
      rationale: `Fundamentals score ${qualityScore}/100 — weak across most of the measures tracked.`,
    }
  }

  // Forward gate: a company can look excellent on trailing numbers while its
  // contracted backlog shrinks and growth decelerates. That combination is the
  // classic late-cycle trap, so weak forward indicators block a BUY outright
  // rather than being averaged away against strong history.
  const forward = forwardScore ?? null
  if (qualityScore >= QUALITY_STRONG && forward !== null && forward < FORWARD_WEAK) {
    return {
      signal: "hold",
      label: "HOLD",
      rationale: `Trailing fundamentals are strong (${qualityScore}/100) but forward indicators are weak (${forward}/100) — backlog, reinvestment and growth trajectory aren't supporting the historical numbers.`,
    }
  }

  if (qualityScore >= QUALITY_STRONG && risk <= RISK_CONTAINED && (forward === null || forward >= FORWARD_ADEQUATE)) {
    return {
      signal: "buy",
      label: "BUY",
      rationale: `Top-tier fundamentals (${qualityScore}/100) with risk contained at ${risk}/100${forward !== null ? ` and forward indicators holding up (${forward}/100)` : ""}.`,
    }
  }

  if (qualityScore >= QUALITY_DECENT && risk <= RISK_LOW && (forward === null || forward >= FORWARD_GOOD)) {
    return {
      signal: "buy",
      label: "BUY",
      rationale: `Solid fundamentals (${qualityScore}/100) paired with unusually low risk (${risk}/100)${forward !== null ? ` and healthy forward indicators (${forward}/100)` : ""}.`,
    }
  }

  const why = qualityScore < QUALITY_STRONG && risk > RISK_CONTAINED
    ? `fundamentals are mid-range (${qualityScore}/100) and risk is elevated (${risk}/100)`
    : qualityScore < QUALITY_STRONG
    ? `fundamentals are mid-range (${qualityScore}/100)`
    : `fundamentals are strong (${qualityScore}/100) but risk is elevated (${risk}/100)`

  return {
    signal: "hold",
    label: "HOLD",
    rationale: `Neither clearly compelling nor clearly avoidable — ${why}.`,
  }
}

// Shared styling so the badge looks identical everywhere it appears.
export const ACTION_SIGNAL_STYLES: Record<ActionSignal, string> = {
  buy: "text-emerald-300 border-emerald-500/50 bg-emerald-500/15",
  hold: "text-yellow-300 border-yellow-500/50 bg-yellow-500/15",
  pass: "text-red-300 border-red-500/50 bg-red-500/15",
}

export function actionSignalStyle(signal: string | null | undefined): string {
  if (signal === "buy" || signal === "hold" || signal === "pass") return ACTION_SIGNAL_STYLES[signal]
  return "text-gray-400 border-gray-600/50 bg-gray-600/15"
}
