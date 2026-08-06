// Year-over-year risk-factor diffing — what a company NEWLY admits to.
//
// This is one of the highest-value things a professional analyst does with a
// 10-K and one almost no retail tool attempts. Item 1A is largely boilerplate
// that carries forward unchanged year to year — which is exactly what makes
// the CHANGES informative. A company does not add a new risk factor casually;
// its lawyers add one when something has become a real enough exposure that
// failing to disclose it creates liability.
//
// So the signal isn't the risk section, which is long and mostly noise. The
// signal is the DIFF. "We may be unable to renew our largest customer
// contract" appearing for the first time this year is a disclosure the company
// was compelled to make, and it usually precedes the problem showing up in the
// numbers by several quarters.
//
// Approach: fetch this year's and last year's Item 1A, split both into
// individual risk paragraphs, and identify paragraphs present now that have no
// close counterpart a year ago. The AI is used only to judge materiality of
// the already-identified new items — it never decides what counts as "new",
// because that's a deterministic text comparison and shouldn't depend on a
// model's judgment.
import { fetchFilingText } from "./edgar-narrative"
import { runAgent } from "./claude"

export interface RiskFactorDiff {
  newRiskCount: number
  newRisks: string[]
  materialNewRisks: string[]
  removedRiskCount: number
  summary: string
  riskPenalty: number
  currentFilingDate: string | null
  priorFilingDate: string | null
}

const EMPTY: RiskFactorDiff = {
  newRiskCount: 0, newRisks: [], materialNewRisks: [], removedRiskCount: 0,
  summary: "", riskPenalty: 0, currentFilingDate: null, priorFilingDate: null,
}

// WHY THIS DOESN'T EXTRACT "Item 1A" BY HEADING:
//
// Heading-anchored extraction is unreliable in both directions, verified
// against real filings. Intel's 10-K never uses the string "Item 1A." in its
// body at all — it uses a thematic layout, and the only match in the whole
// 575k-character document is the cross-reference index at the very end.
// Pfizer's has 29 matches with its only "Item 1B" sitting in the table of
// contents, so a start/end span runs off into the financial statements.
//
// Risk-factor prose, however, is recognizable by its own language regardless of
// how the filer formats headings: dense modal hedging ("could", "may",
// "adversely affect", "no assurance"). Selecting on that is format-independent
// and, critically, is applied identically to both years — so the comparison
// stays apples-to-apples even if it catches some forward-looking MD&A too.
const RISK_LANGUAGE = /\b(could|may|might|risk|adversely|no assurance|unable to|fail(?:ure)? to|if we|uncertain|materially|harm)\b/gi

const MIN_RISK_MARKERS = 3
// Financial-statement rows and tables survive HTML stripping as digit soup.
// Real disclosure prose is overwhelmingly words.
const MAX_DIGIT_RATIO = 0.12

function isRiskProse(p: string): boolean {
  const markers = (p.match(RISK_LANGUAGE) ?? []).length
  if (markers < MIN_RISK_MARKERS) return false
  const digits = (p.match(/\d/g) ?? []).length
  return digits / p.length <= MAX_DIGIT_RATIO
}

// Splits a filing into paragraph-sized units and keeps only risk-disclosure
// prose. The unit of meaning is the paragraph, not the sentence.
function splitRiskParagraphs(text: string): string[] {
  return text
    .split(/(?<=\.)\s+(?=[A-Z])/)
    .map(p => p.trim())
    .filter(p => p.length > 150 && p.length < 2500)
    .filter(isRiskProse)
}

// Normalized token set, for overlap comparison. Deliberately crude — we're
// detecting "is this substantially the same paragraph as last year", not
// doing semantic similarity, and crude is more predictable here.
function tokens(s: string): Set<string> {
  return new Set(
    s.toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(w => w.length > 4)
  )
}

function overlapRatio(a: Set<string>, b: Set<string>): number {
  if (a.size === 0) return 0
  let shared = 0
  for (const t of a) if (b.has(t)) shared++
  return shared / a.size
}

// A paragraph counts as carried-forward if it shares most of its distinctive
// vocabulary with any paragraph from the prior year.
const CARRIED_FORWARD_THRESHOLD = 0.55

function findNewParagraphs(current: string[], prior: string[]): string[] {
  const priorTokens = prior.map(tokens)
  const out: string[] = []
  for (const para of current) {
    const t = tokens(para)
    const isCarriedForward = priorTokens.some(p => overlapRatio(t, p) >= CARRIED_FORWARD_THRESHOLD)
    if (!isCarriedForward) out.push(para)
  }
  return out
}

const MATERIALITY_SYSTEM = `You assess which newly-added SEC risk-factor disclosures are material to an investor.

Context: these paragraphs appear in this year's 10-K Item 1A and did NOT appear last year. A company adds a risk factor when its lawyers judge the exposure real enough that omitting it creates liability, so newly-added language is meaningful by construction.

Rules:
- Report only what the text says. Never infer, never speculate, never add outside knowledge.
- MATERIAL means it could plausibly affect the business's economics: customer concentration, litigation, regulatory action, financing or covenant risk, key-person dependence, supply disruption, technology obsolescence, going-concern pressure.
- NOT material: generic macroeconomic boilerplate, standard cybersecurity language, routine competitive framing, pandemic/geopolitical language every filer carries.
- Compress each to one specific sentence. "May lose its largest customer, which is 22% of revenue" is useful; "faces competitive risks" is not.

Return ONLY valid JSON, no markdown fences.`

export async function diffRiskFactors(
  cik: string,
  filings: Array<{ form: string; filingDate: string; accessionNumber: string; primaryDocument: string }>
): Promise<RiskFactorDiff> {
  const tenKs = filings
    .filter(f => f.form === "10-K")
    .sort((a, b) => b.filingDate.localeCompare(a.filingDate))
    .slice(0, 2)

  if (tenKs.length < 2) {
    return { ...EMPTY, summary: "Only one 10-K available — a year-over-year risk comparison needs two." }
  }

  try {
    const [current, prior] = await Promise.all([
      fetchFilingText(cik, tenKs[0].accessionNumber, tenKs[0].primaryDocument),
      fetchFilingText(cik, tenKs[1].accessionNumber, tenKs[1].primaryDocument),
    ])

    if (!current || !prior) {
      return { ...EMPTY, summary: "Could not retrieve both 10-K documents." }
    }

    const currentParas = splitRiskParagraphs(current)
    const priorParas = splitRiskParagraphs(prior)
    // Too little risk prose on either side means the comparison would be
    // driven by extraction noise rather than by real disclosure change.
    if (currentParas.length < 20 || priorParas.length < 20) {
      return { ...EMPTY, summary: "Not enough comparable disclosure text in both filings." }
    }

    const newRisks = findNewParagraphs(currentParas, priorParas).slice(0, 12)
    const removed = findNewParagraphs(priorParas, currentParas)

    if (newRisks.length === 0) {
      return {
        ...EMPTY,
        removedRiskCount: removed.length,
        currentFilingDate: tenKs[0].filingDate,
        priorFilingDate: tenKs[1].filingDate,
        summary: `No materially new risk-factor language versus the prior 10-K — the disclosed risk profile is unchanged.`,
      }
    }

    // AI judges materiality only. It never decides what is "new" — that's a
    // deterministic comparison above.
    let materialNewRisks: string[] = []
    try {
      const raw = await runAgent(
        MATERIALITY_SYSTEM,
        `These risk-disclosure passages appear in the 10-K filed ${tenKs[0].filingDate} and did NOT appear in the one filed ${tenKs[1].filingDate}.

${newRisks.map((r, i) => `[${i + 1}] ${r.slice(0, 900)}`).join("\n\n")}

Return JSON:
{ "material": ["one specific sentence per genuinely material newly-disclosed risk"] }

Return an empty array if none are material. Cap at 5.`,
        { maxTokens: 900, jsonMode: true }
      )
      const parsed = typeof raw === "string" ? JSON.parse(raw.replace(/```json|```/g, "").trim()) : raw
      materialNewRisks = Array.isArray(parsed?.material)
        ? parsed.material.filter((x: unknown): x is string => typeof x === "string").slice(0, 5)
        : []
    } catch { /* fall back to the raw diff count */ }

    const riskPenalty = Math.min(materialNewRisks.length * 7, 25)

    const summary = materialNewRisks.length > 0
      ? `Added ${materialNewRisks.length} materially new risk disclosure${materialNewRisks.length === 1 ? "" : "s"} versus last year's 10-K. Companies add risk factors when the exposure becomes real enough that omitting it creates legal liability — new language usually precedes the problem reaching the numbers.`
      : `${newRisks.length} risk passages changed year over year, but none read as materially new exposures.`

    return {
      newRiskCount: newRisks.length,
      newRisks: newRisks.map(r => r.slice(0, 300)),
      materialNewRisks,
      removedRiskCount: removed.length,
      summary,
      riskPenalty,
      currentFilingDate: tenKs[0].filingDate,
      priorFilingDate: tenKs[1].filingDate,
    }
  } catch {
    return { ...EMPTY, summary: "Risk-factor comparison unavailable." }
  }
}
