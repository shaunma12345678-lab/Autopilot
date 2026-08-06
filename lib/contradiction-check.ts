// Contradiction detection — where management's words disagree with their numbers.
//
// THIS IS THE ANSWER TO "how does the AI know if something is bad."
//
// An LLM reading a 10-K is reading a document the company wrote about itself,
// carefully lawyered, designed to present well. Ask it "is this good?" and it
// will mostly say yes, because the text says yes. Prompting alone cannot fix
// that — the model is faithfully summarizing a promotional source.
//
// What DOES work is refusing to trust either source alone and checking them
// against each other. Management's narrative is a claim; XBRL is an audited
// number. When they diverge, the divergence itself is the signal — and it is
// far more reliable than anything either source says on its own:
//
//   "We delivered strong growth"        + revenue decelerating   -> contradiction
//   "Robust cash generation"            + cash conversion < 0.7  -> contradiction
//   "Disciplined capital allocation"    + buybacks at peak prices-> contradiction
//   "Improving margins"                 + margins compressing    -> contradiction
//   "Strong demand"                     + inventory piling up    -> contradiction
//   No mention of debt                  + maturity wall in 12mo  -> omission
//
// Omissions matter as much as contradictions. A company with a large near-term
// maturity that never discusses it in MD&A is telling you something by silence.
//
// Nothing here asks an AI for a verdict. Each check is a deterministic
// comparison between a parsed claim and a computed number, so the output is
// reproducible and auditable rather than a model's mood on a given day.
import type { NarrativeRead } from "./edgar-narrative"
import type { NormalizedFundamentals } from "./edgar-normalize"
import type { ForwardSignals } from "./forward-signals"
import type { AccountingQuality } from "./accounting-quality"
import type { BalanceSheetRisk } from "./balance-sheet-risk"
import type { CapitalAllocationResult } from "./capital-allocation"

export interface Contradiction {
  claim: string
  reality: string
  severity: "high" | "medium" | "low"
}

export interface ContradictionResult {
  contradictions: Contradiction[]
  omissions: string[]
  credibilityScore: number   // 0-100; how well the narrative matches the numbers
  riskPenalty: number
  flags: string[]
}

// Does any of management's stated language make this kind of claim?
function claims(narrative: NarrativeRead, patterns: RegExp): string | null {
  const haystack = [
    narrative.summary,
    ...narrative.strategy,
    ...narrative.growthDrivers,
    ...narrative.capitalPlans,
  ]
  for (const text of haystack) {
    if (typeof text === "string" && patterns.test(text)) return text
  }
  return null
}

function mentions(narrative: NarrativeRead, patterns: RegExp): boolean {
  const haystack = [
    narrative.summary, narrative.toneEvidence,
    ...narrative.strategy, ...narrative.growthDrivers,
    ...narrative.headwinds, ...narrative.capitalPlans,
  ]
  return haystack.some(t => typeof t === "string" && patterns.test(t))
}

export function checkContradictions(params: {
  narrative: NarrativeRead | null
  fundamentals: NormalizedFundamentals
  forward: ForwardSignals
  accounting: AccountingQuality
  balanceSheet: BalanceSheetRisk
  capitalAllocation: CapitalAllocationResult
}): ContradictionResult {
  const { narrative, fundamentals, forward, accounting, balanceSheet, capitalAllocation } = params

  const contradictions: Contradiction[] = []
  const omissions: string[] = []

  if (!narrative) {
    return {
      contradictions: [], omissions: [], credibilityScore: 50, riskPenalty: 0,
      flags: [],
    }
  }

  // ── Growth claim vs actual trajectory ────────────────────────────────────
  const growthClaim = claims(narrative, /growth|expand|accelerat|momentum|record/i)
  if (growthClaim && forward.revenueAccelerationPct !== null && forward.revenueAccelerationPct < -8) {
    contradictions.push({
      claim: growthClaim.slice(0, 140),
      reality: `Revenue growth actually decelerated by ${Math.abs(forward.revenueAccelerationPct).toFixed(1)} points versus the prior year.`,
      severity: "high",
    })
  }

  // ── Cash-generation claim vs cash conversion ─────────────────────────────
  const cashClaim = claims(narrative, /cash flow|cash generation|free cash|liquidity/i)
  if (cashClaim && accounting.avgCashConversion !== null && accounting.avgCashConversion < 0.75) {
    contradictions.push({
      claim: cashClaim.slice(0, 140),
      reality: `Operating cash flow has averaged only ${(accounting.avgCashConversion * 100).toFixed(0)}% of reported net income — profit is not converting to cash.`,
      severity: "high",
    })
  }

  // ── Margin claim vs margin direction ─────────────────────────────────────
  const marginClaim = claims(narrative, /margin expansion|improving margin|operating leverage|efficienc/i)
  if (marginClaim && fundamentals.operatingMarginPct !== null && fundamentals.netMarginPct !== null
      && fundamentals.operatingMarginPct < 0) {
    contradictions.push({
      claim: marginClaim.slice(0, 140),
      reality: `Operating margin is negative (${fundamentals.operatingMarginPct.toFixed(1)}%).`,
      severity: "high",
    })
  }

  // ── Demand claim vs inventory build ──────────────────────────────────────
  const demandClaim = claims(narrative, /strong demand|demand for our|customer demand|backlog/i)
  if (demandClaim && accounting.inventoryTurnsTrend !== null && accounting.inventoryTurnsTrend < -1.5) {
    contradictions.push({
      claim: demandClaim.slice(0, 140),
      reality: "Inventory is turning over materially more slowly than it was, which usually precedes softening demand.",
      severity: "medium",
    })
  }

  // ── Capital-discipline claim vs buyback timing ───────────────────────────
  const disciplineClaim = claims(narrative, /disciplined|shareholder return|capital allocation|repurchas/i)
  if (disciplineClaim && capitalAllocation.avgBuybackPricePercentile !== null
      && capitalAllocation.avgBuybackPricePercentile >= 72) {
    contradictions.push({
      claim: disciplineClaim.slice(0, 140),
      reality: `Repurchases were concentrated when the stock traded in the ${capitalAllocation.avgBuybackPricePercentile.toFixed(0)}th percentile of its own range — buying high, not low.`,
      severity: "medium",
    })
  }

  // ── Collection claim vs DSO ──────────────────────────────────────────────
  if (accounting.dsoTrendDays !== null && accounting.dsoTrendDays > 25
      && !mentions(narrative, /receivable|collection|days sales|credit risk/i)) {
    omissions.push(`Customers are taking ${accounting.dsoTrendDays.toFixed(0)} days longer to pay than at the start of the window, and the filing's discussion never raises receivables or collection.`)
  }

  // ── Debt maturity omission ───────────────────────────────────────────────
  if (balanceSheet.debtWallToFcfYears !== null && balanceSheet.debtWallToFcfYears > 2
      && !mentions(narrative, /debt|maturit|refinanc|leverage|credit facilit/i)) {
    omissions.push(`Roughly ${balanceSheet.debtWallToFcfYears.toFixed(1)} years of free cash flow is due as debt within 12 months, and management's discussion never addresses refinancing.`)
  }

  // ── Dilution omission ────────────────────────────────────────────────────
  if (balanceSheet.sbcToRevenuePct !== null && balanceSheet.sbcToRevenuePct > 12
      && !mentions(narrative, /dilut|share-based|stock compensation|equity award/i)) {
    omissions.push(`Share-based compensation runs ${balanceSheet.sbcToRevenuePct.toFixed(1)}% of revenue without being addressed in the narrative — dilution that hasn't reached the share count yet.`)
  }

  // ── Tone vs risk ─────────────────────────────────────────────────────────
  if (narrative.outlookTone === "constructive" && balanceSheet.riskPenalty >= 25) {
    contradictions.push({
      claim: `Management's tone reads as constructive: "${narrative.toneEvidence.slice(0, 100)}"`,
      reality: "The balance sheet carries multiple material obligations or exposures at the same time.",
      severity: "medium",
    })
  }

  // ── Score ────────────────────────────────────────────────────────────────
  const highCount = contradictions.filter(c => c.severity === "high").length
  const medCount = contradictions.filter(c => c.severity === "medium").length

  let credibilityScore = 100 - highCount * 25 - medCount * 12 - omissions.length * 8
  credibilityScore = Math.max(0, Math.min(100, credibilityScore))

  const riskPenalty = Math.min(highCount * 10 + medCount * 5 + omissions.length * 3, 30)

  const flags: string[] = []
  for (const c of contradictions) {
    flags.push(`⚠ Narrative vs. numbers — management states: "${c.claim}" but the filings show: ${c.reality}`)
  }
  for (const o of omissions) {
    flags.push(`⚠ Omission — ${o}`)
  }

  return { contradictions, omissions, credibilityScore, riskPenalty, flags }
}
