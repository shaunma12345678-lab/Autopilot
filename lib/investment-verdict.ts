// The investment verdict — synthesizes everything else in this system into
// the one thing a user actually wants when they click a company: is this
// well-run, and is it a good lead right now.
//
// WHY A SEPARATE SYNTHESIS PASS. Every fact that goes into this already
// exists as a scattered, individually-computed signal — governance,
// capital allocation, contradiction detection, litigation, conviction gates,
// the bear case. Nothing weaves them into a single answer. A user
// shouldn't have to read nine collapsible sections and do the synthesis
// themselves; that's the one job a model is actually good at, PROVIDED it is
// constrained the same way every other AI pass in this system is: argue only
// from what it's given, cite the specific fact, never invent.
//
// THE ONE RULE THAT MATTERS MOST: THIS MUST NOT CONTRADICT THE BACKTEST.
// STOCK_CRYPTO_ANALYSIS_IMPLEMENTATION.md's broad-universe backtest found
// quality alone has ~zero forward-return edge; valuation vs. a company's own
// history is the one axis with measured signal. A synthesis pass that reverts
// to "strong fundamentals = good lead" would quietly relitigate a finding
// this system spent real effort proving, and would mislead exactly the users
// who trust it most. So the prompt states the finding explicitly and requires
// the verdict to reason the way the evidence does: sound is necessary,
// cheap-relative-to-history is what makes it a LEAD rather than merely a good
// business.
//
// NO PRICE PREDICTION. Same hard line as everywhere else in this system —
// see AssetDetail.tsx's header comment on why there is no projected-price
// line. This synthesizes disclosed, computed facts. It does not forecast.
import { runAgent } from "./claude"

export type ManagementQuality = "strong" | "adequate" | "concerning" | "unclear"
export type LeadQuality = "strong_lead" | "worth_watching" | "not_a_lead" | "avoid"

export interface InvestmentVerdict {
  verdict: string
  managementQuality: ManagementQuality
  leadQuality: LeadQuality
  keyStrengths: string[]
  keyConcerns: string[]
  conflictsOfInterest: string[]
  confidenceCaveat: string | null
}

const VERDICT_SYSTEM = `You synthesize an equity research file for an investor into one governing verdict. You do not do new analysis — every fact you use is already computed and verified elsewhere in the system and handed to you. Your only job is synthesis.

HARD RULES:
- Argue ONLY from the facts you are given. Never invent a strength, concern, or conflict not evidenced in the input.
- This system's own backtest found quality/fundamental strength has ~zero measured forward-return edge on its own — valuation versus the company's OWN trading history is the one axis with real evidence. A sound business that is not currently cheap relative to its own history is a good BUSINESS, not necessarily a good LEAD. Reason accordingly: leadQuality must weigh the valuation evidence, not just quality.
- If ANY conflict-of-interest fact is present in the input (related-party transactions, dual-class structure, pay misaligned with per-share/ROIC outcomes, auditor independence concerns), you MUST include it in conflictsOfInterest. Never omit a disclosed conflict because other things look good — that is exactly the failure mode this exists to prevent.
- Never output a price target, a price direction, a probability of price movement, or personalized advice to buy or sell. Describe what is true and why it matters; do not instruct.
- If the falsification set shows a condition has already triggered, or the bear case has a kill shot, that is disqualifying for "strong_lead" regardless of how good everything else looks.
- If data is thin (low conviction gate coverage, no deep narrative read, no governance data), say so in confidenceCaveat rather than writing a confident-sounding verdict on incomplete evidence.

Return ONLY valid JSON, no markdown fences.`

export interface VerdictInput {
  symbol: string
  name: string
  qualityScore: number | null
  riskScore: number | null
  strengthTier: string | null
  actionSignal: string | null
  convictionTier: string | null
  convictionSummary: string | null
  valuationTier: string | null
  valuationPercentile: number | null
  piotroskiScore: number | null
  altmanZone: string | null
  beneishFlag: boolean | null
  credibilityScore: number | null
  contradictionFlags: string[]
  governanceSummary: string | null
  payAlignment: string | null
  relatedPartyTransactions: string[]
  auditorConcerns: string[]
  dualClass: boolean | null
  capitalAllocationReasons: string[]
  consistencyScore: number | null
  forwardScore: number | null
  forwardReasons: string[]
  insiderSummary: string | null
  litigationFlags: string[]
  concentrationFlags: string[]
  falsificationFragility: string | null
  falsificationSummary: string | null
  falsificationTriggered: string[]
  bearSummary: string | null
  bearKillShot: string | null
  hasRestatement: boolean
  goingConcernHits: number
}

function n(v: number | null | undefined, unit = ""): string {
  return v === null || v === undefined ? "not available" : `${v}${unit}`
}

function list(items: string[], none = "none"): string {
  return items.length ? items.map(x => `- ${x}`).join("\n") : `- ${none}`
}

export async function buildInvestmentVerdict(input: VerdictInput): Promise<InvestmentVerdict | null> {
  const dossier = `COMPANY: ${input.name} (${input.symbol})

SCORES:
- Quality: ${n(input.qualityScore, "/100")} (${input.strengthTier ?? "n/a"})
- Risk: ${n(input.riskScore, "/100")}
- Action signal (two-axis matrix, not a recommendation): ${input.actionSignal ?? "none"}
- Conviction tier (independent gates, must ALL pass — not an average): ${input.convictionTier ?? "n/a"} — ${input.convictionSummary ?? "no detail"}
- Piotroski F-Score: ${n(input.piotroskiScore, "/9")}
- Altman zone: ${input.altmanZone ?? "n/a"}
- Beneish manipulation flag: ${input.beneishFlag ? "TRIGGERED" : "not triggered"}

VALUATION (the one axis this system's backtest found has real forward-return signal):
- Tier: ${input.valuationTier ?? "unknown"}
- Own-history percentile: ${input.valuationPercentile === null ? "n/a" : `${input.valuationPercentile.toFixed(0)}th — higher means cheaper versus its own past`}

NARRATIVE CREDIBILITY (management's claims vs. the audited numbers):
- Credibility score: ${n(input.credibilityScore, "/100")}
- Contradictions found:
${list(input.contradictionFlags)}

GOVERNANCE AND CONFLICTS OF INTEREST (from the DEF 14A proxy):
- Summary: ${input.governanceSummary ?? "not yet read"}
- Pay alignment: ${input.payAlignment ?? "unclear"}
- Related-party transactions:
${list(input.relatedPartyTransactions)}
- Auditor concerns:
${list(input.auditorConcerns)}
- Dual-class structure: ${input.dualClass === null ? "unknown" : input.dualClass ? "YES" : "no"}

CAPITAL ALLOCATION TRACK RECORD:
${list(input.capitalAllocationReasons)}

DURABILITY:
- Multi-year consistency: ${n(input.consistencyScore, "/100")}
- Forward score: ${n(input.forwardScore, "/100")}
- Forward reasons:
${list(input.forwardReasons)}

INSIDER ACTIVITY: ${input.insiderSummary ?? "no notable activity"}

LITIGATION EXPOSURE (federal court dockets):
${list(input.litigationFlags)}

CONCENTRATION RISK (customer/geographic, from the filing text):
${list(input.concentrationFlags)}

FALSIFICATION CONDITIONS ("what would change the thesis" — checkable, not a vague caveat):
- Fragility: ${input.falsificationFragility ?? "n/a"}
- ${input.falsificationSummary ?? "not computed"}
- Already triggered since last assessed:
${list(input.falsificationTriggered)}

BEAR CASE (adversarial pass, argues only from the same facts above):
- Summary: ${input.bearSummary ?? "not run"}
- Kill shot: ${input.bearKillShot ?? "none identified"}

DISQUALIFYING FACTS: restatement filed = ${input.hasRestatement}, going-concern hits = ${input.goingConcernHits}`

  try {
    const raw = await runAgent(
      VERDICT_SYSTEM,
      `${dossier}

Return JSON:
{
  "verdict": "3-5 sentences: is this well-run, and is it a good lead right now — synthesize, don't just list",
  "managementQuality": "strong | adequate | concerning | unclear",
  "leadQuality": "strong_lead | worth_watching | not_a_lead | avoid",
  "keyStrengths": ["max 4, each citing a specific fact above"],
  "keyConcerns": ["max 4, each citing a specific fact above"],
  "conflictsOfInterest": ["every disclosed conflict from the governance section above — empty array ONLY if none were disclosed"],
  "confidenceCaveat": "one sentence if evidence is thin (e.g. no governance data, no deep narrative read), otherwise null"
}`,
      { maxTokens: 1400, jsonMode: true }
    )

    const p = typeof raw === "string" ? JSON.parse(raw.replace(/```json|```/g, "").trim()) : raw
    const strs = (v: unknown, max: number): string[] =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, max) : []

    const managementQuality: ManagementQuality =
      ["strong", "adequate", "concerning"].includes(p?.managementQuality) ? p.managementQuality : "unclear"
    const leadQuality: LeadQuality =
      ["strong_lead", "worth_watching", "not_a_lead", "avoid"].includes(p?.leadQuality) ? p.leadQuality : "worth_watching"

    return {
      verdict: typeof p?.verdict === "string" ? p.verdict : "",
      managementQuality,
      leadQuality,
      keyStrengths: strs(p?.keyStrengths, 4),
      keyConcerns: strs(p?.keyConcerns, 4),
      conflictsOfInterest: strs(p?.conflictsOfInterest, 6),
      confidenceCaveat: typeof p?.confidenceCaveat === "string" && p.confidenceCaveat.trim() ? p.confidenceCaveat : null,
    }
  } catch {
    return null
  }
}
