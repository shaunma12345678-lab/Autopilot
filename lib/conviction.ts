// Conviction tiering — the "only the best qualify" layer.
//
// A single composite score has a structural weakness: it AVERAGES. A company
// can reach 78/100 while quietly failing one thing that matters enormously —
// strong growth and margins can carry a score even when cash conversion is
// broken or governance is compromised. Averaging is exactly what lets a
// weakness hide.
//
// Conviction works the opposite way. It's a series of INDEPENDENT GATES, and
// an asset must clear every one. No amount of strength on other measures
// compensates for failing a gate, because the point is to find assets with no
// obvious hole rather than assets with a high average.
//
// This is deliberately hard to reach. If most of the universe qualifies, the
// tier means nothing.
export type ConvictionTier = "elite" | "high" | "standard" | "below-bar"

export interface ConvictionGate {
  name: string
  passed: boolean | null   // null = the data to judge it is missing
  detail: string
}

export interface ConvictionResult {
  tier: ConvictionTier
  gatesPassed: number
  gatesEvaluable: number
  gates: ConvictionGate[]
  summary: string
}

function gate(name: string, passed: boolean | null, detail: string): ConvictionGate {
  return { name, passed, detail }
}

export interface StockConvictionInput {
  qualityScore: number | null
  riskScore: number | null
  piotroskiScore: number | null
  altmanZone: string | null
  beneishFlag: boolean | null
  accountingQualityScore: number | null
  consistencyScore: number | null
  forwardScore: number | null
  governanceScore: number | null
  credibilityScore: number | null
  hasRestatement: boolean | null
  earlyWarning: boolean | null
  dataConfidence: string
}

export function assessStockConviction(i: StockConvictionInput): ConvictionResult {
  const gates: ConvictionGate[] = [
    gate("Financial health improving", i.piotroskiScore === null ? null : i.piotroskiScore >= 7,
      `Piotroski F-Score ${i.piotroskiScore ?? "—"}/9 — needs 7+`),

    gate("Not in distress", i.altmanZone === null ? null : i.altmanZone !== "distress",
      `Altman zone: ${i.altmanZone ?? "—"}`),

    gate("Clean earnings profile", i.beneishFlag === null ? null : i.beneishFlag === false,
      i.beneishFlag ? "Beneish M-Score resembles manipulator financials" : "No manipulation profile"),

    gate("Profit converts to cash", i.accountingQualityScore === null ? null : i.accountingQualityScore >= 65,
      `Accounting quality ${i.accountingQualityScore ?? "—"}/100 — needs 65+`),

    gate("Durable across the cycle", i.consistencyScore === null ? null : i.consistencyScore >= 65,
      `Multi-year consistency ${i.consistencyScore ?? "—"}/100 — needs 65+`),

    gate("Forward indicators intact", i.forwardScore === null ? null : i.forwardScore >= 45,
      `Forward score ${i.forwardScore ?? "—"}/100 — needs 45+`),

    gate("Governance not compromised", i.governanceScore === null ? null : i.governanceScore >= 65,
      `Governance ${i.governanceScore ?? "—"}/100 — needs 65+`),

    gate("Narrative matches the numbers", i.credibilityScore === null ? null : i.credibilityScore >= 75,
      `Credibility ${i.credibilityScore ?? "—"}/100 — management's claims vs. the filings`),

    gate("No disqualifying event", i.hasRestatement === true || i.earlyWarning === true ? false : true,
      i.hasRestatement ? "Filed a restatement" : i.earlyWarning ? "Carries an early-warning flag" : "No restatement or early warning"),

    gate("Risk contained", i.riskScore === null ? null : i.riskScore <= 35,
      `Risk ${i.riskScore ?? "—"}/100 — needs 35 or below`),
  ]

  return finalize(gates, i.dataConfidence, i.qualityScore)
}

export interface CryptoConvictionInput {
  qualityScore: number | null
  riskScore: number | null
  securityScore: number | null
  isHoneypot: boolean | null
  isMintable: boolean | null
  venueCount: number | null
  liquidityGrade: string | null
  fdvToMcapRatio: number | null
  protocolRevenue30dUsd: number | null
  /** Capital locked in the protocol. Paired with revenue because some real
   *  protocols (lending, staking) hold enormous deposits while charging very
   *  little — judging those on fee income alone fails them unfairly. */
  tvlUsd?: number | null
  devActivityScore: number | null
  dataConfidence: string
}

export function assessCryptoConviction(i: CryptoConvictionInput): ConvictionResult {
  const gates: ConvictionGate[] = [
    gate("Contract not hostile", i.isHoneypot === null ? null : i.isHoneypot === false,
      i.isHoneypot ? "Honeypot detected" : "No honeypot"),

    gate("Supply not mintable at will", i.isMintable === null ? null : i.isMintable === false,
      i.isMintable ? "Owner can mint unlimited supply" : "Supply not arbitrarily mintable"),

    gate("Contract security clean", i.securityScore === null ? null : i.securityScore >= 80,
      `Security ${i.securityScore ?? "—"}/100 — needs 80+`),

    gate("Regulated listing", i.venueCount === null ? null : i.venueCount >= 2,
      `Listed on ${i.venueCount ?? 0} regulated venues — needs 2+ independent listings`),

    gate("Real tradeable liquidity", i.liquidityGrade === null ? null : ["deep", "adequate"].includes(i.liquidityGrade),
      `Liquidity grade: ${i.liquidityGrade ?? "—"}`),

    gate("Limited dilution overhang", i.fdvToMcapRatio === null ? null : i.fdvToMcapRatio <= 1.5,
      `FDV ${i.fdvToMcapRatio?.toFixed(2) ?? "—"}x market cap — needs 1.5x or below`),

    // Economic substance: fee income OR capital entrusted to the protocol.
    // Either one is evidence that something real is happening; requiring both
    // would fail sound protocols, and requiring neither is how a memecoin
    // outranks a working one.
    gate("Has real economic substance",
      (i.protocolRevenue30dUsd === null && (i.tvlUsd === null || i.tvlUsd === undefined))
        ? null
        : ((i.protocolRevenue30dUsd ?? 0) > 0 || (i.tvlUsd ?? 0) > 0),
      (i.protocolRevenue30dUsd ?? 0) > 0
        ? `$${Math.round(i.protocolRevenue30dUsd!).toLocaleString()} of protocol revenue in 30d`
        : (i.tvlUsd ?? 0) > 0
          ? `$${Math.round(i.tvlUsd!).toLocaleString()} of capital locked in the protocol`
          : "Neither protocol revenue nor locked capital"),

    gate("Actively built", i.devActivityScore === null ? null : i.devActivityScore >= 50,
      `Developer activity ${i.devActivityScore ?? "—"}/100 — needs 50+`),

    gate("Risk contained", i.riskScore === null ? null : i.riskScore <= 40,
      `Risk ${i.riskScore ?? "—"}/100 — needs 40 or below`),
  ]

  return finalize(gates, i.dataConfidence, i.qualityScore)
}

function finalize(gates: ConvictionGate[], dataConfidence: string, qualityScore: number | null): ConvictionResult {
  const evaluable = gates.filter(g => g.passed !== null)
  const passed = evaluable.filter(g => g.passed === true)
  const failed = evaluable.filter(g => g.passed === false)

  let tier: ConvictionTier

  // Thin data can never reach a conviction tier. "We couldn't check" is not
  // the same as "it passed", and treating it that way is how a weak asset
  // sneaks into the top tier on missing information.
  if (dataConfidence === "insufficient" || dataConfidence === "low" || evaluable.length < 6) {
    tier = "below-bar"
  } else if (failed.length === 0 && evaluable.length >= 8) {
    tier = "elite"
  } else if (failed.length <= 1 && (qualityScore ?? 0) >= 65) {
    tier = "high"
  } else if (failed.length <= 3) {
    tier = "standard"
  } else {
    tier = "below-bar"
  }

  const summary = tier === "elite"
    ? `Cleared all ${evaluable.length} independent quality gates with no failures.`
    : tier === "high"
    ? `Cleared ${passed.length} of ${evaluable.length} gates${failed.length ? ` — the exception: ${failed[0].name.toLowerCase()}` : ""}.`
    : tier === "standard"
    ? `Cleared ${passed.length} of ${evaluable.length} gates. Failing: ${failed.map(f => f.name.toLowerCase()).join(", ")}.`
    : evaluable.length < 6
    ? `Only ${evaluable.length} gates could be evaluated — not enough verified data to assign conviction.`
    : `Failed ${failed.length} of ${evaluable.length} gates: ${failed.slice(0, 3).map(f => f.name.toLowerCase()).join(", ")}.`

  return { tier, gatesPassed: passed.length, gatesEvaluable: evaluable.length, gates, summary }
}
