// Proprietary stock analysis engine. EDGAR and Stooq supply raw numbers; this
// file turns them into a judgment.
//
// Design rules (ported from DEEP_RISK_DATA_INTEGRITY_SPEC.md):
//  1. TWO AXES, never collapsed. Fundamental strength and risk are scored
//     separately so a user can sort by both, exactly like Deal Card v2's
//     Motivation vs. Risk split. Collapsing them is what every retail screener
//     gets wrong.
//  2. DATA GATE. Below a minimum share of core criteria we refuse to emit a
//     score at all rather than produce a confident-looking number from thin data.
//  3. WEIGHT RENORMALIZATION, never zero-fill. A missing metric has its weight
//     redistributed across present metrics, so scores reflect
//     quality-given-known-data rather than data-availability bias.
//  4. SECTOR CONTEXT where available, absolute thresholds as fallback.
//  5. The BUY/HOLD/PASS action signal is derived in lib/action-signal.ts from
//     BOTH axes plus data confidence — it is not a rename of the quality score.
//     It ships alongside a persistent disclaimer, is applied uniformly to every
//     asset, and is never personalized to an individual's situation.
import type { NormalizedFundamentals } from "./edgar-normalize"
import type { StockQuote } from "./price-feed"
import type { PriceMetrics } from "./price-history"
import type { PiotroskiResult } from "./stock-scores/piotroski"
import type { AltmanResult } from "./stock-scores/altman"
import type { BeneishResult } from "./stock-scores/beneish"
import type { SectorRelativeResult } from "./sector-benchmarks"
import { deriveActionSignal, type ActionSignal } from "./action-signal"

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x))
}

export interface StockScoreInput {
  fundamentals: NormalizedFundamentals
  price: StockQuote | null
  priceMetrics: PriceMetrics | null
  piotroski: PiotroskiResult | null
  altman: AltmanResult | null
  beneish: BeneishResult | null
  sectorRelative: SectorRelativeResult | null
  /** Net margin percentile against every SEC filer reporting both revenue and
   *  net income that period (lib/market-percentile.ts) — thousands of real
   *  peers, not the few hundred rows sectorRelative draws from. Null when
   *  the frame join didn't clear its own reporter floor. */
  marketNetMarginPercentile?: number | null
  goingConcernHits: number
  /** Risk contributed by live 8-K events and recent news, with their flags. */
  externalRiskPenalty?: number
  externalRiskFlags?: string[]
  /** A filed restatement invalidates the fundamentals these ratios come from. */
  hasRestatement?: boolean
  /** Forward composite, used to gate BUY (see lib/action-signal.ts). */
  forwardScore?: number | null
  /** Material degradation vs this asset's own baseline (lib/score-history.ts). */
  deterioration?: { shouldSell: boolean; reasons: string[] } | null
  /** Multi-year durability, 0-100 (see lib/consistency.ts). */
  consistencyScore?: number | null
  /** Small additive bonus for genuine insider cluster buying. */
  insiderScoreBonus?: number
}

export type StrengthTier = "strong" | "mixed" | "weak"

export interface StockScoreResult {
  qualityScore: number | null
  grade: "A" | "B" | "C" | "D" | "F" | null
  strengthTier: StrengthTier | null
  riskScore: number | null          // 0-100, higher = more risk
  riskFlags: string[]
  dataCompletenessPct: number
  dataConfidence: "insufficient" | "low" | "medium" | "high"
  earlyWarning: boolean
  qualityReasons: string[]
  peRatio: number | null
  actionSignal: ActionSignal | null
  actionRationale: string
}

interface Criterion {
  key: string
  label: string
  weight: number
  isCore: boolean
  value: number | null
  score: (v: number) => number
}

function gradeFor(score: number): "A" | "B" | "C" | "D" | "F" {
  if (score >= 80) return "A"
  if (score >= 65) return "B"
  if (score >= 50) return "C"
  if (score >= 35) return "D"
  return "F"
}

function tierFor(score: number): StrengthTier {
  if (score >= 65) return "strong"
  if (score >= 45) return "mixed"
  return "weak"
}

export function scoreStock(input: StockScoreInput): StockScoreResult {
  const f = input.fundamentals
  const pm = input.priceMetrics

  // ── Opportunity axis: fundamental strength ────────────────────────────────
  const core: Criterion[] = [
    { key: "revenueGrowth", label: "Revenue growth", weight: 10, isCore: true, value: f.revenueGrowthYoyPct,
      score: v => clamp(50 + v * 1.5, 0, 100) },
    { key: "grossMargin", label: "Gross margin", weight: 4, isCore: true, value: f.grossMarginPct,
      score: v => clamp((v / 50) * 100, 0, 100) },
    { key: "operatingMargin", label: "Operating margin", weight: 7, isCore: true, value: f.operatingMarginPct,
      score: v => clamp(50 + v * 2.5, 0, 100) },
    { key: "netMargin", label: "Net margin", weight: 7, isCore: true, value: f.netMarginPct,
      score: v => clamp(50 + v * 3, 0, 100) },
    { key: "roe", label: "Return on equity", weight: 9, isCore: true, value: f.roePct,
      score: v => clamp((v / 20) * 100, 0, 100) },
    { key: "roic", label: "Return on invested capital", weight: 5, isCore: true, value: f.roicPct,
      score: v => clamp((v / 15) * 100, 0, 100) },
    { key: "debtToEquity", label: "Debt-to-equity", weight: 6, isCore: true, value: f.debtToEquity,
      score: v => (v <= 0 ? 100 : clamp(100 - v * 35, 0, 100)) },
    { key: "interestCoverage", label: "Interest coverage", weight: 5, isCore: true, value: f.interestCoveragePct,
      score: v => (v < 1.5 ? clamp(v * 20, 0, 30) : clamp(30 + ((v - 1.5) / 6) * 70, 30, 100)) },
    { key: "currentRatio", label: "Current ratio", weight: 4, isCore: true, value: f.currentRatio,
      score: v => clamp(100 - Math.abs(v - 2) * 25, 0, 100) },
    { key: "fcfMargin", label: "Free cash flow margin", weight: 9, isCore: true, value: f.fcfMarginPct,
      score: v => clamp(50 + v * 2.5, 0, 100) },
    { key: "accruals", label: "Earnings quality (accruals)", weight: 8, isCore: true, value: f.accrualsRatioPct,
      score: v => clamp(100 - Math.abs(v) * 6, 0, 100) },
  ]

  const conditional: Criterion[] = [
    // Piotroski is the highest-weighted single input: it's a validated composite,
    // not one ratio, so it carries more information than any individual metric.
    { key: "piotroski", label: "Piotroski F-Score", weight: 13, isCore: false,
      value: input.piotroski?.normalized ?? null,
      score: v => clamp((v / 9) * 100, 0, 100) },
    // 12-1 momentum: the most replicated free signal available to us.
    { key: "momentum", label: "12-month momentum", weight: 11, isCore: false,
      value: pm?.momentum12m1Pct ?? null,
      score: v => clamp(50 + v * 1.2, 0, 100) },
    { key: "sectorRelative", label: "Performance vs. sector peers", weight: 9, isCore: false,
      value: input.sectorRelative?.score ?? null,
      score: v => clamp(v, 0, 100) },
    // Real cross-sectional data (thousands of SEC filers via frames) rather
    // than sectorRelative's own accumulated sample of a few hundred rows —
    // weighted close to Piotroski/consistency because the peer set behind it
    // is genuinely the market, not an approximation of it.
    { key: "marketMargin", label: "Net margin vs. every SEC filer", weight: 10, isCore: false,
      value: input.marketNetMarginPercentile ?? null,
      score: v => clamp(v, 0, 100) },
    { key: "nearHigh", label: "Proximity to 52-week high", weight: 4, isCore: false,
      value: pm?.pctFrom52WeekHigh ?? null,
      score: v => clamp(100 + v * 2.5, 0, 100) },
    { key: "buyback", label: "Buyback yield", weight: 4, isCore: false, value: f.buybackYieldPct,
      score: v => clamp(50 + v * 8, 0, 100) },
    { key: "dividendSafety", label: "Dividend safety (FCF coverage)", weight: 5, isCore: false,
      value: f.payoutRatioFcfPct,
      score: v => (v > 100 ? clamp(100 - (v - 100) * 2, 0, 40) : clamp(100 - v * 0.3, 40, 100)) },
    // Multi-year durability. Weighted heavily because one good year is the
    // easiest thing in the world to mistake for a good business.
    { key: "consistency", label: "Multi-year consistency", weight: 12, isCore: false,
      value: input.consistencyScore ?? null,
      score: v => clamp(v, 0, 100) },
    { key: "valuation", label: "Valuation (P/E)", weight: 7, isCore: false,
      value: (input.price && f.epsDiluted && f.epsDiluted > 0) ? input.price.price / f.epsDiluted : null,
      score: v => clamp(100 - Math.abs(v - 18) * 2.5, 0, 100) },
  ]

  const corePresent = core.filter(c => c.value !== null && isFinite(c.value))
  const dataCompletenessPct = Math.round((corePresent.length / core.length) * 100)
  const missingLabels = core.filter(c => c.value === null).map(c => c.label)

  const peRatio = conditional.find(c => c.key === "valuation")?.value ?? null

  if (dataCompletenessPct < 40) {
    return {
      qualityScore: null, grade: null, strengthTier: null,
      riskScore: null, riskFlags: [],
      dataCompletenessPct, dataConfidence: "insufficient", earlyWarning: false,
      qualityReasons: [`Not enough SEC filing history to analyze reliably. Missing: ${missingLabels.join(", ")}.`],
      peRatio,
      actionSignal: null,
      actionRationale: "Not enough reliable filing data to form a view — no signal is shown rather than guessing.",
    }
  }

  const scored = [...core, ...conditional]
    .filter((c): c is Criterion & { value: number } => c.value !== null && isFinite(c.value))
    .map(c => ({ criterion: c, points: c.score(c.value) }))

  const totalWeight = scored.reduce((s, x) => s + x.criterion.weight, 0)
  let qualityScore = totalWeight > 0
    ? Math.round(scored.reduce((s, x) => s + x.points * x.criterion.weight, 0) / totalWeight)
    : 50

  // Insider cluster buying is a real but modest effect — added as a small
  // bonus rather than a weighted criterion so it can never outvote the
  // fundamentals on its own.
  qualityScore += input.insiderScoreBonus ?? 0

  // ── Risk axis: scored independently, never netted against strength ────────
  const riskFlags: string[] = [...(input.externalRiskFlags ?? [])]
  let riskScore = 20 + (input.externalRiskPenalty ?? 0) // baseline plus live-event/news risk
  let earlyWarning = false
  if ((input.externalRiskPenalty ?? 0) >= 25) earlyWarning = true

  if (input.goingConcernHits > 0) {
    riskScore += 35
    earlyWarning = true
    riskFlags.push('⚠ "Going concern" language appears in recent SEC filings — the most serious solvency warning a filer can disclose.')
  }

  if (input.altman?.zone === "distress") {
    riskScore += 25
    earlyWarning = true
    riskFlags.push(`⚠ ${input.altman.interpretation}`)
  } else if (input.altman?.zone === "grey") {
    riskScore += 10
    riskFlags.push(input.altman.interpretation)
  }

  if (input.beneish?.flagged === true) {
    riskScore += 15
    riskFlags.push(`⚠ ${input.beneish.interpretation}`)
  }

  if (f.interestCoveragePct !== null && f.interestCoveragePct < 1.5) {
    riskScore += 15
    earlyWarning = true
    riskFlags.push(`⚠ Interest coverage is only ${f.interestCoveragePct.toFixed(1)}x — thin cushion for servicing debt.`)
  }

  if (f.accrualsRatioPct !== null && f.accrualsRatioPct > 10) {
    riskScore += 10
    riskFlags.push(`⚠ Earnings run well ahead of operating cash flow (accruals ${f.accrualsRatioPct.toFixed(1)}%) — a classic earnings-quality warning.`)
  }

  if (f.currentRatio !== null && f.currentRatio < 1.0) {
    riskScore += 10
    riskFlags.push(`⚠ Current ratio ${f.currentRatio.toFixed(2)} — current liabilities exceed current assets.`)
  }

  if (f.buybackYieldPct !== null && f.buybackYieldPct < -5) {
    riskScore += 8
    riskFlags.push(`⚠ Share count grew ${Math.abs(f.buybackYieldPct).toFixed(1)}% — ongoing dilution of existing holders.`)
  }

  if (pm?.volatility30dPct !== null && pm?.volatility30dPct !== undefined && pm.volatility30dPct > 60) {
    riskScore += 10
    riskFlags.push(`⚠ Annualized volatility ${pm.volatility30dPct.toFixed(0)}% — price swings are large relative to a typical equity.`)
  }

  if (pm?.maxDrawdown1yPct !== null && pm?.maxDrawdown1yPct !== undefined && pm.maxDrawdown1yPct < -50) {
    riskScore += 8
    riskFlags.push(`⚠ Fell ${Math.abs(pm.maxDrawdown1yPct).toFixed(0)}% from its 1-year peak at the worst point.`)
  }

  if (f.debtToEquity !== null && f.debtToEquity > 2.5) {
    riskScore += 8
    riskFlags.push(`⚠ Debt-to-equity ${f.debtToEquity.toFixed(1)}x — heavily leveraged.`)
  }

  riskScore = clamp(riskScore, 0, 100)

  // Severe, verified solvency warnings cap the strength score. No combination
  // of good ratios should out-vote an active going-concern disclosure.
  if (input.goingConcernHits > 0) qualityScore = Math.min(qualityScore, 35)
  if (input.altman?.zone === "distress") qualityScore = Math.min(qualityScore, 45)
  // A restatement means the company itself said these financials shouldn't be
  // relied on. Every ratio above derives from them, so the score can't stand.
  if (input.hasRestatement) qualityScore = Math.min(qualityScore, 30)

  // ── Plain-English reasons ─────────────────────────────────────────────────
  const reasons: string[] = []
  if (input.piotroski?.normalized !== null && input.piotroski?.interpretation) reasons.push(input.piotroski.interpretation)
  if (input.altman?.zone === "safe" && input.altman.interpretation) reasons.push(`✓ ${input.altman.interpretation}`)
  if (input.beneish?.flagged === false) reasons.push("✓ No statistical resemblance to manipulated-earnings profiles (Beneish M-Score).")
  if (pm?.momentum12m1Pct !== null && pm?.momentum12m1Pct !== undefined) {
    reasons.push(pm.momentum12m1Pct > 15
      ? `✓ Strong 12-month price momentum (+${pm.momentum12m1Pct.toFixed(0)}%).`
      : pm.momentum12m1Pct < -15
      ? `⚠ Negative 12-month price momentum (${pm.momentum12m1Pct.toFixed(0)}%).`
      : `12-month momentum is roughly flat (${pm.momentum12m1Pct.toFixed(0)}%).`)
  }
  for (const note of input.sectorRelative?.notes ?? []) reasons.push(note)

  const ranked = [...scored].sort((a, b) => b.points - a.points)
  for (const top of ranked.slice(0, 2)) {
    if (top.points >= 75 && !reasons.some(r => r.includes(top.criterion.label))) {
      reasons.push(`✓ ${top.criterion.label} is strong.`)
    }
  }
  for (const bottom of ranked.slice(-2)) {
    if (bottom.points <= 30 && !reasons.some(r => r.includes(bottom.criterion.label))) {
      reasons.push(`⚠ ${bottom.criterion.label} is weak.`)
    }
  }

  qualityScore = clamp(qualityScore, 0, 100)
  const dataConfidence = dataCompletenessPct >= 90 ? "high" : dataCompletenessPct >= 70 ? "medium" : "low"

  // A verified going-concern disclosure is an outright disqualifier — it
  // overrides the numeric matrix rather than being averaged against it.
  const action = deriveActionSignal({
    qualityScore,
    riskScore,
    dataConfidence,
    forwardScore: input.forwardScore ?? null,
    deterioration: input.deterioration ?? null,
    hardFail: input.hasRestatement
      ? { active: true, reason: "Filed a restatement (8-K item 4.02) — the company stated its prior financial statements should not be relied on, so every metric derived from them is unreliable." }
      : input.goingConcernHits > 0
      ? { active: true, reason: '"Going concern" language in recent SEC filings — the most serious solvency warning a company can disclose.' }
      : null,
  })

  return {
    qualityScore,
    grade: gradeFor(qualityScore),
    strengthTier: tierFor(qualityScore),
    actionSignal: action.signal,
    actionRationale: action.rationale,
    riskScore,
    riskFlags,
    dataCompletenessPct,
    dataConfidence,
    earlyWarning,
    qualityReasons: reasons.length > 0 ? reasons : ["No standout strengths or warnings — a middling profile across the board."],
    peRatio,
  }
}
