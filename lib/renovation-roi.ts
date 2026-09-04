// Renovation ROI — which improvements actually pay, on THIS property.
//
// WHY THE USUAL APPROACH IS WRONG. Every renovation calculator online is a
// lookup table: "minor kitchen remodel — 72% cost recouped", lifted from a
// national Cost-vs-Value survey. That number is a national median across
// hundreds of thousands of dissimilar houses, and applying it to one specific
// property produces confident nonsense, because return on a renovation is not a
// property OF THE RENOVATION. It is a property of the renovation, the house,
// and the street, together.
//
// Three effects decide the answer and a lookup table models none of them:
//
//   THE CEILING. Every neighbourhood has a price nobody will exceed. Spend
//   $70k on a kitchen where the best comparable sale is $380k and most of that
//   money does not come back — not because the kitchen is bad, but because no
//   buyer will pay $450k on that street. Value added is capped by what the
//   comps support, and past the cap the marginal return is close to zero. This
//   is the single most important factor in whether a renovation pays, and it is
//   the one homeowners and flippers most consistently get wrong.
//
//   THE BASELINE. Replacing a broken kitchen returns far more than upgrading a
//   serviceable one. The same $40k of work is transformative in one house and
//   nearly invisible in another. Return depends on the CONDITION YOU START
//   FROM, so the same line item has to be scored differently per property.
//
//   BRACKET JUMPS. Adding a second bathroom to a 3-bed/1-bath is not a linear
//   improvement — it moves the house into a different set of comparables
//   entirely. A handful of renovations are step changes rather than increments,
//   and they are systematically undervalued by percentage-recouped thinking.
//
// On top of those: money spent is not the only cost. A renovation that takes
// four months on a flip carries four months of loan interest, taxes, insurance
// and utilities, and some categories (anything behind a wall or under a house)
// have cost distributions with long tails that a point estimate hides.
//
// EVERYTHING HERE IS DETERMINISTIC. Costs, caps and adjustments are arithmetic
// over stated inputs, so two identical properties always score identically and
// every number can be traced to a rule. No model is asked to estimate a price.

export type Condition = "poor" | "dated" | "average" | "good"

/** How much of a renovation's theoretical value a given starting condition unlocks.
 *  Fixing something broken captures nearly all of it; polishing something already
 *  decent captures very little. */
const BASELINE_MULTIPLIER: Record<Condition, number> = {
  poor: 1.0,
  dated: 0.78,
  average: 0.45,
  good: 0.18,
}

const CONDITION_LABEL: Record<Condition, string> = {
  poor: "broken or unusable",
  dated: "functional but visibly dated",
  average: "serviceable and unremarkable",
  good: "already in good order",
}

export interface RenovationSpec {
  key: string
  label: string
  /** Cost basis. Either a flat job cost or a rate applied to affected area. */
  baseCost: number
  costPerSqft?: number
  /** Share of the affected area this touches, when priced per square foot. */
  areaShare?: number
  /** Fraction of cost typically returned as value, BEFORE the ceiling and
   *  baseline adjustments that make the number property-specific. */
  grossReturn: number
  /** Cost-overrun risk. Work behind walls or under the house has a long right
   *  tail; cosmetic work does not. 0.1 = tight estimate, 0.5 = wide. */
  costVariance: number
  /** Buyers penalise the absence of these more than the cost to provide them —
   *  they are priced in as expected rather than valued as an upgrade. */
  tableStakes: boolean
  /** Can move the property into a different comparable set entirely. */
  bracketJump: boolean
  /** Typical duration, which drives holding cost on a financed project. */
  weeks: number
  /** Phrases people actually use, for matching free-text descriptions. */
  matches: RegExp
  note: string
}

// Cost bases are national-median starting points; regional multipliers and the
// property-specific adjustments below are what make them meaningful. Returns
// are pre-ceiling and pre-baseline by construction.
export const RENOVATION_CATALOG: RenovationSpec[] = [
  {
    key: "kitchen_minor", label: "Kitchen refresh (cabinets refaced, counters, appliances)",
    baseCost: 27000, grossReturn: 0.85, costVariance: 0.2, tableStakes: false, bracketJump: false, weeks: 4,
    matches: /\b(kitchen)\b(?!.*\b(full|gut|complete|major)\b)/i,
    note: "The highest-returning common renovation, because buyers price kitchens emotionally and a refresh avoids the plumbing and electrical costs of a gut.",
  },
  {
    key: "kitchen_major", label: "Full kitchen gut and rebuild",
    baseCost: 78000, grossReturn: 0.6, costVariance: 0.35, tableStakes: false, bracketJump: false, weeks: 10,
    matches: /\b(full|gut|complete|major)\s+kitchen|kitchen\s+(gut|remodel\s+full)/i,
    note: "Returns markedly less per dollar than a refresh. Justified when the layout genuinely fails or the kitchen is unusable, rarely otherwise.",
  },
  {
    key: "bath_refresh", label: "Bathroom refresh (vanity, tile, fixtures)",
    baseCost: 12000, grossReturn: 0.8, costVariance: 0.2, tableStakes: false, bracketJump: false, weeks: 3,
    matches: /\b(bath|bathroom)\b(?!.*\badd\b)/i,
    note: "Consistently strong return; bathrooms are small enough that quality finishes stay affordable.",
  },
  {
    key: "bath_add", label: "Add a bathroom",
    baseCost: 47000, grossReturn: 0.6, costVariance: 0.4, tableStakes: false, bracketJump: true, weeks: 8,
    matches: /\badd(ing)?\s+(a\s+)?(second\s+|extra\s+|another\s+)?(bath|bathroom|half\s*bath)/i,
    note: "A step change rather than an increment — a 3/1 and a 3/2 are shopped by different buyers and sit in different comparable sets.",
  },
  {
    key: "bedroom_add", label: "Add a bedroom (conversion or build-out)",
    baseCost: 52000, grossReturn: 0.62, costVariance: 0.45, tableStakes: false, bracketJump: true, weeks: 10,
    matches: /\badd(ing)?\s+(a\s+)?(bed|bedroom)|convert.*\b(bedroom|bed)\b/i,
    note: "Moves the property into a different comparable bracket. Conversion of existing conditioned space returns far better than new construction.",
  },
  {
    key: "roof", label: "Roof replacement",
    baseCost: 22000, grossReturn: 0.6, costVariance: 0.25, tableStakes: true, bracketJump: false, weeks: 2,
    matches: /\b(roof|shingle|re-?roof)\b/i,
    note: "Table stakes. A failing roof does not reduce offers by its replacement cost — it kills financing and shrinks the buyer pool to cash.",
  },
  {
    key: "hvac", label: "HVAC replacement or central air",
    baseCost: 14000, grossReturn: 0.6, costVariance: 0.3, tableStakes: true, bracketJump: false, weeks: 1,
    matches: /\b(hvac|furnace|air\s*condition|central\s*air|heat\s*pump|ac\b)/i,
    note: "Table stakes in most markets. Its absence is penalised well beyond its cost when every comparable has it.",
  },
  {
    key: "electrical", label: "Electrical panel and rewiring",
    baseCost: 13000, grossReturn: 0.5, costVariance: 0.5, tableStakes: true, bracketJump: false, weeks: 2,
    matches: /\b(electric|wiring|rewire|panel|knob\s*and\s*tube)\b/i,
    note: "Rarely valued by buyers but frequently required for insurance or financing. Highest cost-overrun risk in the catalogue — the scope is invisible until walls open.",
  },
  {
    key: "plumbing", label: "Plumbing replacement",
    baseCost: 16000, grossReturn: 0.5, costVariance: 0.5, tableStakes: true, bracketJump: false, weeks: 3,
    matches: /\b(plumb|repipe|galvanized|sewer\s*line|cast\s*iron)\b/i,
    note: "Same shape as electrical: invisible to buyers, mandatory for the sale, and the true scope is not knowable until work starts.",
  },
  {
    key: "foundation", label: "Foundation repair",
    baseCost: 28000, grossReturn: 0.4, costVariance: 0.6, tableStakes: true, bracketJump: false, weeks: 4,
    matches: /\b(foundation|settling|structural|slab|pier|beam)\b/i,
    note: "Widest cost distribution of anything here. Recovers little directly, but an unrepaired foundation makes a property unfinanceable and caps the buyer pool at cash investors.",
  },
  {
    key: "paint_interior", label: "Interior paint",
    baseCost: 0, costPerSqft: 3.5, areaShare: 1, grossReturn: 1.4, costVariance: 0.1,
    tableStakes: false, bracketJump: false, weeks: 1,
    matches: /\b(paint|painting)\b(?!.*exterior)/i,
    note: "The best dollar-for-dollar return available, and the lowest risk. Changes how every photograph and every showing reads for a fraction of any structural spend.",
  },
  {
    key: "flooring", label: "Flooring replacement",
    baseCost: 0, costPerSqft: 7, areaShare: 0.85, grossReturn: 1.0, costVariance: 0.15,
    tableStakes: false, bracketJump: false, weeks: 2,
    matches: /\b(floor|flooring|carpet|hardwood|lvp|vinyl|tile\s*floor)\b/i,
    note: "Strong and predictable. Worn carpet reads as neglect and drags the perceived condition of rooms that are otherwise fine.",
  },
  {
    key: "curb_appeal", label: "Curb appeal (landscaping, door, exterior paint)",
    baseCost: 9000, grossReturn: 1.3, costVariance: 0.15, tableStakes: false, bracketJump: false, weeks: 2,
    matches: /\b(curb|landscap|exterior\s*paint|front\s*door|siding|yard|garden)\b/i,
    note: "Sets the expectation every interior room is then judged against, and determines whether buyers get out of the car at all.",
  },
  {
    key: "windows", label: "Window replacement",
    baseCost: 19000, grossReturn: 0.65, costVariance: 0.2, tableStakes: false, bracketJump: false, weeks: 2,
    matches: /\b(window|glazing|double\s*pane)\b/i,
    note: "Moderate return. Matters more in cold or noisy markets where buyers read single-pane windows as a running cost.",
  },
  {
    key: "basement_finish", label: "Finish a basement",
    baseCost: 42000, grossReturn: 0.7, costVariance: 0.3, tableStakes: false, bracketJump: false, weeks: 8,
    matches: /\b(basement|cellar|lower\s*level)\b/i,
    note: "Return depends entirely on whether the local market counts finished basement area as living space. Where it does not, this is close to a total loss.",
  },
  {
    key: "adu", label: "ADU / garage conversion",
    baseCost: 110000, grossReturn: 0.75, costVariance: 0.5, tableStakes: false, bracketJump: true, weeks: 20,
    matches: /\b(adu|granny|casita|garage\s*conversion|in-?law|accessory\s*dwelling)\b/i,
    note: "Changes what the property IS by adding an income stream, so it is valued on rent rather than on comparable sales — the one renovation that can legitimately break the neighbourhood ceiling.",
  },
  {
    key: "cosmetic_full", label: "Full cosmetic refresh (paint, floors, fixtures, light landscaping)",
    baseCost: 0, costPerSqft: 18, areaShare: 1, grossReturn: 1.1, costVariance: 0.2,
    tableStakes: false, bracketJump: false, weeks: 5,
    matches: /\b(cosmetic|refresh|lipstick|clean\s*up|spruce|light\s*rehab|make.?ready)\b/i,
    note: "The standard flip package. Reliable because it is all visible, all predictable, and none of it is behind a wall.",
  },
]

export interface RoiInput {
  /** Current as-is value of the property. */
  asIsValue: number
  sqft: number
  /** The highest price the street realistically supports — from comparable
   *  sales. This is the cap that decides whether a renovation pays. */
  neighborhoodCeiling: number
  /** Starting condition of the areas being renovated. */
  condition: Condition
  /** Free-text description of the work being considered. */
  description: string
  /** Regional cost multiplier vs national median. 1.0 = national. */
  costMultiplier?: number
  /** Monthly carrying cost while work is underway (interest, taxes, insurance,
   *  utilities). Omit for an owner-occupant who is not paying to hold. */
  monthlyCarry?: number
}

export interface RoiLine {
  key: string
  label: string
  cost: number
  costLow: number
  costHigh: number
  valueAdded: number
  /** Value the ceiling prevented from being realised. The core diagnostic. */
  valueLostToCeiling: number
  holdingCost: number
  netGain: number
  roiPct: number
  /** ROI after penalising cost-overrun risk — how it ranks if things go wrong. */
  riskAdjustedRoiPct: number
  weeks: number
  confidence: "high" | "medium" | "low"
  verdict: "do_first" | "worth_doing" | "marginal" | "avoid"
  reasoning: string[]
}

export interface RoiReport {
  ok: boolean
  error?: string
  asIsValue: number
  neighborhoodCeiling: number
  headroom: number
  headroomPct: number
  lines: RoiLine[]
  totalCost: number
  totalValueAdded: number
  totalNetGain: number
  projectedValue: number
  /** True when planned work pushes past what the street supports. */
  exceedsCeiling: boolean
  /** How much SHOULD be spent, as distinct from what was proposed. */
  budget: BudgetGuidance
  summary: string
  warnings: string[]
}

export interface BudgetGuidance {
  /** Spend beyond this cannot be recovered on a sale, by definition of the ceiling. */
  maxRecoverableSpend: number
  /** The subset of the proposed plan that actually pays, and what it costs. */
  recommendedSpend: number
  recommendedItems: string[]
  /** Items to drop, with the reason. */
  cutItems: Array<{ label: string; reason: string }>
  /** Net gain if only the recommended subset is done. */
  recommendedNetGain: number
  /** Net gain if the whole proposed plan is done — the comparison that matters. */
  fullPlanNetGain: number
  guidance: string
}

/**
 * How much to actually spend.
 *
 * A ranked list answers "which renovations are best" but not "how much should
 * I put in", which is the question with money attached. The ceiling gives a
 * hard upper bound — spend past the headroom and the excess cannot come back
 * on a sale, whatever it is spent on.
 *
 * Within that bound, the recommended budget is the subset of the proposed plan
 * that still pays for itself, dropping the rest. Table stakes are kept even
 * when their own return is negative, because they gate the sale rather than
 * add to the price.
 */
function buildBudget(lines: RoiLine[], headroom: number, tableStakesKeys: Set<string>): BudgetGuidance {
  const recommended: RoiLine[] = []
  const cuts: Array<{ label: string; reason: string }> = []

  for (const line of lines) {
    const mustDo = tableStakesKeys.has(line.key)
    if (mustDo) { recommended.push(line); continue }
    if (line.netGain > 0) { recommended.push(line); continue }

    cuts.push({
      label: line.label,
      reason: line.valueLostToCeiling > 0
        ? `Costs $${line.cost.toLocaleString()} but only $${line.valueAdded.toLocaleString()} can be recovered — ` +
          `$${line.valueLostToCeiling.toLocaleString()} of it pushes past what the street supports.`
        : `Costs $${line.cost.toLocaleString()} and returns $${line.valueAdded.toLocaleString()} — a net loss of ` +
          `$${Math.abs(line.netGain).toLocaleString()} even before risk.`,
    })
  }

  const recommendedSpend = recommended.reduce((s, l) => s + l.cost + l.holdingCost, 0)
  const recommendedNetGain = recommended.reduce((s, l) => s + l.netGain, 0)
  const fullPlanNetGain = lines.reduce((s, l) => s + l.netGain, 0)

  const guidance = cuts.length === 0
    ? `Every item in this plan pays for itself. Budget about $${recommendedSpend.toLocaleString()}, and do not exceed ` +
      `$${Math.round(headroom).toLocaleString()} in total — beyond that the street cannot support the price.`
    : recommendedSpend === 0
      ? `Nothing in this plan returns more than it costs on this property. The binding constraint is the ceiling: ` +
        `there is only $${Math.round(headroom).toLocaleString()} of headroom to work with.`
      : `Spend about $${recommendedSpend.toLocaleString()}, not the full $${lines.reduce((s, l) => s + l.cost, 0).toLocaleString()} ` +
        `proposed. Dropping ${cuts.length} item${cuts.length === 1 ? "" : "s"} improves the net result by ` +
        `$${Math.round(recommendedNetGain - fullPlanNetGain).toLocaleString()} — the cut work costs more than the ` +
        `street will pay for it.`

  return {
    maxRecoverableSpend: Math.round(headroom),
    recommendedSpend: Math.round(recommendedSpend),
    recommendedItems: recommended.map(l => l.label),
    cutItems: cuts,
    recommendedNetGain: Math.round(recommendedNetGain),
    fullPlanNetGain: Math.round(fullPlanNetGain),
    guidance,
  }
}

// When a broader and a narrower entry both match the same words, the narrower
// one wins. "Add a second bathroom" contains the word "bathroom", so it matches
// the refresh entry too — counting both would bill the same work twice and
// inflate the plan's cost and its value.
const SUPERSEDES: Record<string, string[]> = {
  kitchen_major:  ["kitchen_minor"],
  bath_add:       ["bath_refresh"],
  bedroom_add:    ["cosmetic_full"],
  adu:            ["basement_finish"],
  cosmetic_full:  ["paint_interior", "flooring", "curb_appeal"],
}

function matchRenovations(description: string): RenovationSpec[] {
  const found = RENOVATION_CATALOG.filter(r => r.matches.test(description))
  const suppressed = new Set<string>()
  for (const r of found) {
    for (const key of SUPERSEDES[r.key] ?? []) suppressed.add(key)
  }
  return found.filter(r => !suppressed.has(r.key))
}

function specCost(spec: RenovationSpec, sqft: number, multiplier: number): number {
  const base = spec.costPerSqft
    ? spec.costPerSqft * sqft * (spec.areaShare ?? 1)
    : spec.baseCost
  return Math.round(base * multiplier)
}

export function analyzeRenovationRoi(input: RoiInput): RoiReport {
  const {
    asIsValue, sqft, neighborhoodCeiling, condition, description,
    costMultiplier = 1.0, monthlyCarry = 0,
  } = input

  if (!asIsValue || asIsValue <= 0) {
    return emptyReport("A current as-is value is required — ROI cannot be judged without a starting point.")
  }
  if (!neighborhoodCeiling || neighborhoodCeiling <= 0) {
    return emptyReport(
      "A neighbourhood ceiling is required. Without the highest price the street supports, any renovation " +
      "can be made to look profitable on paper — which is exactly the error this tool exists to prevent."
    )
  }

  const matched = matchRenovations(description)
  if (matched.length === 0) {
    return emptyReport(
      "No recognised renovation in that description. Try naming the work directly — kitchen, bathroom, roof, " +
      "HVAC, flooring, paint, foundation, ADU, or a full cosmetic refresh."
    )
  }

  const headroom = Math.max(0, neighborhoodCeiling - asIsValue)
  const baseline = BASELINE_MULTIPLIER[condition]

  // Renovations are evaluated in descending order of raw efficiency, because
  // the ceiling is a shared budget: whichever work happens first consumes the
  // available headroom, and later work competes for what is left. Ranking by
  // efficiency models the order a rational owner would actually do them in.
  const ordered = [...matched].sort((a, b) => b.grossReturn - a.grossReturn)

  let headroomRemaining = headroom
  const lines: RoiLine[] = []

  for (const spec of ordered) {
    const cost = specCost(spec, sqft, costMultiplier)
    const reasoning: string[] = []

    // 1. Theoretical value before any property-specific constraint.
    const theoretical = cost * spec.grossReturn

    // 2. Baseline: how much of that the starting condition actually unlocks.
    //    Table-stakes items are exempt — a failed roof must be replaced
    //    regardless of how presentable the rest of the house is.
    const afterBaseline = spec.tableStakes ? theoretical : theoretical * baseline
    if (!spec.tableStakes && baseline < 1) {
      reasoning.push(
        `The area is ${CONDITION_LABEL[condition]}, so this captures about ${Math.round(baseline * 100)}% of ` +
        `the value it would add to a property in poor condition — you are improving something that already works.`
      )
    }
    if (spec.tableStakes) {
      reasoning.push(
        "Table stakes: buyers do not pay extra for this, but its absence shrinks the buyer pool and can block " +
        "financing entirely, so the real cost of skipping it is larger than the line item."
      )
    }

    // 3. The ceiling. Bracket jumps and ADUs can legitimately exceed it, because
    //    they change which comparables apply rather than competing within them.
    let valueAdded = afterBaseline
    let valueLostToCeiling = 0

    if (spec.bracketJump) {
      reasoning.push(
        "This is a bracket jump — it moves the property into a different set of comparables rather than " +
        "competing inside the current one, so the existing ceiling does not bind it."
      )
    } else if (valueAdded > headroomRemaining) {
      valueLostToCeiling = valueAdded - headroomRemaining
      valueAdded = headroomRemaining
      reasoning.push(
        `Capped by the neighbourhood ceiling: only $${Math.round(headroomRemaining).toLocaleString()} of headroom ` +
        `remains between this property and the best price the street supports, so roughly ` +
        `$${Math.round(valueLostToCeiling).toLocaleString()} of this spend cannot come back on a sale.`
      )
      if (headroomRemaining <= 0) {
        reasoning.push(
          "There is no headroom left at all — the property is already at what the street supports. Money spent " +
          "here buys a faster sale or a nicer house to live in, not a higher price."
        )
      }
    }

    if (!spec.bracketJump) headroomRemaining = Math.max(0, headroomRemaining - valueAdded)

    // 4. Holding cost — time is a real cost on anything financed.
    const holdingCost = Math.round((spec.weeks / 4.33) * monthlyCarry)
    if (holdingCost > 0) {
      reasoning.push(
        `About ${spec.weeks} weeks of work, carrying $${Math.round(holdingCost).toLocaleString()} in holding cost ` +
        `at $${monthlyCarry.toLocaleString()}/month.`
      )
    }

    const netGain = valueAdded - cost - holdingCost
    const roiPct = cost > 0 ? (netGain / cost) * 100 : 0

    // 5. Risk adjustment — score the downside case, where cost runs over and
    //    value does not follow it.
    const costHigh = Math.round(cost * (1 + spec.costVariance))
    const costLow = Math.round(cost * (1 - spec.costVariance * 0.4))
    const riskAdjustedNet = valueAdded - costHigh - holdingCost
    const riskAdjustedRoiPct = costHigh > 0 ? (riskAdjustedNet / costHigh) * 100 : 0

    if (spec.costVariance >= 0.4) {
      reasoning.push(
        `Wide cost range ($${costLow.toLocaleString()}–$${costHigh.toLocaleString()}): the true scope is not ` +
        `visible until work begins, so budget to the top of the range rather than the estimate.`
      )
    }

    reasoning.push(spec.note)

    const confidence: RoiLine["confidence"] =
      spec.costVariance <= 0.2 ? "high" : spec.costVariance <= 0.35 ? "medium" : "low"

    const verdict: RoiLine["verdict"] =
      spec.tableStakes && netGain < 0 ? "do_first"
        : roiPct >= 25 ? "do_first"
        : roiPct >= 0 ? "worth_doing"
        : roiPct >= -25 ? "marginal"
        : "avoid"

    if (spec.tableStakes && netGain < 0) {
      reasoning.push(
        "Ranked as do-first despite a negative return on paper: this is not an investment decision, it is a " +
        "condition for the property being sellable or financeable at all."
      )
    }

    lines.push({
      key: spec.key, label: spec.label,
      cost, costLow, costHigh,
      valueAdded: Math.round(valueAdded),
      valueLostToCeiling: Math.round(valueLostToCeiling),
      holdingCost,
      netGain: Math.round(netGain),
      roiPct: Math.round(roiPct * 10) / 10,
      riskAdjustedRoiPct: Math.round(riskAdjustedRoiPct * 10) / 10,
      weeks: spec.weeks, confidence, verdict, reasoning,
    })
  }

  // Present best-first, but keep table stakes at the top regardless of return —
  // they gate the sale.
  lines.sort((a, b) => {
    if (a.verdict === "do_first" && b.verdict !== "do_first") return -1
    if (b.verdict === "do_first" && a.verdict !== "do_first") return 1
    return b.roiPct - a.roiPct
  })

  const totalCost = lines.reduce((s, l) => s + l.cost, 0)
  const totalValueAdded = lines.reduce((s, l) => s + l.valueAdded, 0)
  const totalHolding = lines.reduce((s, l) => s + l.holdingCost, 0)
  const totalNetGain = totalValueAdded - totalCost - totalHolding
  const projectedValue = asIsValue + totalValueAdded
  const exceedsCeiling = projectedValue > neighborhoodCeiling * 1.02

  const warnings: string[] = []
  const totalLostToCeiling = lines.reduce((s, l) => s + l.valueLostToCeiling, 0)
  if (totalLostToCeiling > 0) {
    warnings.push(
      `$${Math.round(totalLostToCeiling).toLocaleString()} of this plan cannot be recovered on a sale because it ` +
      `pushes past what the street supports. Reducing scope on the lowest-return items would raise the return on ` +
      `the whole project.`
    )
  }
  if (headroom < asIsValue * 0.05) {
    warnings.push(
      "This property is already within 5% of the neighbourhood ceiling. Renovating for resale value is very hard " +
      "to justify here — the realistic reasons to spend are speed of sale, or your own enjoyment."
    )
  }
  if (totalNetGain < 0) {
    warnings.push("As scoped, this plan costs more than it returns. The individual lines below show which items are dragging it down.")
  }

  const tableStakesKeys = new Set(
    RENOVATION_CATALOG.filter(r => r.tableStakes).map(r => r.key)
  )
  const budget = buildBudget(lines, headroom, tableStakesKeys)

  const best = lines.find(l => l.verdict === "do_first" || l.verdict === "worth_doing")
  const summary = totalNetGain >= 0
    ? `Projected value $${Math.round(projectedValue).toLocaleString()} against a ceiling of ` +
      `$${Math.round(neighborhoodCeiling).toLocaleString()}. Spending $${Math.round(totalCost).toLocaleString()} ` +
      `returns about $${Math.round(totalValueAdded).toLocaleString()}, a net of ` +
      `$${Math.round(totalNetGain).toLocaleString()}.` +
      (best ? ` Start with: ${best.label}.` : "")
    : `This plan spends $${Math.round(totalCost).toLocaleString()} to add about ` +
      `$${Math.round(totalValueAdded).toLocaleString()} — a net loss of ` +
      `$${Math.abs(Math.round(totalNetGain)).toLocaleString()}. The ceiling on this street is the binding constraint.`

  return {
    ok: true, asIsValue, neighborhoodCeiling,
    headroom: Math.round(headroom),
    headroomPct: Math.round((headroom / asIsValue) * 1000) / 10,
    lines, totalCost, totalValueAdded: Math.round(totalValueAdded),
    totalNetGain: Math.round(totalNetGain),
    projectedValue: Math.round(projectedValue),
    exceedsCeiling, budget, summary, warnings,
  }
}

function emptyReport(error: string): RoiReport {
  return {
    ok: false, error, asIsValue: 0, neighborhoodCeiling: 0, headroom: 0, headroomPct: 0,
    lines: [], totalCost: 0, totalValueAdded: 0, totalNetGain: 0, projectedValue: 0,
    exceedsCeiling: false,
    budget: {
      maxRecoverableSpend: 0, recommendedSpend: 0, recommendedItems: [], cutItems: [],
      recommendedNetGain: 0, fullPlanNetGain: 0, guidance: "",
    },
    summary: "", warnings: [],
  }
}

/** Estimates the ceiling from comparable sales when one is not supplied.
 *  The top of the comp range is the honest cap — the best a buyer has actually
 *  paid on this street, not an average. */
export function ceilingFromComps(comps: Array<{ price: number }>, sqft?: number, areaPsf?: number): number | null {
  const prices = comps.map(c => c.price).filter(p => typeof p === "number" && p > 0).sort((a, b) => b - a)
  if (prices.length === 0) {
    return sqft && areaPsf ? Math.round(sqft * areaPsf * 1.15) : null
  }
  // The single highest sale can be an outlier (an unusual lot, a related-party
  // transaction), so the ceiling is taken just under the top of the range.
  const top = prices[0]
  const second = prices[1] ?? top
  return Math.round(prices.length >= 2 ? (top + second) / 2 : top * 0.97)
}
