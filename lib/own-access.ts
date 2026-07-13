// OUR OWN web-access layer — no search-API key, no scraping-arms-race. The
// 2026 reality (verified live): keyless general search is dead (DDG/Bing/
// Ecosia/Startpage bot-wall or serve junk) and directories block datacenters.
// What still works, and works WELL, is structured syndication: Google News RSS
// serves rich, current, query-targeted articles to any IP with no key. This
// module is the access primitive the web+AI features build on — plus a polite
// browser-grade fetcher for the per-domain adapters we verify one by one
// (the same verify-then-pin method as the county connectors). Never throws.

export interface NewsItem {
  title: string
  link: string
  source: string       // publisher name
  publishedAt: string  // ISO date
  snippet: string      // description text, tags stripped
}

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

const rssCache = new Map<string, { at: number; items: NewsItem[] }>()
const RSS_TTL = 2 * 60 * 60 * 1000
const RSS_CACHE_MAX = 500

function stripTags(s: string): string {
  return s
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function tag(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"))
  return m ? stripTags(m[1]) : ""
}

// Query-targeted news, any city, any topic — keyless and datacenter-safe.
export async function googleNewsRss(query: string, maxItems = 10, maxAgeDays = 400): Promise<NewsItem[]> {
  const ck = `${query.toLowerCase().trim()}|${maxItems}`
  const cached = rssCache.get(ck)
  if (cached && Date.now() - cached.at < RSS_TTL) return cached.items
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/rss+xml, application/xml, text/xml" }, signal: AbortSignal.timeout(12000) })
    if (!res.ok) return cached?.items ?? []
    const xml = await res.text()
    const items: NewsItem[] = []
    const cutoff = Date.now() - maxAgeDays * 86400000
    for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
      const block = m[1]
      const title = tag(block, "title")
      if (!title) continue
      const pub = tag(block, "pubDate")
      const t = Date.parse(pub)
      if (Number.isFinite(t) && t < cutoff) continue
      items.push({
        title,
        link: tag(block, "link"),
        source: tag(block, "source"),
        publishedAt: Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : "",
        snippet: tag(block, "description").slice(0, 400),
      })
      if (items.length >= maxItems) break
    }
    rssCache.set(ck, { at: Date.now(), items })
    if (rssCache.size > RSS_CACHE_MAX) rssCache.delete(rssCache.keys().next().value!)
    return items
  } catch {
    return cached?.items ?? []
  }
}

// Run several news queries and merge (dedup by title), newest first.
export async function newsSweep(queries: string[], perQuery = 8): Promise<NewsItem[]> {
  const results = await Promise.allSettled(queries.map((q) => googleNewsRss(q, perQuery)))
  const seen = new Set<string>()
  const out: NewsItem[] = []
  for (const r of results) {
    if (r.status !== "fulfilled") continue
    for (const it of r.value) {
      const k = it.title.toLowerCase().slice(0, 60)
      if (seen.has(k)) continue
      seen.add(k)
      out.push(it)
    }
  }
  out.sort((a, b) => (b.publishedAt || "").localeCompare(a.publishedAt || ""))
  return out
}

// Browser-grade polite fetch for verified per-domain adapters: realistic
// headers, timeout, one retry with jitter, size cap. Returns null on any
// failure — adapters must always degrade gracefully.
export async function politeFetch(url: string, opts?: { timeoutMs?: number; maxBytes?: number }): Promise<string | null> {
  const timeoutMs = opts?.timeoutMs ?? 12000
  const maxBytes = opts?.maxBytes ?? 400_000
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 400 + Math.random() * 900))
      const res = await fetch(url, {
        headers: {
          "User-Agent": UA,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "follow",
      })
      if (!res.ok) continue
      const text = await res.text()
      return text.length > maxBytes ? text.slice(0, maxBytes) : text
    } catch { /* retry once */ }
  }
  return null
}
