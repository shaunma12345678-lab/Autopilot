// The bear case — a pass whose only job is to attack the investment.
//
// WHY A SEPARATE PASS RATHER THAN A BETTER PROMPT. A single model asked to
// "analyze this company" writes a balanced-sounding summary and then, having
// listed some positives, treats the negatives as caveats to it. The framing is
// set by whatever it said first. Giving a second pass one adversarial job —
// find what kills this — produces objections the first pass rationalizes away,
// because it never has to reconcile them with a thesis it already committed to.
//
// This is the one genuinely good idea in the multi-agent trading pipelines that
// circulate: Analyst -> Risk Manager -> Synthesizer. It is worth adopting. What
// is NOT worth adopting from them is what they feed it — 3 months of price
// history, moving-average crossovers, and analyst consensus P/E scraped from an
// unofficial endpoint. This runs the same adversarial structure against audited
// XBRL, the company's own filings, and dated news instead.
//
// WHAT KEEPS IT HONEST. The model is given the NUMBERS, not just the narrative,
// and is told it may only argue from what it is shown. That matters because the
// failure mode of an LLM bear case is inventing plausible-sounding risks that
// happen not to be true of this company. Every objection has to point at a
// figure or a disclosure in the input.
import { runAgent } from "./claude"
import type { NormalizedFundamentals } from "./edgar-normalize"

export interface BearCase {
  thesisRisks: string[]
  whatWouldHaveToGoRight: string[]
  killShot: string | null
  bearConviction: "weak" | "moderate" | "strong"
  summary: string
}

const BEAR_SYSTEM = `You are a short-seller building the case AGAINST owning this stock. You are not balanced and you are not trying to be fair. Your job is to find what breaks it.

HARD RULES — violating these makes your output worthless:
- Argue ONLY from the figures and disclosures you are given. Never invent a risk that is not evidenced in the input. A plausible-sounding risk that is not true of THIS company is the single worst thing you can produce.
- Cite the specific number or disclosure behind every objection.
- If the data genuinely does not support a strong bear case, say so and set bearConviction to "weak". A forced bear case on a sound company is noise, and pretending otherwise destroys the signal of every real warning.
- Never reference outside knowledge, price targets, or market sentiment. You have the filings and the numbers, nothing else.
- Read every metric in the direction the input states. Do not assume a high number is bad or a low number is good; the input tells you which way each one points, and inverting it produces a confidently wrong objection.

WHAT COUNTS AS A KILL SHOT: a single fact that alone makes the investment unattractive regardless of everything else — insolvency risk, an accounting integrity problem, a debt wall that cannot be covered, structurally collapsing margins, or a disclosed regulatory action that threatens the core business. Most companies do not have one. Return null when there is none.

Return ONLY valid JSON, no markdown fences.`

export async function buildBearCase(input: {
  symbol: string
  name: string
  fundamentals: NormalizedFundamentals
  qualityScore: number | null
  riskScore: number | null
  riskFlags: string[]
  piotroskiScore: number | null
  altmanZone: string | null
  beneishFlag: boolean | null
  valuationPercentile: number | null
  fcfYieldPct: number | null
  newsConcerns: string[]
  newRisks: string[]
  contradictions: string[]
}): Promise<BearCase | null> {
  const f = input.fundamentals
  const n = (v: number | null | undefined, unit = "") =>
    v === null || v === undefined ? "not disclosed" : `${v.toFixed(1)}${unit}`

  const dossier = `COMPANY: ${input.name} (${input.symbol})

AUDITED FUNDAMENTALS (from SEC XBRL):
- Revenue growth YoY: ${n(f.revenueGrowthYoyPct, "%")}
- Gross margin: ${n(f.grossMarginPct, "%")}
- Operating margin: ${n(f.operatingMarginPct, "%")}
- Net margin: ${n(f.netMarginPct, "%")}
- Return on equity: ${n(f.roePct, "%")}
- Debt to equity: ${n(f.debtToEquity)}
- Current ratio: ${n(f.currentRatio)}
- Interest coverage: ${n(f.interestCoveragePct)}x
- Free cash flow: ${f.freeCashFlowTtm === null ? "not disclosed" : `$${(f.freeCashFlowTtm / 1e9).toFixed(2)}B`}
- Accruals ratio: ${n(f.accrualsRatioPct, "%")}

COMPOSITE SCORES:
- Piotroski F-Score: ${input.piotroskiScore ?? "n/a"}/9
- Altman zone: ${input.altmanZone ?? "n/a"}
- Beneish manipulation flag: ${input.beneishFlag ? "TRIGGERED" : "not triggered"}
- Internal quality: ${input.qualityScore ?? "n/a"}/100, risk: ${input.riskScore ?? "n/a"}/100
- Valuation vs its OWN history: ${input.valuationPercentile === null
    ? "n/a"
    : `${input.valuationPercentile.toFixed(0)}th percentile — it has traded CHEAPER than this ${(100 - input.valuationPercentile).toFixed(0)}% of the time, so a HIGH number means CHEAP and a LOW number means EXPENSIVE`}
- FCF yield: ${n(input.fcfYieldPct, "%")}

RISK FLAGS RAISED BY THE FILINGS:
${input.riskFlags.length ? input.riskFlags.map(r => `- ${r}`).join("\n") : "- none"}

NEWLY DISCLOSED RISKS THIS YEAR (vs last 10-K):
${input.newRisks.length ? input.newRisks.map(r => `- ${r}`).join("\n") : "- none"}

WHERE MANAGEMENT'S NARRATIVE CONTRADICTS THE NUMBERS:
${input.contradictions.length ? input.contradictions.map(r => `- ${r}`).join("\n") : "- none found"}

MATERIAL NEWS CONCERNS:
${input.newsConcerns.length ? input.newsConcerns.map(r => `- ${r}`).join("\n") : "- none"}`

  try {
    const raw = await runAgent(
      BEAR_SYSTEM,
      `${dossier}

Return JSON:
{
  "thesisRisks": ["max 5, each citing a specific number or disclosure above"],
  "whatWouldHaveToGoRight": ["max 3 assumptions the bull case silently depends on"],
  "killShot": "the single fact that alone breaks this, or null",
  "bearConviction": "weak" | "moderate" | "strong",
  "summary": "two sentences stating the strongest case against owning this"
}`,
      { maxTokens: 1100, jsonMode: true }
    )
    const p = typeof raw === "string" ? JSON.parse(raw.replace(/```json|```/g, "").trim()) : raw
    const strs = (v: unknown, max: number): string[] =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, max) : []

    return {
      thesisRisks: strs(p?.thesisRisks, 5),
      whatWouldHaveToGoRight: strs(p?.whatWouldHaveToGoRight, 3),
      killShot: typeof p?.killShot === "string" && p.killShot.trim() ? p.killShot : null,
      bearConviction: ["weak", "moderate", "strong"].includes(p?.bearConviction) ? p.bearConviction : "weak",
      summary: typeof p?.summary === "string" ? p.summary : "",
    }
  } catch {
    return null
  }
}
