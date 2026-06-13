// Web search via Tavily API (#9)
// Set TAVILY_API_KEY in your .env to enable live search.

export interface SearchResult {
  title:      string
  url:        string
  content:    string
  score:      number
  rawContent?: string
}

export interface SearchResponse {
  query:   string
  results: SearchResult[]
  answer?: string
}

export async function webSearch(query: string, maxResults = 5): Promise<SearchResponse> {
  const apiKey = process.env.TAVILY_API_KEY
  if (!apiKey) {
    return { query, results: [], answer: undefined }
  }

  try {
    const res = await fetch("https://api.tavily.com/search", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key:      apiKey,
        query,
        max_results:  maxResults,
        search_depth: "advanced",
        include_answer: false,
        include_raw_content: false,
      }),
      signal: AbortSignal.timeout(12000),
    })

    if (!res.ok) {
      console.error("[search] Tavily error:", res.status)
      return { query, results: [] }
    }

    const data = await res.json()
    return {
      query,
      answer:  data.answer,
      results: (data.results ?? []).map((r: Record<string, unknown>) => ({
        title:   r.title as string,
        url:     r.url as string,
        content: r.content as string,
        score:   (r.score as number) ?? 0,
      })),
    }
  } catch {
    return { query, results: [] }
  }
}

// Deep search — includes full raw page content for each result.
// Use sparingly for high-value queries (legal notice pages, county recorders, auction listings).
export async function webSearchDeep(query: string, maxResults = 5): Promise<SearchResponse> {
  const apiKey = process.env.TAVILY_API_KEY
  if (!apiKey) return { query, results: [] }

  try {
    // Hard per-request timeout — some legal-notice pages are multi-MB and would
    // otherwise hang the whole search past the serverless budget.
    const res = await fetch("https://api.tavily.com/search", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key:             apiKey,
        query,
        max_results:         maxResults,
        search_depth:        "advanced",
        include_answer:      false,
        include_raw_content: true,
      }),
      signal: AbortSignal.timeout(14000),
    })

    if (!res.ok) {
      console.error("[search-deep] Tavily error:", res.status)
      return { query, results: [] }
    }

    const data = await res.json()
    return {
      query,
      answer:  data.answer,
      results: (data.results ?? []).map((r: Record<string, unknown>) => ({
        title:      r.title as string,
        url:        r.url as string,
        content:    r.content as string,
        score:      (r.score as number) ?? 0,
        rawContent: r.raw_content as string | undefined,
      })),
    }
  } catch {
    return { query, results: [] }
  }
}

// Extract full content from specific URLs via Tavily extract endpoint.
export async function extractPageContent(urls: string[]): Promise<Array<{ url: string; content: string }>> {
  const apiKey = process.env.TAVILY_API_KEY
  if (!apiKey || urls.length === 0) return []

  try {
    const res = await fetch("https://api.tavily.com/extract", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ api_key: apiKey, urls }),
    })
    if (!res.ok) return []
    const data = await res.json()
    return (data.results ?? []).map((r: Record<string, unknown>) => ({
      url:     r.url as string,
      content: ((r.raw_content ?? r.content ?? "") as string).slice(0, 8000),
    }))
  } catch {
    return []
  }
}

// Google Custom Search JSON API — own your Google search directly, no middlemen.
// Free: 100 queries/day. Setup (5 min):
//   1. console.cloud.google.com → Enable "Custom Search JSON API"
//   2. programmablesearchengine.google.com → New engine → "Search entire web" → Copy CX ID
//   3. console.cloud.google.com → Credentials → Create API Key
//   4. Set GOOGLE_SEARCH_API_KEY and GOOGLE_CSE_ID env vars
export async function webSearchGoogleCSE(query: string, maxResults = 10): Promise<SearchResponse> {
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY
  const cx     = process.env.GOOGLE_CSE_ID
  if (!apiKey || !cx) return { query, results: [] }
  try {
    const params = new URLSearchParams({
      key: apiKey,
      cx,
      q:   query,
      num: String(Math.min(maxResults, 10)),
      gl:  "us",
      hl:  "en",
    })
    const res = await fetch(
      `https://www.googleapis.com/customsearch/v1?${params}`,
      { signal: AbortSignal.timeout(10000) }
    )
    if (!res.ok) return { query, results: [] }
    const data = await res.json()
    const results: SearchResult[] = (data.items ?? []).map(
      (item: Record<string, unknown>, i: number) => ({
        title:   String(item.title   ?? ""),
        url:     String(item.link    ?? ""),
        content: String(item.snippet ?? ""),
        score:   1 - i * 0.05,
      })
    )
    return { query, results }
  } catch {
    return { query, results: [] }
  }
}

// Serper.dev — Google results (free 2,500 queries/month, no credit card required).
// Sign up at serper.dev in ~60 seconds, then set SERPER_API_KEY env var.
export async function webSearchSerper(query: string, maxResults = 8): Promise<SearchResponse> {
  const apiKey = process.env.SERPER_API_KEY
  if (!apiKey) return { query, results: [] }
  try {
    const res = await fetch("https://google.serper.dev/search", {
      method:  "POST",
      headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
      body:    JSON.stringify({ q: query, num: maxResults, gl: "us", hl: "en" }),
      signal:  AbortSignal.timeout(10000),
    })
    if (!res.ok) return { query, results: [] }
    const data = await res.json()
    const results: SearchResult[] = (data.organic ?? []).slice(0, maxResults).map(
      (r: Record<string, unknown>, i: number) => ({
        title:   String(r.title   ?? ""),
        url:     String(r.link    ?? ""),
        content: String(r.snippet ?? ""),
        score:   1 - i * 0.05,
      })
    )
    return {
      query,
      results,
      answer: typeof data.answerBox?.answer === "string" ? data.answerBox.answer : undefined,
    }
  } catch {
    return { query, results: [] }
  }
}

// ── Zero-key search engines (no API key ever required) ───────────────────────
// DDG and Bing are used in tandem: DDG first, Bing auto-fallback when DDG
// returns nothing (e.g. blocked from data-center IPs on some hosting providers).

const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

async function _ddgHtml(query: string, maxResults: number): Promise<SearchResponse> {
  const res = await fetch("https://html.duckduckgo.com/html/", {
    method: "POST",
    headers: {
      "Content-Type":    "application/x-www-form-urlencoded",
      "User-Agent":      BROWSER_UA,
      "Accept":          "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
    },
    body:   new URLSearchParams({ q: query, kl: "us-en" }).toString(),
    signal: AbortSignal.timeout(12000),
  })
  if (!res.ok) return { query, results: [] }
  const html = await res.text()

  const clean = (s: string) =>
    s.replace(/<[^>]+>/g, "")
     .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
     .replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim()

  const links    = [...html.matchAll(/class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)]
  const snippets = [...html.matchAll(/class="result__snippet"[^>]*>([\s\S]*?)(?:<\/a>|<\/div>)/gi)]

  const results: SearchResult[] = []
  for (let i = 0; i < Math.min(links.length, maxResults); i++) {
    const href  = links[i][1]
    const title = clean(links[i][2])
    const snip  = clean(snippets[i]?.[1] ?? "")
    let url = ""
    if (href.includes("uddg=")) {
      const m = href.match(/uddg=([^&]+)/)
      if (m) { try { url = decodeURIComponent(m[1]) } catch { /* skip */ } }
    } else if (href.startsWith("//")) {
      url = `https:${href}`
    } else if (href.startsWith("http")) {
      url = href
    }
    if (url && title) results.push({ title, url, content: snip, score: 1 - i * 0.1 })
  }
  return { query, results }
}

async function _bingHtml(query: string, maxResults: number): Promise<SearchResponse> {
  const params = new URLSearchParams({ q: query, setlang: "en-US", form: "QBLH" })
  const res = await fetch(`https://www.bing.com/search?${params}`, {
    headers: {
      "User-Agent":      BROWSER_UA,
      "Accept":          "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
    },
    signal: AbortSignal.timeout(12000),
  })
  if (!res.ok) return { query, results: [] }
  const html = await res.text()

  const clean = (s: string) =>
    s.replace(/<[^>]+>/g, "")
     .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
     .replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim()

  // Bing wraps each organic result in <li class="b_algo">
  const blocks = [...html.matchAll(/<li[^>]*class="[^"]*\bb_algo\b[^"]*"[^>]*>([\s\S]*?)(?=<li[^>]*class="[^"]*\bb_algo\b|<\/ol>)/gi)]
  const results: SearchResult[] = []

  for (let i = 0; i < Math.min(blocks.length, maxResults); i++) {
    const block = blocks[i][1]
    const urlM    = block.match(/<h2[^>]*>\s*<a[^>]+href="(https?:\/\/[^"#]+)"/)
    const titleM  = block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/)
    const snippM  = block.match(/<p[^>]*>([\s\S]*?)<\/p>/)
    const url   = urlM?.[1] ?? ""
    const title = clean(titleM?.[1] ?? "")
    const snip  = clean(snippM?.[1] ?? "")
    if (url && title) results.push({ title, url, content: snip, score: 1 - i * 0.1 })
  }
  return { query, results }
}

// DuckDuckGo HTML with Bing automatic fallback.
// If DDG returns 0 results (e.g. blocked from cloud IPs), Bing is tried immediately.
// No API key required for either engine.
export async function webSearchDDG(query: string, maxResults = 8): Promise<SearchResponse> {
  try {
    const ddg = await _ddgHtml(query, maxResults)
    if (ddg.results.length > 0) return ddg
    return await _bingHtml(query, maxResults)
  } catch {
    try { return await _bingHtml(query, maxResults) } catch { return { query, results: [] } }
  }
}

// Auto-selects the best available search backend.
// Priority: Tavily → Google CSE (own key) → Serper → DDG+Bing (zero-key fallback).
export async function webSearchAny(query: string, maxResults = 8): Promise<SearchResponse> {
  if (process.env.TAVILY_API_KEY)   return webSearch(query, maxResults)
  if (process.env.GOOGLE_SEARCH_API_KEY && process.env.GOOGLE_CSE_ID)
    return webSearchGoogleCSE(query, maxResults)
  if (process.env.SERPER_API_KEY)   return webSearchSerper(query, maxResults)
  return webSearchDDG(query, maxResults)
}

// Deep search variant — raw page content when Tavily is available, otherwise falls back to webSearchAny.
export async function webSearchDeepOrAny(query: string, maxResults = 5): Promise<SearchResponse> {
  if (process.env.TAVILY_API_KEY) return webSearchDeep(query, maxResults)
  return webSearchAny(query, maxResults)
}

export function formatSearchResults(resp: SearchResponse): string {
  if (resp.results.length === 0) return ""
  const lines: string[] = [`[Live Search: "${resp.query}"]`]
  if (resp.answer) lines.push(`Summary: ${resp.answer}`)
  resp.results.slice(0, 4).forEach((r, i) => {
    lines.push(`\n[${i + 1}] ${r.title}\n${r.url}\n${r.content.slice(0, 400)}`)
  })
  return lines.join("\n")
}

export function shouldSearch(userMessage: string): boolean {
  if (!process.env.TAVILY_API_KEY) return false
  const triggers = [
    /current(ly)?/i, /today|this week|this month|latest|recent|now/i,
    /price|cost|rate|market/i, /competitor|vs\./i,
    /news|trend|update/i, /\d{4}/,
  ]
  return triggers.some(t => t.test(userMessage))
}
