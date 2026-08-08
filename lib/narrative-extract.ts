// Deterministic narrative extraction — management's claims, without a model.
//
// WHY THIS EXISTS. Contradiction detection is the highest-value check in this
// system: it compares what management SAYS against what the audited numbers
// SHOW, and the divergence is more reliable than either source alone. But it
// takes a NarrativeRead and returns empty when that is null — so removing the
// LLM silently disabled it. The check itself was always deterministic; only the
// claim extraction feeding it was not.
//
// THE INSIGHT THAT MAKES RULES WORK HERE. We are not summarising the filing or
// judging it. We only need to answer: did management assert X? Corporate MD&A
// language is unusually constrained, because it is written by lawyers to be
// defensible — companies say "we delivered strong cash generation" and
// "disciplined capital allocation" using a narrow, repetitive vocabulary. That
// is a bounded matching problem, exactly like the news classifier.
//
// A model would write more fluent prose. It would not be more accurate at
// deciding whether the phrase "record revenue" appears in a document, and it
// cannot 429, exhaust a quota, or invert the meaning of a metric it was handed.
//
// WHAT THIS DELIBERATELY DOES NOT DO. It does not produce a readable summary,
// because a summary is presentation and the contradiction check never used one.
// Nothing downstream degrades from its absence.
//
// ── VERIFIED LIMITATION: THE 10-K IS THE WRONG SOURCE ────────────────────────
//
// Tested against Coca-Cola's and Intel's most recent 10-K MD&A. Result: zero
// matches for promotional claim language. Coca-Cola's MD&A opens "An analysis of
// our consolidated results of operations for 2024 and 2023 and year-to-year
// comparisons..." — dry, factual, and legally hedged. Nine headwind sentences
// matched; almost no growth, cash-generation, margin or capital-allocation
// claims did.
//
// That is not a gap in these patterns. 10-K MD&A is drafted to be defensible in
// litigation, so it does not say "record revenue" or "strong momentum". Those
// phrases live in EARNINGS PRESS RELEASES, filed as 8-K exhibit EX-99.1, which
// are marketing documents and are where management actually makes assertions.
//
// This finding also casts doubt on the LLM path it replaces: given the same
// source, a model asked for "what management claims" would have had to
// paraphrase or infer claims not literally present — which is worse than
// extracting none, because contradiction-check would then test the numbers
// against a claim the company never made.
//
// CORRECT NEXT STEP: point this at EX-99.1 earnings releases rather than the
// 10-K. The extraction logic is unchanged; only the document is wrong. Until
// then this returns null on most filers and the pipeline falls through, which
// is the honest behaviour — an empty NarrativeRead would make every omission
// check fire spuriously.
import type { NarrativeRead } from "./edgar-narrative"

// Claim categories, each with the phrasing filers actually use. Patterns are
// deliberately specific: matching the bare word "growth" would fire on every
// filing ever written, including ones disclosing its absence.
const CLAIM_PATTERNS: Array<{ bucket: keyof Pick<NarrativeRead, "strategy" | "growthDrivers" | "headwinds" | "capitalPlans">; re: RegExp }> = [
  // Growth and momentum claims — what contradiction-check tests against actual
  // revenue acceleration.
  { bucket: "growthDrivers", re: /\b(record (revenue|results|quarter|year|sales)|strong (growth|demand|momentum|performance|results)|accelerat\w+ (growth|demand|adoption)|robust demand|healthy demand|demand for our \w+ (remains|continues))\b/gi },
  { bucket: "growthDrivers", re: /\b(market share gains?|expanding our (market|footprint|presence)|customer growth|new customer wins)\b/gi },

  // Cash-generation claims — tested against cash conversion.
  { bucket: "growthDrivers", re: /\b(strong (cash flow|cash generation|free cash flow)|robust cash|cash generation (remains|continues|was) strong|generated \$?[\d.,]+ (billion|million) (of|in) (free )?cash flow)\b/gi },

  // Margin and efficiency claims — tested against actual margin direction.
  { bucket: "strategy", re: /\b(margin expansion|improving margins?|operating leverage|cost discipline|efficiency (gains?|initiatives?|programs?)|productivity (gains?|improvements?))\b/gi },

  // Capital allocation claims — tested against buyback timing.
  { bucket: "capitalPlans", re: /\b(disciplined capital allocation|returned \$?[\d.,]+ (billion|million) to shareholders|share repurchase program|repurchased? \$?[\d.,]+ (billion|million)|increased our dividend|dividend increase)\b/gi },
  { bucket: "capitalPlans", re: /\b(capital expenditures? (of|will|are expected)|investing in (capacity|manufacturing|infrastructure)|acquisition of \w+)\b/gi },

  // Strategy statements.
  { bucket: "strategy", re: /\b(our strategy (is|remains|focuses)|we (are|remain) focused on|strategic priorit(y|ies)|long-term (growth )?strategy|transformation (plan|program|initiative))\b/gi },

  // Headwinds management itself acknowledges. Their PRESENCE matters: a company
  // that names a pressure is behaving differently from one that omits it, and
  // the omission checks depend on knowing which was which.
  { bucket: "headwinds", re: /\b(headwinds?|macroeconomic (uncertainty|pressure|conditions)|inflationary pressure|supply chain (disruption|constraints?)|foreign (currency|exchange) headwind|softness in|weaker demand|declined (compared|versus)|decrease[ds]? (primarily )?due to)\b/gi },
  { bucket: "headwinds", re: /\b(competitive pressure|pricing pressure|margin compression|elevated (costs?|expenses)|restructuring (charge|plan|program)|impairment charge)\b/gi },
]

// Tone is decided by counting positive against negative claim language, not by
// interpreting it. Filings are written to sound constructive, so the threshold
// for "constructive" is a clear majority rather than a bare one.
const POSITIVE = /\b(strong|record|robust|healthy|improv\w+|expand\w+|accelerat\w+|growth|momentum|confident|well-positioned|resilient)\b/gi
const NEGATIVE = /\b(declin\w+|decreas\w+|weak\w+|soft\w+|headwind|pressure|challeng\w+|impairment|restructur\w+|uncertain\w+|adverse\w*)\b/gi

// Sentences are the unit: a claim needs enough context to be quotable back to
// the user, and a bare phrase match is not evidence of anything.
function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map(s => s.trim())
    .filter(s => s.length > 60 && s.length < 600)
}

function dedupe(items: string[], cap: number): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const s of items) {
    // Filings repeat the same sentence across sections; key on a normalised
    // prefix so near-duplicates collapse.
    const key = s.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 80)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(s.length > 320 ? `${s.slice(0, 317)}...` : s)
    if (out.length >= cap) break
  }
  return out
}

export function extractNarrative(
  mdna: string | null,
  business: string | null,
  sourceUrl: string,
  filingDate: string
): NarrativeRead | null {
  const text = [mdna, business].filter(Boolean).join("\n\n")
  // Below this there is not enough prose for absence of a claim to mean
  // anything, and the omission checks would fire on every company.
  if (text.length < 2000) return null

  const sents = sentences(text)
  if (sents.length < 10) return null

  const buckets: Record<string, string[]> = {
    strategy: [], growthDrivers: [], headwinds: [], capitalPlans: [],
  }

  for (const s of sents) {
    for (const { bucket, re } of CLAIM_PATTERNS) {
      re.lastIndex = 0
      if (re.test(s)) {
        buckets[bucket].push(s)
        break   // one bucket per sentence; the first match is the strongest
      }
    }
  }

  const pos = (text.match(POSITIVE) ?? []).length
  const neg = (text.match(NEGATIVE) ?? []).length
  const total = pos + neg

  let outlookTone: NarrativeRead["outlookTone"] = "unclear"
  if (total >= 20) {
    const positiveShare = pos / total
    outlookTone =
      positiveShare >= 0.65 ? "constructive"
      : positiveShare <= 0.40 ? "cautious"
      : "mixed"
  }

  // Tone evidence must be a real sentence from the filing, not a computed
  // label — contradiction-check quotes it back to the user, and a quote that
  // cannot be found in the source destroys trust in everything around it.
  const toneEvidence =
    (outlookTone === "cautious" ? buckets.headwinds[0] : buckets.growthDrivers[0]) ??
    buckets.strategy[0] ?? ""

  const claimCount =
    buckets.strategy.length + buckets.growthDrivers.length +
    buckets.headwinds.length + buckets.capitalPlans.length

  // No claims found means the extraction failed, not that management made no
  // assertions. Returning an empty NarrativeRead would let every omission check
  // fire spuriously.
  if (claimCount < 3) return null

  return {
    strategy: dedupe(buckets.strategy, 5),
    growthDrivers: dedupe(buckets.growthDrivers, 5),
    headwinds: dedupe(buckets.headwinds, 5),
    capitalPlans: dedupe(buckets.capitalPlans, 5),
    outlookTone,
    toneEvidence,
    // Deliberately empty: a summary is presentation, and nothing downstream
    // reads it. Fabricating one from templates would be worse than its absence.
    summary: "",
    sourceUrl,
    filingDate,
  }
}
