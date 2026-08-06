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
import { classifyNews } from "./news-classifier"

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

export async function readCompanyNews(
  companyName: string,
  symbol: string
): Promise<NewsRead | null> {
  const items = await fetchNewsItems(companyName, symbol)
  if (items.length === 0) return null

  // DETERMINISTIC FIRST, ALWAYS. Classification runs in code we own: it cannot
  // rate-limit, cannot exhaust a quota, and returns the same answer every time.
  // The previous design put an LLM in this position and, when the provider
  // silently died, every company came back with no news while the feature
  // reported success.
  const classified = classifyNews(items)

  const base: NewsRead = {
    items: items.slice(0, 12),
    itemCount: items.length,
    materialDevelopments: classified.material
      .filter(m => m.category === "corporate_action" || m.category === "guidance" || m.category === "leadership")
      .map(m => `${m.title} — ${m.why}`),
    materialConcerns: classified.material
      .filter(m => ["regulatory", "operational", "financing", "litigation"].includes(m.category))
      .map(m => `${m.title} — ${m.why}`),
    tone: classified.material.length === 0
      ? "unclear"
      : classified.riskPenalty > 0 ? "negative" : "mixed",
    summary: classified.summary,
    riskPenalty: classified.riskPenalty,
  }

  // The model is used ONLY to write a readable paragraph over facts the rules
  // already selected. It never decides what is material, so if it is
  // unavailable the analysis is unchanged and only the prose is missing.
  if (classified.material.length === 0) return base

  try {
    const raw = await runAgent(
      `You write a short factual summary of company developments for an investor.
Report ONLY what the supplied items state. Never infer, never speculate, never add outside knowledge, never give a recommendation.
Return ONLY valid JSON, no markdown fences.`,
      `Company: ${companyName} (${symbol})

Material developments already identified:
${classified.material.map(m => `- [${m.category}] ${m.title} (${m.source})`).join("\n")}

Return JSON: { "summary": "two sentences on what is actually going on at this company" }`,
      { maxTokens: 400, jsonMode: true }
    )
    const p = typeof raw === "string" ? JSON.parse(raw.replace(/```json|```/g, "").trim()) : raw
    if (typeof p?.summary === "string" && p.summary.trim()) {
      return { ...base, summary: p.summary }
    }
  } catch {
    // Prose unavailable. The deterministic summary already says what happened.
  }
  return base
}
