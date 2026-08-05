// Recent news scan — the outside view on a company, to sit alongside the
// filings (what the company says about itself) and the numbers.
//
// Reuses the same Tavily -> DuckDuckGo search chain the real-estate scrapers
// already run on (lib/scrapers/base.ts), so this adds no new dependency and no
// new API key.
//
// Honest scoping, enforced in the prompt: news sentiment decays fast and is
// easily dominated by a single loud headline. This is used as CONTEXT — a list
// of what's being reported and whether the tone is broadly positive or
// negative — and it feeds the risk axis only when it surfaces something
// concrete (an investigation, a lawsuit, a guidance cut). It never drives the
// fundamental score, because a press cycle is not a business fundamental.
import { multiSearchSnippets } from "./scrapers/base"
import { runAgent } from "./claude"

export interface NewsRead {
  headlines: string[]
  positives: string[]
  negatives: string[]
  materialConcerns: string[]   // investigations, lawsuits, guidance cuts, fraud allegations
  tone: "positive" | "mixed" | "negative" | "unclear"
  summary: string
  riskPenalty: number
}

const NEWS_SYSTEM = `You summarize recent business news about a public company for an investor.

Hard rules:
- Use ONLY the search results provided. Never add outside knowledge or recall.
- Distinguish routine coverage (analyst chatter, price moves, product launches) from MATERIAL events
  (regulatory investigation, securities litigation, guidance cut, executive scandal, accounting concern,
  major customer loss, credit downgrade).
- Only put genuinely material items in materialConcerns. Do not inflate ordinary bad news into a concern.
- If the results are mostly noise, low-quality aggregator spam, or about a different company, say so and
  return tone "unclear" with empty arrays.
- Never output a price target, valuation opinion, or advice to buy or sell.

Return ONLY valid JSON, no markdown fences.`

export async function scanCompanyNews(symbol: string, companyName: string): Promise<NewsRead | null> {
  try {
    const year = new Date().getFullYear()
    const queries = [
      `${companyName} (${symbol}) news ${year}`,
      `${companyName} earnings guidance OR lawsuit OR investigation ${year}`,
      `${symbol} stock analysis ${year}`,
    ]
    const content = await multiSearchSnippets(queries, 20000)
    if (!content || content.trim().length < 300) return null

    const raw = await runAgent(
      NEWS_SYSTEM,
      `Recent search results about ${companyName} (ticker ${symbol}):

${content}

Return JSON exactly in this shape:
{
  "headlines": ["up to 5 distinct things actually being reported"],
  "positives": ["concrete positive developments"],
  "negatives": ["concrete negative developments"],
  "materialConcerns": ["only genuinely material: investigations, securities litigation, guidance cuts, accounting concerns, credit downgrades, major customer or contract loss"],
  "tone": "positive | mixed | negative | unclear",
  "summary": "2 sentences on what is currently being reported about this company"
}`,
      { maxTokens: 1200, jsonMode: true }
    )

    const parsed = typeof raw === "string" ? JSON.parse(raw.replace(/```json|```/g, "").trim()) : raw
    const arr = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 5) : []

    const materialConcerns = arr(parsed?.materialConcerns)
    const tone = parsed?.tone

    // Only material findings move risk. Ordinary negative press does not.
    const riskPenalty = Math.min(materialConcerns.length * 8, 20)

    return {
      headlines: arr(parsed?.headlines),
      positives: arr(parsed?.positives),
      negatives: arr(parsed?.negatives),
      materialConcerns,
      tone: ["positive", "mixed", "negative"].includes(tone) ? tone : "unclear",
      summary: typeof parsed?.summary === "string" ? parsed.summary : "",
      riskPenalty,
    }
  } catch {
    return null
  }
}
