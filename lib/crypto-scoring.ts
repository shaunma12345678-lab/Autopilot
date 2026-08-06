// Proprietary crypto analysis engine — same two-axis philosophy as
// lib/stock-scoring.ts, with criteria that substitute for the financial
// statements crypto doesn't have.
//
// The substitutions, and why each one:
//  - Protocol revenue stands in for earnings/dividends (real fee income).
//  - Orderbook depth stands in for solvency risk (can you actually exit?).
//  - Unlock schedules + FDV/mcap stand in for share dilution.
//  - Contract security stands in for governance/fraud risk — and unlike the
//    others, it can HARD-CAP the score, because a honeypot or mintable supply
//    makes every other metric irrelevant.
import type { CoinMarketData } from "./coingecko-client"
import type { DevActivity } from "./github-activity"
import type { UpcomingUnlock } from "./defillama-client"
import type { TokenSecurity } from "./token-security"
import type { DepthResult } from "./orderbook-depth"
import { deriveActionSignal, type ActionSignal } from "./action-signal"

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x))
}

export interface CryptoScoreInput {
  market: CoinMarketData
  protocolRevenue30dUsd: number | null
  devActivity: DevActivity | null
  nextUnlock: UpcomingUnlock | null
  security: TokenSecurity | null
  depth: DepthResult | null
  volatility30dPct: number | null
  maxDrawdown1yPct: number | null
  btcCorrelation: number | null
  deterioration?: { shouldSell: boolean; reasons: string[] } | null
}

export type StrengthTier = "strong" | "mixed" | "weak"

export interface CryptoScoreResult {
  qualityScore: number | null
  grade: "A" | "B" | "C" | "D" | "F" | null
  strengthTier: StrengthTier | null
  riskScore: number | null
  riskFlags: string[]
  dataCompletenessPct: number
  dataConfidence: "insufficient" | "low" | "medium" | "high"
  qualityReasons: string[]
  liquidityPct: number | null
  fdvToMcapRatio: number | null
  actionSignal: ActionSignal | null
  actionRationale: string
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

export function scoreCrypto(input: CryptoScoreInput): CryptoScoreResult {
  const { market, protocolRevenue30dUsd, devActivity, nextUnlock, security, depth } = input

  const liquidityPct = market.volume24hUsd !== null && market.marketCapUsd && market.marketCapUsd > 0
    ? (market.volume24hUsd / market.marketCapUsd) * 100 : null

  const fdvToMcapRatio = market.fdvUsd !== null && market.marketCapUsd && market.marketCapUsd > 0
    ? market.fdvUsd / market.marketCapUsd : null

  // ── Data gate on core market fields ───────────────────────────────────────
  const coreValues: Array<{ label: string; v: number | null }> = [
    { label: "Liquidity depth", v: liquidityPct },
    { label: "7-day price history", v: market.priceChange7dPct },
    { label: "Market cap rank", v: market.marketCapRank },
  ]
  const corePresent = coreValues.filter(x => x.v !== null)
  const dataCompletenessPct = Math.round((corePresent.length / coreValues.length) * 100)
  const missingLabels = coreValues.filter(x => x.v === null).map(x => x.label)

  if (dataCompletenessPct < 40) {
    return {
      qualityScore: null, grade: null, strengthTier: null, riskScore: null, riskFlags: [],
      dataCompletenessPct, dataConfidence: "insufficient",
      qualityReasons: [`Not enough market history to analyze reliably. Missing: ${missingLabels.join(", ")}.`],
      liquidityPct, fdvToMcapRatio,
      actionSignal: null,
      actionRationale: "Not enough reliable market data to form a view — no signal is shown rather than guessing.",
    }
  }

  // ── Opportunity axis ──────────────────────────────────────────────────────
  type Scored = { label: string; weight: number; points: number }
  const scored: Scored[] = []

  if (liquidityPct !== null) scored.push({ label: "Liquidity depth", weight: 12, points: clamp(liquidityPct * 10, 0, 100) })
  if (market.marketCapRank !== null) scored.push({ label: "Market cap rank", weight: 5, points: clamp(100 - market.marketCapRank / 20, 0, 100) })
  if (market.priceChange7dPct !== null) scored.push({ label: "7-day momentum", weight: 5, points: clamp(50 + market.priceChange7dPct, 0, 100) })

  // Protocol revenue yield — the only genuine fundamental in crypto.
  const revenueYieldPct = protocolRevenue30dUsd !== null && market.marketCapUsd && market.marketCapUsd > 0
    ? ((protocolRevenue30dUsd * 12) / market.marketCapUsd) * 100 : null
  if (revenueYieldPct !== null) scored.push({ label: "Protocol revenue yield", weight: 14, points: clamp(revenueYieldPct * 20, 0, 100) })

  // Supply already circulating — low means heavy future dilution ahead.
  const circulatingSupplyPct = market.maxSupply && market.maxSupply > 0 && market.circulatingSupply
    ? (market.circulatingSupply / market.maxSupply) * 100 : null
  if (circulatingSupplyPct !== null) scored.push({ label: "Supply already circulating", weight: 7, points: clamp(circulatingSupplyPct, 0, 100) })

  // FDV/mcap: 1.0 means fully circulating; 3x+ means most of the supply is
  // still to come. Free to compute and one of the best quick dilution tells.
  if (fdvToMcapRatio !== null) {
    scored.push({ label: "Dilution overhang (FDV vs. market cap)", weight: 9, points: clamp(100 - (fdvToMcapRatio - 1) * 45, 0, 100) })
  }

  if (devActivity !== null) scored.push({ label: "Developer activity", weight: 9, points: clamp(devActivity.devActivityScore, 0, 100) })

  if (depth !== null) {
    // $1M+ of depth within 2% of mid is genuinely deep for a mid-cap.
    scored.push({ label: "Real orderbook depth", weight: 11, points: clamp((depth.totalDepth2PctUsd / 1_000_000) * 100, 0, 100) })
  }

  if (security?.applicable && security.securityScore !== null) {
    scored.push({ label: "Contract security", weight: 15, points: security.securityScore })
  }

  let unlockPoints: number | null = null
  if (nextUnlock !== null) {
    const daysUntil = (new Date(nextUnlock.date).getTime() - Date.now()) / 86400000
    if (daysUntil >= 0) {
      const proximityRisk = clamp(1 - daysUntil / 60, 0, 1)
      const sizeRisk = clamp(nextUnlock.pctOfSupply / 10, 0, 1)
      unlockPoints = clamp(100 - proximityRisk * sizeRisk * 100, 0, 100)
      scored.push({ label: "Unlock/dilution timing", weight: 8, points: unlockPoints })
    }
  }

  const totalWeight = scored.reduce((s, x) => s + x.weight, 0)
  let qualityScore = totalWeight > 0
    ? Math.round(scored.reduce((s, x) => s + x.points * x.weight, 0) / totalWeight)
    : 50

  // ── Risk axis ─────────────────────────────────────────────────────────────
  const riskFlags: string[] = []
  let riskScore = 30 // crypto baseline is meaningfully higher than equities

  // Contract security dominates. A honeypot is a total-loss condition, so it
  // hard-caps quality regardless of every other metric.
  if (security?.applicable) {
    for (const flag of security.flags) riskFlags.push(flag)
    if (security.isHoneypot === true) {
      riskScore = 100
      qualityScore = Math.min(qualityScore, 5)
    } else if (security.securityScore !== null) {
      riskScore += Math.round((100 - security.securityScore) * 0.45)
      if (security.securityScore < 50) qualityScore = Math.min(qualityScore, 40)
      if (security.isMintable === true) qualityScore = Math.min(qualityScore, 55)
      if (security.lpLocked === false) qualityScore = Math.min(qualityScore, 50)
    }
  }

  if (liquidityPct !== null && liquidityPct < 0.3) {
    riskScore += 15
    qualityScore = Math.min(qualityScore, 45)
    riskFlags.push(`⚠ Very thin liquidity — only ${liquidityPct.toFixed(2)}% of market cap traded in 24h. Exiting a position could move the price against you.`)
  }

  if (depth !== null && depth.totalDepth2PctUsd < 50_000) {
    riskScore += 12
    riskFlags.push(`⚠ Only ~$${Math.round(depth.totalDepth2PctUsd).toLocaleString()} of resting orders within 2% of mid price — the book is shallow.`)
  }

  if (fdvToMcapRatio !== null && fdvToMcapRatio > 3) {
    riskScore += 12
    riskFlags.push(`⚠ Fully diluted valuation is ${fdvToMcapRatio.toFixed(1)}x the current market cap — most of the supply has yet to enter circulation.`)
  }

  if (nextUnlock !== null) {
    const daysUntil = (new Date(nextUnlock.date).getTime() - Date.now()) / 86400000
    if (daysUntil >= 0 && daysUntil <= 14 && nextUnlock.pctOfSupply >= 3) {
      riskScore += 15
      qualityScore = Math.min(qualityScore, 45)
      riskFlags.push(`⚠ An unlock releasing ${nextUnlock.pctOfSupply.toFixed(1)}% of supply is scheduled in ${Math.round(daysUntil)} days — a known, dated dump-risk window.`)
    }
  }

  if (devActivity !== null && devActivity.commitsLast12Weeks === 0) {
    riskScore += 12
    qualityScore = Math.min(qualityScore, 50)
    riskFlags.push("⚠ No commits to the project's repository in 12 weeks — possible abandonment.")
  }

  if (input.volatility30dPct !== null && input.volatility30dPct > 120) {
    riskScore += 10
    riskFlags.push(`⚠ Annualized volatility ${input.volatility30dPct.toFixed(0)}% — extreme even by crypto standards.`)
  }

  if (input.maxDrawdown1yPct !== null && input.maxDrawdown1yPct < -80) {
    riskScore += 8
    riskFlags.push(`⚠ Fell ${Math.abs(input.maxDrawdown1yPct).toFixed(0)}% from its 1-year peak at the worst point.`)
  }

  if (market.marketCapRank !== null && market.marketCapRank > 500) {
    riskScore += 8
    riskFlags.push(`⚠ Ranked #${market.marketCapRank} by market cap — small caps carry materially higher failure and liquidity risk.`)
  }

  riskScore = clamp(riskScore, 0, 100)

  // ── Plain-English reasons ─────────────────────────────────────────────────
  const reasons: string[] = []
  if (security?.applicable && security.securityScore !== null) {
    reasons.push(security.securityScore >= 85
      ? `✓ Contract security checks look clean (${security.securityScore}/100).`
      : `Contract security score ${security.securityScore}/100 — see risk flags.`)
  } else if (security && !security.applicable) {
    reasons.push(security.note)
  }
  if (revenueYieldPct !== null) {
    reasons.push(revenueYieldPct > 3
      ? `✓ Generates real protocol revenue — roughly ${revenueYieldPct.toFixed(1)}% annualized against market cap.`
      : `Protocol revenue is modest relative to valuation (~${revenueYieldPct.toFixed(1)}% annualized).`)
  }
  if (fdvToMcapRatio !== null && fdvToMcapRatio <= 1.15) {
    reasons.push("✓ Supply is essentially fully circulating — little dilution overhang.")
  }
  if (input.btcCorrelation !== null) {
    reasons.push(Math.abs(input.btcCorrelation) > 0.85
      ? `Moves almost in lockstep with Bitcoin (correlation ${input.btcCorrelation.toFixed(2)}) — limited diversification value.`
      : `Correlation to Bitcoin is ${input.btcCorrelation.toFixed(2)}.`)
  }

  const ranked = [...scored].sort((a, b) => b.points - a.points)
  for (const top of ranked.slice(0, 2)) {
    if (top.points >= 75 && !reasons.some(r => r.includes(top.label))) reasons.push(`✓ ${top.label} is strong.`)
  }
  for (const bottom of ranked.slice(-2)) {
    if (bottom.points <= 30 && !reasons.some(r => r.includes(bottom.label))) reasons.push(`⚠ ${bottom.label} is weak.`)
  }

  qualityScore = clamp(qualityScore, 0, 100)
  const dataConfidence = dataCompletenessPct >= 90 ? "high" : dataCompletenessPct >= 70 ? "medium" : "low"

  // A honeypot contract is a total-loss condition — it disqualifies outright,
  // no matter how attractive the market data looks.
  const action = deriveActionSignal({
    qualityScore,
    riskScore,
    dataConfidence,
    forwardScore: null,
    deterioration: input.deterioration ?? null,
    hardFail: security?.isHoneypot === true
      ? { active: true, reason: "Honeypot contract detected — the code appears to prevent selling. This is a total-loss risk." }
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
    qualityReasons: reasons.length > 0 ? reasons : ["No standout strengths or warnings — a middling profile across the board."],
    liquidityPct,
    fdvToMcapRatio,
  }
}
