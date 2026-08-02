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
  /** Hard disqualifiers surfaced by the asset-specific scorer (honeypot, going concern, etc.). */
  hardFail?: { active: boolean; reason: string } | null
}

// Thresholds live here as named constants so the matrix can be tuned in one
// place rather than being scattered through the scorers.
const RISK_DISQUALIFYING = 70
const RISK_CONTAINED = 45
const RISK_LOW = 30
const QUALITY_WEAK = 40
const QUALITY_STRONG = 65
const QUALITY_DECENT = 55

export function deriveActionSignal(input: ActionSignalInput): ActionSignalResult {
  const { qualityScore, riskScore, dataConfidence, hardFail } = input

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

  if (qualityScore >= QUALITY_STRONG && risk <= RISK_CONTAINED) {
    return {
      signal: "buy",
      label: "BUY",
      rationale: `Strong fundamentals (${qualityScore}/100) with risk contained at ${risk}/100.`,
    }
  }

  if (qualityScore >= QUALITY_DECENT && risk <= RISK_LOW) {
    return {
      signal: "buy",
      label: "BUY",
      rationale: `Solid fundamentals (${qualityScore}/100) paired with unusually low risk (${risk}/100).`,
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
