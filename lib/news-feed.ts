// Company news — the outside view, to sit beside the filings and the numbers.
//
// WHY THIS REPLACES THE SEARCH-BASED SCAN. lib/company-news.ts routes through a
// Tavily -> DuckDuckGo chain. TAVILY_API_KEY is empty, and DuckDuckGo blocks
// datacenter IPs, so in production the scan returned nothing every single time:
// 0 of 5,487 tracked companies had any news attached. The feature existed in
// code and had never once produced a row — the exact failure mode this codebase
// keeps hitting, where something reports success while delivering nothing.
//
// Google News RSS needs no key, returns dated and attributed items, and works
// from server IPs. Verified live: 100 items for Skyworks, surfacing both a
// pending Qorvo merger and a shareholder investigation — neither of which
// appeared anywhere in our data.
//
// COMPREHENSION IS THE HARD PART, NOT RETRIEVAL. Headlines are adversarial in a
// specific way that matters here: plaintiff law firms publish "investigation
// initiated" press releases about essentially any stock that has dropped, and
// they syndicate widely enough to dominate a naive headline count. Treating
// those as equivalent to an actual SEC enforcement action would mark most of
// the market as under investigation. So the model is told exactly what
// separates a real legal problem from solicitation, and told to say when it
// cannot tell.
import { runAgent } from "./claude"

export interface NewsItem {
  title: string
  source: string
  publishedAt: string
}

export interface NewsRead {
  items: NewsItem[]
  itemCount: number
  materialDevelopments: string[]
  materialConcerns: string[]
  tone: "positive" | "mixed" | "negative" | "unclear"
  summary: string
  riskPenalty: number
}

const GOOGLE_NEWS_RSS = "https://news.google.com/rss/search"
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ")
    .trim()
}

function firstMatch(block: string, tag: string): string | null {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`))
  if (!m) return null
  return decodeEntities(m[1].replace(/<!\[CDATA\[|\]\]>/g, ""))
}

export async function fetchNewsItems(
  companyName: string,
  symbol: string,
  withinDays = 45
): Promise<NewsItem[]> {
  // Quoted company name, not the ticker. Tickers are short and collide badly —
  // searching "V" or "MA" as a term returns unrelated news, and a ticker query
  // is dominated by automated price-movement posts regardless.
  const query = `"${companyName}" when:${withinDays}d`
  const url = `${GOOGLE_NEWS_RSS}?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": BROWSER_UA, Accept: "application/rss+xml, application/xml" },
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) return []
    const xml = await res.text()

    const items: NewsItem[] = []
    for (const block of xml.split("<item>").slice(1)) {
      const title = firstMatch(block, "title")
      if (!title) continue
      items.push({
        title,
        source: firstMatch(block, "source") ?? "unknown",
        publishedAt: firstMatch(block, "pubDate") ?? "",
      })
      if (items.length >= 40) break
    }
    void symbol
    return items
  } catch {
    return []
  }
}

const NEWS_SYSTEM = `You read recent news headlines about a public company and judge what actually matters to an investor.

WHAT SEPARATES SIGNAL FROM NOISE — apply this strictly:

NOT material, and must never be reported as a concern:
- "Investigation initiated" / "investigates claims on behalf of shareholders" from PLAINTIFF LAW FIRMS (Kahn Swick & Foti, Pomerantz, Rosen, Bronstein, Levi & Korsinsky, Schall, Glancy, Bragar Eagel and similar). These firms publish these about nearly any stock that has declined and syndicate them widely. They indicate a price drop, not wrongdoing.
- Analyst price-target changes, rating changes, "beats/misses estimates" posts.
- Automated "stock moves X%", "what the charts say", "is it a buy?" content.
- Listicles, ETF-inclusion notices, headcount/data-vendor posts.

MATERIAL, and must be reported:
- Government or regulator action: SEC enforcement, DOJ, FTC, FDA decisions, subpoenas.
- Mergers, acquisitions, divestitures, and their regulatory milestones.
- Executive departures, especially CFO or auditor.
- Guidance changes, restatements, product recalls, plant closures, major contract wins or losses.
- Layoffs, restructuring, credit downgrades, covenant issues, strikes.

Rules:
- Report only what the headlines state. Never infer beyond them, never add outside knowledge.
- If the headlines are all noise, say so plainly and return empty arrays. That is a valid and common outcome.
- Distinguish a DEVELOPMENT (a fact that happened) from a CONCERN (a fact that threatens the business).

Return ONLY valid JSON, no markdown fences.`

export async function readCompanyNews(
  companyName: string,
  symbol: string
): Promise<NewsRead | null> {
  const items = await fetchNewsItems(companyName, symbol)
  if (items.length === 0) return null

  const empty: NewsRead = {
    items: items.slice(0, 12), itemCount: items.length,
    materialDevelopments: [], materialConcerns: [],
    tone: "unclear", summary: "", riskPenalty: 0,
  }

  try {
    const raw = await runAgent(
      NEWS_SYSTEM,
      `Company: ${companyName} (${symbol})

Recent headlines:
${items.map((i, n) => `${n + 1}. [${i.source}] ${i.title}`).join("\n")}

Return JSON:
{
  "materialDevelopments": ["specific factual developments, max 5"],
  "materialConcerns": ["specific things that threaten the business, max 5"],
  "tone": "positive" | "mixed" | "negative" | "unclear",
  "summary": "two sentences on what is actually going on at this company"
}`,
      { maxTokens: 900, jsonMode: true }
    )
    const p = typeof raw === "string" ? JSON.parse(raw.replace(/```json|```/g, "").trim()) : raw

    const strs = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 5) : []

    const materialConcerns = strs(p?.materialConcerns)
    const tone = ["positive", "mixed", "negative", "unclear"].includes(p?.tone) ? p.tone : "unclear"

    return {
      items: items.slice(0, 12),
      itemCount: items.length,
      materialDevelopments: strs(p?.materialDevelopments),
      materialConcerns,
      tone,
      summary: typeof p?.summary === "string" ? p.summary : "",
      // News feeds the risk axis only when it surfaces something concrete, and
      // is capped low. A press cycle is not a business fundamental, and
      // sentiment decays far faster than anything in a filing.
      riskPenalty: Math.min(materialConcerns.length * 5, 15),
    }
  } catch {
    return empty
  }
}
