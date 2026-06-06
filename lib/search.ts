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
