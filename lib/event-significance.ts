// Event significance — reads a single fresh 8-K and judges how structurally
// important the disclosed event actually is, instead of treating every
// filing under one item code identically.
//
// THE GAP THIS CLOSES. lib/live-events.ts classifies every 8-K by item code
// alone, which is necessarily coarse: item 1.01 ("material agreement
// signed") fires identically for a company's largest customer contract ever
// and for a routine vendor renewal. The item code cannot distinguish them —
// only the filing text can.
//
// WHY THIS IS FAST WHERE narrative/governance READING ISN'T. Those wait for
// the deep-research rotation because a 10-K/proxy run is 15-70s and reading
// the WHOLE universe on that cadence isn't affordable. An 8-K is a few
// thousand words, not hundreds of pages, so this reads the single freshest
// non-routine filing per company rather than a rotation — the same
// dollars-per-insight math that makes it worth doing at all.
//
// WHAT THIS DOES NOT DO. Predict how a STOCK will react. "Good or bad for
// the business" and "will the price move" are different questions — the
// first is a fact about disclosed operations and finances (a new
// revenue-generating contract vs. a customer lost, a stable succession vs. a
// departure tied to a restatement); the second requires guessing how a
// market of other people will interpret and price that fact, which nobody
// can honestly do. This system draws that line everywhere else (see
// AssetDetail.tsx's header comment on why there's no price-target line, and
// lib/investment-verdict.ts for the same rule applied to the synthesis
// pass) and draws it here too: direction judges the business impact of what
// was disclosed, never market or investor reaction to it.
import { runAgent } from "./claude"
import { fetchFilingText } from "./edgar-narrative"

export type EventSignificanceLevel = "major" | "moderate" | "minor" | "unclear"
export type EventDirection = "positive" | "negative" | "mixed" | "unclear"

export interface EventSignificance {
  headline: string
  significance: EventSignificanceLevel
  direction: EventDirection
  reasoning: string
  eventDate: string
  eventLabel: string
  sourceUrl: string
}

const SIGNIFICANCE_SYSTEM = `You read a single SEC 8-K filing and judge two independent things about the disclosed event: how structurally significant it is, and whether it's good or bad FOR THE BUSINESS. You are NOT predicting stock price reaction — that question is off-limits and you must never mention price, market reaction, or investor sentiment.

HARD RULES — SIGNIFICANCE (scale):
- Base your judgment ONLY on what this filing discloses: dollar amounts, counterparty names, percentage of revenue or operations affected, duration and scope of any agreement or change, stated reasons for a departure or appointment.
- "major": the filing discloses a fact that changes the scale or structure of the business — a new agreement with a disclosed dollar value material to the company's size, a change-of-control event, a leadership change with disclosed unusual circumstances (e.g. tied to a restatement or investigation), a large financing or capital-structure change.
- "moderate": a real but bounded development — a departmental or divisional leadership change, an agreement of real but limited disclosed scope, an operational change affecting part of the business.
- "minor": routine housekeeping — a standard officer/director appointment with no unusual circumstances stated, a small or entirely unquantified agreement, procedural or administrative filings.
- "unclear": the filing does not disclose enough (no dollar figures, no stated scope) to judge honestly. Choose this rather than guessing.

HARD RULES — DIRECTION (business impact, not stock reaction):
- "positive": the disclosed fact adds to the business — new revenue-generating agreement, debt reduced or refinanced on better terms, a stable/planned leadership succession, an operational expansion.
- "negative": the disclosed fact takes away from the business — a lost or terminated agreement, new debt or an accelerated obligation, a departure tied to a stated problem (restatement, investigation, dispute), an impairment, a delisting notice, a bankruptcy filing.
- "mixed": the filing discloses genuinely offsetting facts (e.g. a new agreement that also commits significant new spending).
- "unclear": a leadership change or agreement with no stated reason or terms that would let you judge direction either way — the default for routine, unremarkable filings. Do not default to "positive" just because nothing bad is stated; absence of bad news is not evidence of good news.
- Judge direction from the fact itself, never from how a market might interpret it.

- Never invent a dollar figure, counterparty, or fact not in the text.
- Never output a price target, price direction, or advice to buy or sell.

Return ONLY valid JSON, no markdown fences.`

export async function assessEventSignificance(
  cik: string,
  accessionNumber: string,
  primaryDocument: string,
  eventDate: string,
  eventLabel: string
): Promise<EventSignificance | null> {
  try {
    const text = await fetchFilingText(cik, accessionNumber, primaryDocument)
    if (!text) return null

    const cikNum = String(Number(cik.replace(/\D/g, "")))
    const accession = accessionNumber.replace(/-/g, "")
    const sourceUrl = `https://www.sec.gov/Archives/edgar/data/${cikNum}/${accession}/${primaryDocument}`

    // 8-Ks are short; a generous budget still costs far less than the
    // multi-section 10-K/proxy reads this deliberately avoids waiting for.
    const excerpt = text.slice(0, 12000)

    const raw = await runAgent(
      SIGNIFICANCE_SYSTEM,
      `This 8-K was filed ${eventDate}, classified as "${eventLabel}" by its item code.

FILING TEXT:
${excerpt}

Return JSON:
{
  "headline": "one factual sentence stating what was disclosed",
  "significance": "major | moderate | minor | unclear",
  "direction": "positive | negative | mixed | unclear",
  "reasoning": "1-2 sentences citing the specific dollar figure, scope, or disclosed detail behind BOTH the significance and direction ratings"
}`,
      { maxTokens: 600, jsonMode: true }
    )

    const p = typeof raw === "string" ? JSON.parse(raw.replace(/```json|```/g, "").trim()) : raw
    const significance: EventSignificanceLevel =
      ["major", "moderate", "minor"].includes(p?.significance) ? p.significance : "unclear"
    const direction: EventDirection =
      ["positive", "negative", "mixed"].includes(p?.direction) ? p.direction : "unclear"

    return {
      headline: typeof p?.headline === "string" ? p.headline : "",
      significance,
      direction,
      reasoning: typeof p?.reasoning === "string" ? p.reasoning : "",
      eventDate,
      eventLabel,
      sourceUrl,
    }
  } catch {
    return null
  }
}
