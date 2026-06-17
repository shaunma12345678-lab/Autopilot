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
  if (urls.length === 0) return []
  const apiKey = process.env.TAVILY_API_KEY
  if (!apiKey) return extractPageContentFree(urls) // our own, no-key extractor

  try {
    const res = await fetch("https://api.tavily.com/extract", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ api_key: apiKey, urls }),
    })
    if (!res.ok) return extractPageContentFree(urls)
    const data = await res.json()
    return (data.results ?? []).map((r: Record<string, unknown>) => ({
      url:     r.url as string,
      content: ((r.raw_content ?? r.content ?? "") as string).slice(0, 8000),
    }))
  } catch {
    return extractPageContentFree(urls)
  }
}

// OUR OWN page extractor — fetch each URL and pull the readable text, no key.
// Strips scripts/styles/nav/markup. Runs in parallel, fully guarded.
export async function extractPageContentFree(urls: string[]): Promise<Array<{ url: string; content: string }>> {
  return Promise.all(urls.slice(0, 6).map(async (url) => {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": BROWSER_UA, "Accept": "text/html", "Accept-Language": "en-US,en;q=0.9" },
        signal:  AbortSignal.timeout(10000),
      })
      if (!res.ok) return { url, content: "" }
      let html = await res.text()
      html = html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<(nav|header|footer|aside)[\s\S]*?<\/\1>/gi, " ")
        .replace(/<!--[\s\S]*?-->/g, " ")
      const text = html
        .replace(/<[^>]+>/g, " ")
        .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
        .replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ").trim()
      return { url, content: text.slice(0, 8000) }
    } catch {
      return { url, content: "" }
    }
  }))
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

async function _mojeekHtml(query: string, maxResults: number): Promise<SearchResponse> {
  const res = await fetch(`https://www.mojeek.com/search?${new URLSearchParams({ q: query })}`, {
    headers: { "User-Agent": BROWSER_UA, "Accept": "text/html", "Accept-Language": "en-US,en;q=0.9" },
    signal: AbortSignal.timeout(12000),
  })
  if (!res.ok) return { query, results: [] }
  const html = await res.text()
  const clean = (s: string) => s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim()
  const titleM = [...html.matchAll(/<a[^>]+href="(https?:\/\/[^"]+)"[^>]*class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\/a>/gi)]
  const snips  = [...html.matchAll(/<p[^>]*class="s"[^>]*>([\s\S]*?)<\/p>/gi)]
  const results: SearchResult[] = []
  for (let i = 0; i < Math.min(titleM.length, maxResults); i++) {
    const url = titleM[i][1], title = clean(titleM[i][2]), snip = clean(snips[i]?.[1] ?? "")
    if (url && title) results.push({ title, url, content: snip, score: 1 - i * 0.1 })
  }
  return { query, results }
}

// Self-building cache — every query we run is kept warm, so repeat searches are
// instant and free. Over a warm instance this is our own growing index that no
// external search API can hand us.
const META_CACHE = new Map<string, { at: number; resp: SearchResponse }>()
const META_TTL = 1000 * 60 * 60 * 6 // 6h

// OUR OWN metasearch — runs several free engines in PARALLEL, dedups by URL, and
// ranks by CONSENSUS (results multiple engines surface rank higher) + position.
// No single provider to depend on; resilient if any one engine is blocked.
export async function webSearchMeta(query: string, maxResults = 8): Promise<SearchResponse> {
  const ck = `${query.toLowerCase().trim()}|${maxResults}`
  const cached = META_CACHE.get(ck)
  if (cached && Date.now() - cached.at < META_TTL) return cached.resp

  const engines = await Promise.allSettled([
    _ddgHtml(query, maxResults),
    _bingHtml(query, maxResults),
    _mojeekHtml(query, maxResults),
  ])
  const norm = (u: string) => u.replace(/^https?:\/\/(www\.)?/, "").replace(/\/+$/, "").toLowerCase()
  const merged = new Map<string, { r: SearchResult; weight: number; hits: number }>()
  for (const e of engines) {
    if (e.status !== "fulfilled") continue
    for (const r of e.value.results) {
      if (!r.url) continue
      const key = norm(r.url)
      const prev = merged.get(key)
      const w = r.score ?? 0.5
      if (prev) {
        prev.weight += w; prev.hits += 1
        if ((r.content?.length ?? 0) > (prev.r.content?.length ?? 0)) prev.r = r // keep richest snippet
      } else {
        merged.set(key, { r: { ...r }, weight: w, hits: 1 })
      }
    }
  }
  const ranked = [...merged.values()]
    .sort((a, b) => (b.hits - a.hits) || (b.weight - a.weight)) // consensus first
    .slice(0, maxResults)
    .map((m) => m.r)
  const resp = { query, results: ranked }
  if (ranked.length) {
    META_CACHE.set(ck, { at: Date.now(), resp })
    if (META_CACHE.size > 2000) META_CACHE.delete(META_CACHE.keys().next().value!) // bound memory
  }
  return resp
}

// Free fallback — now powered by our own multi-engine metasearch.
export async function webSearchDDG(query: string, maxResults = 8): Promise<SearchResponse> {
  try {
    const meta = await webSearchMeta(query, maxResults)
    if (meta.results.length > 0) return meta
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
