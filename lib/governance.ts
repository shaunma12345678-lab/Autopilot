// Governance analysis from DEF 14A proxy statements — "how the company is run".
//
// This was the largest remaining gap. Fundamentals tell you what a business
// earned; the proxy tells you whether the people running it are aligned with
// shareholders. Verified available free on EDGAR (Apple's DEF 14A, filed
// 2026-01-08).
//
// What the proxy uniquely contains:
//   • Executive pay STRUCTURE — compensation tied to revenue or headcount
//     rewards empire-building; compensation tied to ROIC or per-share metrics
//     rewards discipline. Same dollar amount, opposite incentive.
//   • Related-party transactions — business done with entities connected to
//     insiders. Genuine red-flag territory, and it must be disclosed.
//   • Auditor independence — when non-audit (consulting) fees rival audit fees,
//     the auditor has a second relationship to protect.
//   • Say-on-pay dissent — shareholders voting against the pay package.
//   • Dual-class structure — founders retaining voting control means public
//     shares carry economics without a real vote.
//   • Insider ownership — management with meaningful personal stakes behaves
//     differently from management with none.
//
// Same framing discipline as the 10-K reader: a proxy is written by the company
// about itself. The prompt forbids inference and the output reports what is
// DISCLOSED, not a character judgment.
import { runAgent } from "./claude"

const SEC_ARCHIVES = "https://www.sec.gov/Archives/edgar/data"
const PROXY_TEXT_BUDGET = 28000

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
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim()
}

// A proxy runs long and the governance-relevant material clusters around
// specific headings. Pulling windows around those keywords gets the substance
// without sending 300k characters to the model.
function extractGovernanceSections(text: string): string {
  const anchors = [
    /related[- ]party transaction/i,
    /certain relationships and related/i,
    /audit fees|fees paid to|principal accountant fees/i,
    /compensation discussion and analysis/i,
    /pay ratio|pay versus performance/i,
    /security ownership|beneficial owner/i,
    /say[- ]on[- ]pay|advisory vote/i,
    /class B common stock|dual[- ]class|voting power/i,
  ]

  const windows: string[] = []
  for (const anchor of anchors) {
    const match = text.match(anchor)
    if (match?.index === undefined) continue
    const start = Math.max(0, match.index - 400)
    windows.push(text.slice(start, start + 4200))
  }
  if (windows.length === 0) return text.slice(0, PROXY_TEXT_BUDGET)
  return windows.join("\n\n---\n\n").slice(0, PROXY_TEXT_BUDGET)
}

export interface GovernanceRead {
  payStructure: string
  payAlignment: "aligned" | "mixed" | "misaligned" | "unclear"
  relatedPartyTransactions: string[]
  auditorConcerns: string[]
  ownershipNotes: string[]
  boardNotes: string[]
  dualClass: boolean | null
  governanceScore: number      // 0-100, higher = better aligned
  riskPenalty: number
  flags: string[]
  summary: string
  sourceUrl: string
  filingDate: string
}

const GOVERNANCE_SYSTEM = `You analyze SEC DEF 14A proxy statements for an investor, reporting ONLY what the document discloses.

Hard rules:
- Report only what is stated in the provided text. Never infer motives, never speculate, never use outside knowledge.
- A proxy is written by the company about itself. Report what is DISCLOSED, not a character judgment about executives.
- payAlignment: "aligned" when incentive pay is tied to per-share or return-on-capital measures; "misaligned" when it is tied mainly to size (revenue, headcount, total assets) or is largely time-vesting with no performance condition; "mixed" when both; "unclear" when the text doesn't say.
- relatedPartyTransactions: list only ACTUAL disclosed transactions with insiders or their affiliates. If the document says there were none, return an empty array. Boilerplate describing the review policy is NOT a transaction.
- auditorConcerns: flag only if non-audit/consulting fees are large relative to audit fees, or if an auditor change or disagreement is disclosed.
- Never output a price target, valuation opinion, or advice to buy or sell.

Return ONLY valid JSON, no markdown fences.`

export async function readProxyGovernance(
  cik: string,
  accessionNumber: string,
  primaryDocument: string,
  filingDate: string
): Promise<GovernanceRead | null> {
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
    if (text.length < 3000) return null
    const sections = extractGovernanceSections(text)

    const raw = await runAgent(
      GOVERNANCE_SYSTEM,
      `Analyze this DEF 14A proxy statement filed ${filingDate}.

${sections}

Return JSON exactly in this shape:
{
  "payStructure": "one sentence on how executive incentive pay is actually measured",
  "payAlignment": "aligned | mixed | misaligned | unclear",
  "relatedPartyTransactions": ["actual disclosed transactions with insiders or their affiliates; empty array if none"],
  "auditorConcerns": ["only if non-audit fees are large relative to audit fees, or an auditor change/disagreement is disclosed"],
  "ownershipNotes": ["what the filing says about insider and institutional ownership levels"],
  "boardNotes": ["board independence, tenure, or structure points the filing discloses"],
  "dualClass": true or false,
  "summary": "2-3 sentences on how this company is governed, based only on the filing"
}

Cap each array at 4 items.`,
      { maxTokens: 1600, jsonMode: true }
    )

    const parsed = typeof raw === "string" ? JSON.parse(raw.replace(/```json|```/g, "").trim()) : raw
    const arr = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 4) : []

    const relatedPartyTransactions = arr(parsed?.relatedPartyTransactions)
    const auditorConcerns = arr(parsed?.auditorConcerns)
    const alignment = parsed?.payAlignment
    const payAlignment: GovernanceRead["payAlignment"] =
      ["aligned", "mixed", "misaligned"].includes(alignment) ? alignment : "unclear"
    const dualClass = typeof parsed?.dualClass === "boolean" ? parsed.dualClass : null

    // Governance score starts neutral-good and is debited for disclosed issues.
    let governanceScore = 75
    let riskPenalty = 0
    const flags: string[] = []

    if (payAlignment === "aligned") governanceScore += 15
    else if (payAlignment === "misaligned") {
      governanceScore -= 20
      riskPenalty += 6
      flags.push("⚠ Executive incentive pay appears tied mainly to size rather than to per-share or return-on-capital outcomes — an incentive to grow the company rather than grow value per share.")
    }

    if (relatedPartyTransactions.length > 0) {
      governanceScore -= 15
      riskPenalty += 10
      flags.push(`⚠ Related-party transactions disclosed: ${relatedPartyTransactions[0]}`)
    }

    if (auditorConcerns.length > 0) {
      governanceScore -= 12
      riskPenalty += 8
      flags.push(`⚠ Auditor independence concern: ${auditorConcerns[0]}`)
    }

    if (dualClass === true) {
      governanceScore -= 10
      flags.push("⚠ Dual-class share structure — public shareholders carry the economics with limited voting power.")
    }

    return {
      payStructure: typeof parsed?.payStructure === "string" ? parsed.payStructure : "",
      payAlignment,
      relatedPartyTransactions,
      auditorConcerns,
      ownershipNotes: arr(parsed?.ownershipNotes),
      boardNotes: arr(parsed?.boardNotes),
      dualClass,
      governanceScore: Math.max(0, Math.min(100, governanceScore)),
      riskPenalty,
      flags,
      summary: typeof parsed?.summary === "string" ? parsed.summary : "",
      sourceUrl,
      filingDate,
    }
  } catch {
    return null
  }
}
