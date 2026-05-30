// Web search via Tavily API (#9)
// Set TAVILY_API_KEY in your .env to enable live search.

export interface SearchResult {
  title:   string
  url:     string
  content: string
  score:   number
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
