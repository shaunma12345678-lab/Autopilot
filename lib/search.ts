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

  const res = await fetch("https://api.tavily.com/search", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key:      apiKey,
      query,
      max_results:  maxResults,
      search_depth: "advanced",
      include_answer: true,
      include_raw_content: false,
    }),
  })

  if (!res.ok) {
    console.error("[search] Tavily error:", res.status, await res.text())
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
}

// Deep search — includes full raw page content for each result.
// Use sparingly for high-value queries (legal notice pages, county recorders, auction listings).
export async function webSearchDeep(query: string, maxResults = 5): Promise<SearchResponse> {
  const apiKey = process.env.TAVILY_API_KEY
  if (!apiKey) return { query, results: [] }

  const res = await fetch("https://api.tavily.com/search", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key:             apiKey,
      query,
      max_results:         maxResults,
      search_depth:        "advanced",
      include_answer:      true,
      include_raw_content: true,
    }),
  })

  if (!res.ok) {
    console.error("[search-deep] Tavily error:", res.status, await res.text())
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

// DuckDuckGo HTML — zero API key, zero cost. Used when no TAVILY_API_KEY or SERPER_API_KEY is set.
// Parses DuckDuckGo's redirect hrefs to recover the actual destination URL.
export async function webSearchDDG(query: string, maxResults = 8): Promise<SearchResponse> {
  try {
    const res = await fetch("https://html.duckduckgo.com/html/", {
      method: "POST",
      headers: {
        "Content-Type":  "application/x-www-form-urlencoded",
        "User-Agent":    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept":        "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      body:   new URLSearchParams({ q: query, kl: "us-en" }).toString(),
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) return { query, results: [] }
    const html = await res.text()

    const linkMatches    = [...html.matchAll(/class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)]
    const snippetMatches = [...html.matchAll(/class="result__snippet"[^>]*>([\s\S]*?)(?:<\/a>|<\/div>)/gi)]

    const clean = (s: string) =>
      s.replace(/<[^>]+>/g, "")
       .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
       .replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim()

    const results: SearchResult[] = []
    for (let i = 0; i < Math.min(linkMatches.length, maxResults); i++) {
      const href  = linkMatches[i][1]
      const title = clean(linkMatches[i][2])
      const snippet = clean(snippetMatches[i]?.[1] ?? "")

      // DDG wraps all result links as //duckduckgo.com/l/?uddg=ENCODED_ACTUAL_URL
      let url = ""
      if (href.includes("uddg=")) {
        const m = href.match(/uddg=([^&]+)/)
        if (m) { try { url = decodeURIComponent(m[1]) } catch { /* skip */ } }
      } else if (href.startsWith("//")) {
        url = `https:${href}`
      } else if (href.startsWith("http")) {
        url = href
      }

      if (url && title) results.push({ title, url, content: snippet, score: 1 - i * 0.1 })
    }
    return { query, results }
  } catch {
    return { query, results: [] }
  }
}

// Auto-selects the best available search backend.
// Priority: Tavily (deepest, raw content) → Serper (Google, free 2.5k/mo) → DuckDuckGo (zero-key).
export async function webSearchAny(query: string, maxResults = 8): Promise<SearchResponse> {
  if (process.env.TAVILY_API_KEY)  return webSearch(query, maxResults)
  if (process.env.SERPER_API_KEY)  return webSearchSerper(query, maxResults)
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
