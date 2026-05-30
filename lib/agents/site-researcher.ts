import { webSearch, formatSearchResults } from "@/lib/search"
import { runAgent } from "@/lib/claude"

export interface ResearchContext {
  urlScraped:    boolean
  tavilyUsed:    boolean
  urlSummary:    string
  businessInfo:  string
  industryDesign: string
  combined:      string
}

// ── URL extraction ─────────────────────────────────────────────────────────────

export function extractUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s,'")\]>]+/)
  if (!match) return null
  const url = match[0].replace(/[.,;!?]+$/, "")
  try { new URL(url); return url } catch { return null }
}

// ── URL scraping + AI summarization ──────────────────────────────────────────

export async function scrapeAndSummarize(
  url: string,
  businessName: string,
  businessType: string
): Promise<string> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 9000)

    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AutopilotSiteBuilder/1.0)",
        "Accept": "text/html,application/xhtml+xml",
      },
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!res.ok) return ""

    const html = await res.text()

    // Strip non-content tags
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
      .replace(/<nav[\s\S]*?<\/nav>/gi, "")
      .replace(/<footer[\s\S]*?<\/footer>/gi, "")
      .replace(/<header[\s\S]*?<\/header>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&[a-z#0-9]+;/gi, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 7000)

    if (text.length < 80) return ""

    const summary = await runAgent(
      "You extract precise business information from scraped website text. Be specific — use actual words from the source, not paraphrases.",
      `Scraping the existing website for: ${businessName} (${businessType})
Source URL: ${url}

Raw text:
${text}

Extract ONLY what is explicitly stated in the text:
- Actual services/products with real names and any prices mentioned
- Real phone number, email, address if present
- Real client names, testimonials, or case studies quoted verbatim
- Actual stats or numbers cited ("200+ clients", "15 years experience", etc.)
- Brand voice/tone: formal, casual, bold, friendly?
- Any visual brand cues: color names, taglines, slogans
- Unique selling points explicitly stated

Format as bullet points. Skip anything not found in the text.`,
      { model: "haiku", maxTokens: 900 }
    ) as string

    return summary
  } catch {
    return ""
  }
}

// ── Tavily research pipeline ──────────────────────────────────────────────────

async function searchTavily(
  name: string,
  type: string,
  location: string
): Promise<{ businessInfo: string; industryDesign: string }> {
  if (!process.env.TAVILY_API_KEY) {
    return { businessInfo: "", industryDesign: "" }
  }

  const loc = location || "USA"

  const [bizSearch, designSearch] = await Promise.allSettled([
    webSearch(`"${name}" ${type} ${loc} reviews services`, 4),
    webSearch(`best ${type} website design 2024 2025 award winning examples`, 3),
  ])

  const businessInfo   = bizSearch.status   === "fulfilled" ? formatSearchResults(bizSearch.value).slice(0, 1800)   : ""
  const industryDesign = designSearch.status === "fulfilled" ? formatSearchResults(designSearch.value).slice(0, 1200) : ""

  return { businessInfo, industryDesign }
}

// ── Main research orchestrator ────────────────────────────────────────────────

export async function buildResearchContext(
  prompt: string,
  business: { name: string; type: string; location: string }
): Promise<ResearchContext> {
  const url = extractUrl(prompt)

  // Run URL scraping and Tavily search in parallel
  const [urlResult, tavilyResult] = await Promise.allSettled([
    url ? scrapeAndSummarize(url, business.name, business.type) : Promise.resolve(""),
    searchTavily(business.name, business.type, business.location),
  ])

  const urlSummary    = urlResult.status    === "fulfilled" ? urlResult.value    : ""
  const tavilyData    = tavilyResult.status === "fulfilled" ? tavilyResult.value : { businessInfo: "", industryDesign: "" }
  const urlScraped    = !!(url && urlSummary)
  const tavilyUsed    = !!(tavilyData.businessInfo)

  // Merge into a combined context string
  const parts: string[] = []

  if (urlScraped) {
    parts.push(`━━━ SCRAPED FROM EXISTING SITE (${url}) ━━━\n${urlSummary}`)
  }
  if (tavilyData.businessInfo) {
    parts.push(`━━━ LIVE BUSINESS RESEARCH ━━━\n${tavilyData.businessInfo}`)
  }
  if (tavilyData.industryDesign) {
    parts.push(`━━━ INDUSTRY DESIGN INSIGHTS ━━━\n${tavilyData.industryDesign}`)
  }

  return {
    urlScraped,
    tavilyUsed,
    urlSummary,
    businessInfo:   tavilyData.businessInfo,
    industryDesign: tavilyData.industryDesign,
    combined:       parts.join("\n\n"),
  }
}

// ── Quality scorer ────────────────────────────────────────────────────────────

export async function scoreGeneratedSite(
  html: string,
  businessName: string,
  businessType: string
): Promise<number> {
  const checks = [
    html.includes("ShaderMaterial")                                ? "✓ GLSL Shader" : "✗ GLSL Shader",
    html.includes("splitAndAnimate") || html.includes(".char")     ? "✓ Text Split"  : "✗ Text Split",
    html.includes("lerp(")                                         ? "✓ Lerp"         : "✗ Lerp",
    html.includes("mapRange(")                                     ? "✓ MapRange"     : "✗ MapRange",
    html.includes("IntersectionObserver")                          ? "✓ ViewportIO"   : "✗ ViewportIO",
    html.includes("ScrollTrigger")                                 ? "✓ GSAP"         : "✗ GSAP",
    html.includes("WebGLRenderer") || html.includes("IcosahedronGeometry") ? "✓ WebGL" : "✗ WebGL",
    html.includes(".cursor")                                       ? "✓ Cursor"       : "✗ Cursor",
    html.includes("data-reveal")                                   ? "✓ Reveal"       : "✗ Reveal",
    html.includes("scroll-bar")                                    ? "✓ ScrollBar"    : "✗ ScrollBar",
    html.includes("hamburger")                                     ? "✓ Mobile Menu"  : "✗ Mobile Menu",
    html.includes("marquee")                                       ? "✓ Marquee"      : "✗ Marquee",
    html.length > 40000                                            ? "✓ Length OK"    : "✗ Too Short",
  ]

  const implemented = checks.filter(c => c.startsWith("✓")).length

  try {
    const raw = await runAgent(
      "You are a web design critic scoring AI-generated websites. Return ONLY a decimal number 0-10.",
      `Score this website HTML for ${businessName} (${businessType}).

Techniques present: ${checks.join(", ")}
(${implemented}/13 required techniques found)
HTML size: ${html.length.toLocaleString()} chars

Scoring rubric:
9-10: All 13 techniques present, exceptional content, premium design language
8-8.9: 10+ techniques, strong content, minor gaps
7-7.9: 8+ techniques, decent content but missing major animations
6-6.9: 6+ techniques or generic placeholder content
< 6: Missing core techniques or content is clearly generic

Return ONLY the number (e.g. "8.4"):`,
      { model: "haiku", maxTokens: 10 }
    ) as string

    const match = String(raw).match(/\d+\.?\d*/)
    const score = match ? Math.min(10, Math.max(0, parseFloat(match[0]))) : 7
    return score
  } catch {
    // Fallback: score by technique count
    return Math.min(10, 4 + implemented * 0.5)
  }
}
