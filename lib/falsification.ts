// Falsification conditions — "what would change my mind", as checkable facts.
//
// Both specs ask an analyst to state what would change its conclusion, and to
// make that a real condition rather than a throwaway line. The usual way this
// gets implemented is a model writing a sentence like "we would reconsider if
// fundamentals deteriorate" — which is unfalsifiable, and therefore worthless
// as a commitment.
//
// A falsification condition is only meaningful if a machine can later check
// whether it happened. So every condition here is a NAMED FIELD, an OPERATOR
// and a THRESHOLD, computed from the values that actually drove the conclusion.
// That makes them:
//
//   Checkable — a later run evaluates them against fresh data with no judgment.
//   Specific  — "F-Score drops below 5" rather than "financials worsen".
//   Honest    — they are derived from the thesis, so if the thesis rests on a
//               thin margin, the condition that breaks it is correspondingly
//               close, and the user can see how fragile the case is.
//
// The distance between the current value and its trigger is the real output.
// A thesis whose conditions all sit far away is robust; one where a condition
// is nearly met is fragile, and saying so is more useful than a confidence
// percentage that compresses it into a single number.
export interface FalsificationCondition {
  field: string
  label: string
  operator: "falls_below" | "rises_above" | "becomes_true" | "becomes"
  threshold: number | string | boolean
  currentValue: number | string | boolean | null
  /** How much room before this trips, as a percentage of the threshold. */
  headroomPct: number | null
  severity: "thesis_breaking" | "material"
  why: string
}

export interface FalsificationSet {
  conditions: FalsificationCondition[]
  /** Closest condition to tripping — the weakest link in the case. */
  nearestTrigger: FalsificationCondition | null
  fragility: "robust" | "moderate" | "fragile"
  summary: string
}

interface Inputs {
  qualityScore: number | null
  valuationScore: number | null
  valuationPercentile: number | null
  piotroskiScore: number | null
  riskScore: number | null
  altmanZone: string | null
  fcfYieldPct: number | null
  freeCashFlowTtm: number | null
  goingConcernHits: number | null
  hasRestatement: boolean | null
  shortTrend: string | null
  revenueGrowthYoyPct: number | null
}

function headroom(current: number, threshold: number, direction: "below" | "above"): number {
  if (threshold === 0) return current === 0 ? 0 : 100
  const gap = direction === "below" ? current - threshold : threshold - current
  return (gap / Math.abs(threshold)) * 100
}

export function buildFalsificationSet(input: Inputs): FalsificationSet {
  const c: FalsificationCondition[] = []

  // ── Conditions that break the thesis outright ───────────────────────────
  // These mirror the opportunity screen's gates exactly. If a gate would now
  // reject the company, the reason it was surfaced no longer holds — so the
  // conditions are not invented for this output, they ARE the thesis.
  if (input.piotroskiScore !== null) {
    c.push({
      field: "piotroskiScore", label: "Piotroski F-Score",
      operator: "falls_below", threshold: 5, currentValue: input.piotroskiScore,
      headroomPct: headroom(input.piotroskiScore, 5, "below"),
      severity: "thesis_breaking",
      why: "The screen requires 5 of 9. Below that the financial trend is deteriorating rather than improving, which is the opposite of the condition it was selected under.",
    })
  }

  if (input.valuationScore !== null) {
    c.push({
      field: "valuationScore", label: "Valuation score",
      operator: "falls_below", threshold: 55, currentValue: input.valuationScore,
      headroomPct: headroom(input.valuationScore, 55, "below"),
      severity: "thesis_breaking",
      why: "Valuation is the only axis measured to carry forward-return signal here. If the discount closes, the single evidenced reason to prefer this company is gone — even if the business is unchanged.",
    })
  }

  if (input.qualityScore !== null) {
    c.push({
      field: "qualityScore", label: "Quality score",
      operator: "falls_below", threshold: 55, currentValue: input.qualityScore,
      headroomPct: headroom(input.qualityScore, 55, "below"),
      severity: "thesis_breaking",
      why: "Below the soundness floor a low price stops being a discount and starts being correct pricing.",
    })
  }

  if (input.freeCashFlowTtm !== null) {
    c.push({
      field: "freeCashFlowTtm", label: "Free cash flow",
      operator: "falls_below", threshold: 0, currentValue: input.freeCashFlowTtm,
      headroomPct: input.freeCashFlowTtm > 0 ? 100 : 0,
      severity: "thesis_breaking",
      why: "Cheap while burning cash is not cheap. The valuation case rests on cash the business actually produces.",
    })
  }

  // ── Binary facts that end the case regardless of any score ──────────────
  c.push({
    field: "hasRestatement", label: "Restatement filed",
    operator: "becomes_true", threshold: true, currentValue: input.hasRestatement ?? false,
    headroomPct: null, severity: "thesis_breaking",
    why: "A restatement withdraws the numbers every ratio above was computed from. Nothing in the analysis survives it.",
  })

  c.push({
    field: "goingConcernHits", label: "Going-concern doubt",
    operator: "rises_above", threshold: 0, currentValue: input.goingConcernHits ?? 0,
    headroomPct: null, severity: "thesis_breaking",
    why: "A formal auditor determination under ASC 205-40 is incompatible with the company being classed as sound.",
  })

  c.push({
    field: "altmanZone", label: "Altman zone",
    operator: "becomes", threshold: "distress", currentValue: input.altmanZone,
    headroomPct: null, severity: "thesis_breaking",
    why: "Crossing into the distress zone of a published bankruptcy model directly contradicts the soundness gate.",
  })

  // ── Material, but not automatically disqualifying ───────────────────────
  if (input.riskScore !== null) {
    c.push({
      field: "riskScore", label: "Risk score",
      operator: "rises_above", threshold: 55, currentValue: input.riskScore,
      headroomPct: headroom(input.riskScore, 55, "above"),
      severity: "material",
      why: "Above this the company carries too many simultaneous risk flags to clear the screen, even with an intact valuation case.",
    })
  }

  if (input.revenueGrowthYoyPct !== null) {
    c.push({
      field: "revenueGrowthYoyPct", label: "Revenue growth",
      operator: "falls_below", threshold: -10, currentValue: input.revenueGrowthYoyPct,
      headroomPct: headroom(input.revenueGrowthYoyPct, -10, "below"),
      severity: "material",
      why: "A double-digit decline changes a cheap-and-stable business into a shrinking one, which the valuation percentile alone will not capture for several quarters.",
    })
  }

  // ── Fragility ────────────────────────────────────────────────────────────
  const measurable = c.filter(x => x.headroomPct !== null && x.severity === "thesis_breaking")
  const nearestTrigger = measurable.length > 0
    ? measurable.reduce((min, x) => (x.headroomPct! < min.headroomPct! ? x : min))
    : null

  const nearest = nearestTrigger?.headroomPct ?? 100
  const fragility: FalsificationSet["fragility"] =
    nearest < 15 ? "fragile" : nearest < 40 ? "moderate" : "robust"

  const summary = nearestTrigger
    ? `The case breaks first on ${nearestTrigger.label.toLowerCase()}: it currently sits ${Math.abs(nearest).toFixed(0)}% away from the level that would invalidate it. ${
        fragility === "fragile"
          ? "That is close enough that a single weak quarter could end the thesis."
          : fragility === "moderate"
            ? "There is some room, but this is the condition to watch."
            : "Every condition sits well clear of its trigger."
      }`
    : "No measurable falsification condition could be computed from the available data."

  return { conditions: c, nearestTrigger, fragility, summary }
}

// Re-evaluates a previously stated set against fresh values. This is what makes
// the conditions a commitment rather than a description: a later run can prove
// the earlier conclusion wrong without any human or model judgment.
export function checkFalsified(
  conditions: FalsificationCondition[],
  current: Inputs
): { triggered: FalsificationCondition[]; stillValid: boolean } {
  const now = buildFalsificationSet(current)
  const byField = new Map(now.conditions.map(x => [x.field, x]))

  const triggered = conditions.filter(prior => {
    const fresh = byField.get(prior.field)
    if (!fresh || fresh.currentValue === null) return false
    const v = fresh.currentValue

    switch (prior.operator) {
      case "falls_below": return typeof v === "number" && v < (prior.threshold as number)
      case "rises_above": return typeof v === "number" && v > (prior.threshold as number)
      case "becomes_true": return v === true
      case "becomes": return v === prior.threshold
      default: return false
    }
  })

  return {
    triggered,
    stillValid: triggered.filter(t => t.severity === "thesis_breaking").length === 0,
  }
}
