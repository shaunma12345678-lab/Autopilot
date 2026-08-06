// Reads the actual NARRATIVE of a 10-K — the parts XBRL can't capture.
//
// XBRL gives you the numbers. It doesn't tell you what management says they're
// building, what they're worried about, or how the risk profile changed since
// last year. That lives in Item 1 (Business), Item 1A (Risk Factors) and
// Item 7 (MD&A), as prose. This module fetches the primary filing document,
// isolates those sections, and has the AI read them.
//
// FRAMING THAT MATTERS: management narrative is written by the company about
// the company. It is structurally optimistic and legally hedged. So the output
// is deliberately scoped to "what management SAYS" — stated strategy, stated
// risks, stated capital plans — never "what will happen." The extraction prompt
// forbids prediction and forbids reporting anything not present in the text.
// An AI confidently forecasting from a marketing document would be worse than
// no feature at all.
import { runAgent } from "./claude"

const SEC_ARCHIVES = "https://www.sec.gov/Archives/edgar/data"

// A 10-K runs ~360k characters of text. Sections are budgeted so the model gets
// the substance without the exhibit sprawl.
const SECTION_BUDGET = { business: 14000, riskFactors: 16000, mdna: 20000 }

function userAgent(): string {
  const ua = process.env.SEC_EDGAR_USER_AGENT
  if (!ua) throw new Error("SEC_EDGAR_USER_AGENT is not set — SEC requires it on every request.")
  return ua
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8217;|&rsquo;/g, "'")
    .replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/g, '"')
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim()
}

// Finds a filing section between two "Item N." markers.
//
// The naive approach fails because every 10-K's table of contents also contains
// "Item 1A. Risk Factors", so the first match is a one-line TOC entry, not the
// section. Taking the LONGEST span between candidate start and end markers
// reliably lands on the real body.
function extractSection(text: string, startPattern: RegExp, endPattern: RegExp, budget: number): string | null {
  const starts = [...text.matchAll(startPattern)].map(m => m.index ?? -1).filter(i => i >= 0)
  const ends = [...text.matchAll(endPattern)].map(m => m.index ?? -1).filter(i => i >= 0)
  if (starts.length === 0) return null

  let best = ""
  for (const start of starts) {
    const end = ends.find(e => e > start + 500) ?? Math.min(start + budget, text.length)
    const span = text.slice(start, end)
    if (span.length > best.length) best = span
  }
  if (best.length < 800) return null // TOC fragment, not a real section
  return best.slice(0, budget)
}

// Full plain text of a filing, for deterministic analysis that has no context
// budget (year-over-year risk diffing). fetchFilingSections() is the LLM-facing
// path and caps each section; this one does not truncate.
export async function fetchFilingText(
  cik: string,
  accessionNumber: string,
  primaryDocument: string
): Promise<string | null> {
  try {
    const cikNum = String(Number(cik.replace(/\D/g, "")))
    const accession = accessionNumber.replace(/-/g, "")
    const res = await fetch(`${SEC_ARCHIVES}/${cikNum}/${accession}/${primaryDocument}`, {
      headers: { "User-Agent": userAgent(), Accept: "text/html" },
      signal: AbortSignal.timeout(45000),
    })
    if (!res.ok) return null
    const text = htmlToText(await res.text())
    return text.length < 5000 ? null : text
  } catch {
    return null
  }
}

export interface FilingSections {
  business: string | null
  riskFactors: string | null
  mdna: string | null
  filingDate: string
  form: string
  sourceUrl: string
}

export async function fetchFilingSections(
  cik: string,
  accessionNumber: string,
  primaryDocument: string,
  form: string,
  filingDate: string
): Promise<FilingSections | null> {
  try {
    const cikNum = String(Number(cik.replace(/\D/g, "")))
    const accession = accessionNumber.replace(/-/g, "")
    const sourceUrl = `${SEC_ARCHIVES}/${cikNum}/${accession}/${primaryDocument}`

    const res = await fetch(sourceUrl, {
      headers: { "User-Agent": userAgent(), Accept: "text/html" },
      signal: AbortSignal.timeout(30000),
    })
    if (!res.ok) return null

    const text = htmlToText(await res.text())
    if (text.length < 5000) return null

    return {
      business: extractSection(text, /Item\s*1\.\s*Business/gi, /Item\s*1A\.\s*Risk\s*Factors/gi, SECTION_BUDGET.business),
      riskFactors: extractSection(text, /Item\s*1A\.\s*Risk\s*Factors/gi, /Item\s*1B\.|Item\s*2\.\s*Propert/gi, SECTION_BUDGET.riskFactors),
      mdna: extractSection(text, /Item\s*7\.\s*Management/gi, /Item\s*7A\.|Item\s*8\.\s*Financial/gi, SECTION_BUDGET.mdna),
      filingDate,
      form,
      sourceUrl,
    }
  } catch {
    return null
  }
}

export interface NarrativeRead {
  strategy: string[]          // what management says they are building/doing next
  growthDrivers: string[]     // stated tailwinds
  headwinds: string[]         // stated risks and pressures
  capitalPlans: string[]      // buybacks, dividends, capex, M&A intentions
  outlookTone: "constructive" | "mixed" | "cautious" | "unclear"
  toneEvidence: string
  summary: string
  sourceUrl: string
  filingDate: string
}

const NARRATIVE_SYSTEM = `You read SEC filings for an investor and report ONLY what the filing actually says.

Hard rules:
- Report only claims present in the provided text. Never infer, never predict, never add outside knowledge.
- This text is written by the company about itself. It is promotional and legally hedged. Report it as "management states", not as fact.
- If a category has nothing in the text, return an empty array for it. Do not pad.
- Never output a price target, a valuation opinion, or advice to buy or sell.
- Be concrete and specific. "Expanding cloud capacity in three new regions" is useful; "focused on growth" is not.

Return ONLY valid JSON, no markdown fences.`

export async function readFilingNarrative(sections: FilingSections): Promise<NarrativeRead | null> {
  const parts: string[] = []
  if (sections.business) parts.push(`=== ITEM 1: BUSINESS ===\n${sections.business}`)
  if (sections.mdna) parts.push(`=== ITEM 7: MANAGEMENT'S DISCUSSION & ANALYSIS ===\n${sections.mdna}`)
  if (sections.riskFactors) parts.push(`=== ITEM 1A: RISK FACTORS ===\n${sections.riskFactors}`)
  if (parts.length === 0) return null

  try {
    const raw = await runAgent(
      NARRATIVE_SYSTEM,
      `Read this ${sections.form} filed ${sections.filingDate} and extract what management states.

${parts.join("\n\n")}

Return JSON exactly in this shape:
{
  "strategy": ["specific initiatives or products management says they are pursuing next"],
  "growthDrivers": ["specific tailwinds or demand drivers management identifies"],
  "headwinds": ["specific risks, cost pressures or competitive threats management identifies"],
  "capitalPlans": ["stated plans for buybacks, dividends, capital spending, acquisitions"],
  "outlookTone": "constructive | mixed | cautious | unclear",
  "toneEvidence": "one sentence quoting or closely paraphrasing the language that determined the tone",
  "summary": "2-3 sentences: what this company does and what management says is coming next"
}

Cap each array at 5 items, most material first.`,
      { maxTokens: 1800, jsonMode: true }
    )

    const parsed = typeof raw === "string" ? JSON.parse(raw.replace(/```json|```/g, "").trim()) : raw
    const arr = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 5) : []

    const tone = parsed?.outlookTone
    return {
      strategy: arr(parsed?.strategy),
      growthDrivers: arr(parsed?.growthDrivers),
      headwinds: arr(parsed?.headwinds),
      capitalPlans: arr(parsed?.capitalPlans),
      outlookTone: ["constructive", "mixed", "cautious"].includes(tone) ? tone : "unclear",
      toneEvidence: typeof parsed?.toneEvidence === "string" ? parsed.toneEvidence : "",
      summary: typeof parsed?.summary === "string" ? parsed.summary : "",
      sourceUrl: sections.sourceUrl,
      filingDate: sections.filingDate,
    }
  } catch {
    return null
  }
}
