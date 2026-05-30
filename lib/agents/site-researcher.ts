import { webSearch, formatSearchResults } from "@/lib/search"
import { runAgent } from "@/lib/claude"
import Anthropic from "@anthropic-ai/sdk"

// ── Design system interface ────────────────────────────────────────────────────

export interface DesignSystem {
  vars:        Record<string, string>
  fonts:       string[]
  colors:      string[]
  framework:   "tailwind" | "bootstrap" | "custom"
  fontImports: string[]
  animations:  string[]
  radii:       string[]
}

// ── Component patterns interface ───────────────────────────────────────────────

export interface ComponentPatterns {
  sectionCount:  number
  cardCount:     number
  hasHamburger:  boolean
  navLinkCount:  number
  hasVideo:      boolean
  hasParallax:   boolean
}

// ── Research context interface ─────────────────────────────────────────────────

export interface ResearchContext {
  urlScraped:        boolean
  tavilyUsed:        boolean
  urlSummary:        string
  businessInfo:      string
  industryDesign:    string
  combined:          string
  designSystem:      DesignSystem | null
  componentPatterns: ComponentPatterns | null
}

// ── URL extraction ─────────────────────────────────────────────────────────────

export function extractUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s,'")\]>]+/)
  if (!match) return null
  const url = match[0].replace(/[.,;!?]+$/, "")
  try { new URL(url); return url } catch { return null }
}

// ── CSS fetcher — pulls linked stylesheets + inline styles ────────────────────

export async function fetchAndExtractCSS(baseUrl: string, html: string): Promise<string> {
  const parts: string[] = []

  // Extract inline <style> blocks
  const styleBlocks = html.match(/<style[\s\S]*?<\/style>/gi) ?? []
  for (const block of styleBlocks) {
    const inner = block.replace(/<style[^>]*>/i, "").replace(/<\/style>/i, "")
    parts.push(inner)
  }

  // Extract up to 4 linked stylesheet hrefs
  const linkMatches = [...html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]*>/gi)]
  const hrefs: string[] = []

  for (const match of linkMatches) {
    const hrefMatch = match[0].match(/href=["']([^"']+)["']/)
    if (hrefMatch) {
      const href = hrefMatch[1]
      // Skip CDN-hosted libraries, focus on site's own CSS
      if (href.startsWith("http") || href.startsWith("//")) {
        hrefs.push(href.startsWith("//") ? "https:" + href : href)
      } else {
        // Resolve relative URL against base
        try {
          hrefs.push(new URL(href, baseUrl).toString())
        } catch {
          // Skip invalid URLs
        }
      }
      if (hrefs.length >= 4) break
    }
  }

  // Fetch each stylesheet with 5s timeout
  await Promise.allSettled(
    hrefs.map(async href => {
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 5000)
        const res = await fetch(href, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; AutopilotSiteBuilder/1.0)" },
          signal: controller.signal,
        })
        clearTimeout(timeout)
        if (res.ok) {
          const css = await res.text()
          parts.push(css.slice(0, 30000))
        }
      } catch {
        // Non-blocking — skip failed stylesheets
      }
    })
  )

  return parts.join("\n\n").slice(0, 80000)
}

// ── CSS design system extractor ───────────────────────────────────────────────

export function extractDesignSystem(css: string, html: string): DesignSystem {
  // Extract CSS custom properties (--*)
  const vars: Record<string, string> = {}
  for (const match of css.matchAll(/--([a-z0-9-]+)\s*:\s*([^;}{]+)/gi)) {
    vars[`--${match[1].trim()}`] = match[2].trim().slice(0, 80)
  }

  // Extract font-family declarations (deduplicated)
  const fontSet = new Set<string>()
  for (const match of css.matchAll(/font-family\s*:\s*([^;}{]+)/gi)) {
    const raw = match[1].trim().split(",")[0].replace(/["']/g, "").trim()
    if (raw && raw.length < 60 && !raw.toLowerCase().includes("inherit")) {
      fontSet.add(raw)
    }
  }
  const fonts = [...fontSet].slice(0, 8)

  // Extract hex and rgb colors (deduplicated)
  const colorSet = new Set<string>()
  for (const match of css.matchAll(/#[0-9a-fA-F]{3,6}\b/g)) {
    colorSet.add(match[0].toLowerCase())
  }
  for (const match of css.matchAll(/rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+[^)]*\)/g)) {
    colorSet.add(match[0].toLowerCase().replace(/\s+/g, ""))
  }
  const colors = [...colorSet].slice(0, 24)

  // Extract border-radius values
  const radiiSet = new Set<string>()
  for (const match of css.matchAll(/border-radius\s*:\s*([^;}{]+)/gi)) {
    radiiSet.add(match[1].trim().slice(0, 40))
  }
  const radii = [...radiiSet].slice(0, 8)

  // Extract @keyframes names
  const animations: string[] = []
  for (const match of css.matchAll(/@keyframes\s+([a-z0-9_-]+)/gi)) {
    animations.push(match[1])
  }

  // Detect font @import statements (Google Fonts etc.)
  const fontImports: string[] = []
  for (const match of css.matchAll(/@import\s+url\(['"]([^'"]+)['"]\)/gi)) {
    fontImports.push(match[1])
  }
  for (const match of html.matchAll(/<link[^>]+fonts\.googleapis\.com[^>]*>/gi)) {
    const href = match[0].match(/href=["']([^"']+)["']/)
    if (href) fontImports.push(href[1])
  }

  // Detect framework from HTML class names
  let framework: "tailwind" | "bootstrap" | "custom" = "custom"
  if (/class=["'][^"']*\b(flex|grid|text-\w+-\d+|bg-\w+-\d+|p-\d+|m-\d+|rounded-\w+)\b/i.test(html)) {
    framework = "tailwind"
  } else if (/class=["'][^"']*\b(container|row|col-\w+|btn btn-|navbar|card-body)\b/i.test(html)) {
    framework = "bootstrap"
  }

  return { vars, fonts, colors, framework, fontImports, animations, radii }
}

// ── Component pattern recognizer ──────────────────────────────────────────────

export function recognizeComponents(html: string): ComponentPatterns {
  // Count <section> tags
  const sectionCount = (html.match(/<section[\s>]/gi) ?? []).length

  // Count elements with "card" in class
  const cardCount = (html.match(/class=["'][^"']*\bcard\b[^"']*["']/gi) ?? []).length

  // Detect hamburger / mobile menu pattern
  const hasHamburger = /hamburger|mobile-menu|menu-toggle|nav-toggle|\.burger/i.test(html)

  // Count nav links
  const navLinkCount = (() => {
    const navMatch = html.match(/<nav[\s\S]*?<\/nav>/i)
    if (!navMatch) return 0
    return (navMatch[0].match(/<a\s/gi) ?? []).length
  })()

  // Detect video elements
  const hasVideo = /<video[\s>]/i.test(html) || /youtube\.com|vimeo\.com/i.test(html)

  // Detect parallax
  const hasParallax = /parallax|data-speed|data-parallax/i.test(html)

  return { sectionCount, cardCount, hasHamburger, navLinkCount, hasVideo, hasParallax }
}

// ── Vision analysis via Anthropic SDK ────────────────────────────────────────

export async function analyzeScreenshot(imageUrl: string): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) return ""

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 600,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "url",
                url: imageUrl,
              },
            },
            {
              type: "text",
              text: "Analyze this website screenshot. Describe: 1) Layout structure and section types visible, 2) Color palette and primary/accent colors, 3) Typography style (serif/sans-serif, weight, size), 4) Design aesthetic (minimal, bold, luxury, corporate, creative), 5) Key UI components (cards, nav style, hero type, CTAs). Be specific and concise — this will be used to replicate the design language.",
            },
          ],
        },
      ],
    })

    const block = response.content[0]
    if (block.type === "text") return block.text
    return ""
  } catch {
    return ""
  }
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
  business: { name: string; type: string; location: string },
  visionContext?: string
): Promise<ResearchContext> {
  const url = extractUrl(prompt)

  // Run URL scraping, Tavily search, CSS fetching, and vision in parallel
  const [urlResult, tavilyResult, cssResult] = await Promise.allSettled([
    url ? scrapeAndSummarize(url, business.name, business.type) : Promise.resolve(""),
    searchTavily(business.name, business.type, business.location),
    url ? (async (): Promise<{ css: string; html: string } | null> => {
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 9000)
        const res = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; AutopilotSiteBuilder/1.0)", Accept: "text/html" },
          signal: controller.signal,
        })
        clearTimeout(timeout)
        if (!res.ok) return null
        const html = await res.text()
        const css = await fetchAndExtractCSS(url, html)
        return { css, html }
      } catch {
        return null
      }
    })() : Promise.resolve(null),
  ])

  const urlSummary    = urlResult.status    === "fulfilled" ? urlResult.value    : ""
  const tavilyData    = tavilyResult.status === "fulfilled" ? tavilyResult.value : { businessInfo: "", industryDesign: "" }
  const cssData       = cssResult.status    === "fulfilled" ? cssResult.value    : null
  const urlScraped    = !!(url && urlSummary)
  const tavilyUsed    = !!(tavilyData.businessInfo)

  // Extract design system and component patterns if we have CSS+HTML
  let designSystem:      DesignSystem | null = null
  let componentPatterns: ComponentPatterns | null = null

  if (cssData) {
    designSystem      = extractDesignSystem(cssData.css, cssData.html)
    componentPatterns = recognizeComponents(cssData.html)
  }

  // Merge into a combined context string
  const parts: string[] = []

  if (urlScraped) {
    parts.push(`━━━ SCRAPED FROM EXISTING SITE (${url}) ━━━\n${urlSummary}`)
  }

  if (designSystem && (designSystem.colors.length > 0 || designSystem.fonts.length > 0)) {
    const dsLines: string[] = ["━━━ EXTRACTED CSS DESIGN SYSTEM ━━━"]
    if (designSystem.framework !== "custom") dsLines.push(`Framework: ${designSystem.framework}`)
    if (designSystem.fonts.length)  dsLines.push(`Fonts: ${designSystem.fonts.join(", ")}`)
    if (designSystem.colors.length) dsLines.push(`Colors: ${designSystem.colors.slice(0, 8).join(", ")}`)
    if (designSystem.radii.length)  dsLines.push(`Border radii: ${designSystem.radii.slice(0, 4).join(", ")}`)
    if (designSystem.animations.length) dsLines.push(`Animations: ${designSystem.animations.join(", ")}`)
    const importantVars = Object.entries(designSystem.vars).slice(0, 10)
    if (importantVars.length) dsLines.push(`CSS vars: ${importantVars.map(([k, v]) => `${k}: ${v}`).join("; ")}`)
    parts.push(dsLines.join("\n"))
  }

  if (componentPatterns) {
    const cpLines = [
      "━━━ SITE COMPONENT PATTERNS ━━━",
      `Sections: ${componentPatterns.sectionCount}, Cards: ${componentPatterns.cardCount}`,
      `Nav links: ${componentPatterns.navLinkCount}, Hamburger: ${componentPatterns.hasHamburger ? "yes" : "no"}`,
      `Video: ${componentPatterns.hasVideo ? "yes" : "no"}, Parallax: ${componentPatterns.hasParallax ? "yes" : "no"}`,
    ]
    parts.push(cpLines.join("\n"))
  }

  if (visionContext) {
    parts.push(`━━━ AI VISION ANALYSIS ━━━\n${visionContext}`)
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
    businessInfo:      tavilyData.businessInfo,
    industryDesign:    tavilyData.industryDesign,
    combined:          parts.join("\n\n"),
    designSystem,
    componentPatterns,
  }
}

// ── #10 — Reference URL style cloner ─────────────────────────────────────────
// Fetches a reference URL and extracts its design system as constraint text

export async function cloneUrlStyle(referenceUrl: string): Promise<string> {
  try {
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 9000)

    const res = await fetch(referenceUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AutopilotSiteBuilder/1.0)", Accept: "text/html" },
      signal: controller.signal,
    })
    if (!res.ok) return ""

    const html = await res.text()
    const css  = await fetchAndExtractCSS(referenceUrl, html)
    const ds   = extractDesignSystem(css, html)

    const parts: string[] = [`━━━ REFERENCE STYLE TO MATCH (${referenceUrl}) ━━━`]

    if (ds.colors.length > 0) {
      parts.push(`Color palette: ${ds.colors.slice(0, 10).join(", ")}`)
    }
    if (ds.fonts.length > 0) {
      parts.push(`Font stack: ${ds.fonts.join(", ")}`)
    }
    if (ds.radii.length > 0) {
      parts.push(`Border radius values: ${ds.radii.slice(0, 4).join(", ")}`)
    }
    if (ds.animations.length > 0) {
      parts.push(`Animation names: ${ds.animations.join(", ")}`)
    }

    const importantVars = Object.entries(ds.vars).slice(0, 12)
    if (importantVars.length > 0) {
      parts.push(`CSS variables: ${importantVars.map(([k, v]) => `${k}: ${v}`).join("; ")}`)
    }

    // Extract dominant aesthetic from class names and structure
    const usesGrid    = /display:\s*grid|grid-template/i.test(css)
    const usesFlex    = /display:\s*flex/i.test(css)
    const hasRounded  = /border-radius:\s*(1|1\.|2|3)rem/i.test(css)
    const hasShadows  = /box-shadow:.{10,80}/i.test(css)
    const hasGlassy   = /backdrop-filter|rgba\(\d+,\d+,\d+,0\.\d+\)/i.test(css)
    const hasDark     = /(background|bg).*#[0-1][0-9a-f]{5}/i.test(css)

    const aesthetics: string[] = []
    if (usesGrid)   aesthetics.push("grid-heavy layout")
    if (usesFlex)   aesthetics.push("flexbox-based")
    if (hasRounded) aesthetics.push("rounded pill/card shapes")
    if (hasShadows) aesthetics.push("depth via box-shadows")
    if (hasGlassy)  aesthetics.push("glassmorphism elements")
    if (hasDark)    aesthetics.push("dark background")

    if (aesthetics.length > 0) {
      parts.push(`Design aesthetic: ${aesthetics.join(", ")}`)
    }

    parts.push("DIRECTIVE: Replicate the design language above — colors, fonts, radius, and aesthetic — in the generated site.")

    return parts.join("\n")
  } catch {
    return ""
  }
}

// ── #30 — Reference image intent analyzer ────────────────────────────────────
// Analyzes a base64-encoded reference image using Groq vision

export async function analyzeReferenceImage(
  base64Data: string,
  mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp" = "image/jpeg"
): Promise<string> {
  if (!process.env.GROQ_API_KEY) return ""

  try {
    const Groq = (await import("groq-sdk")).default
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

    const response = await groq.chat.completions.create({
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      max_tokens: 800,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: `data:${mediaType};base64,${base64Data}` },
            },
            {
              type: "text",
              text: `Analyze this website reference image/sketch and extract design intent.
Describe specifically:
1. Layout structure: section types, grid pattern, sidebar vs full-width
2. Color palette: background, primary, accent, text colors (use hex estimates if visible)
3. Typography: font style (serif/sans/mono), weight, size hierarchy
4. Design aesthetic: luxury/minimal/bold/corporate/playful/creative
5. Hero type: text-only, image-based, 3D, split-column, video
6. Key UI elements: card styles, button shapes, navigation type, cursor effects
7. Animation feel: static, subtle transitions, dramatic motion, scroll-driven
8. Specific sections visible: pricing, testimonials, FAQ, portfolio, etc.

Be specific and concrete — this description will be used to replicate the design.`,
            },
          ],
        },
      ],
    })

    const text = response.choices[0]?.message?.content ?? ""
    if (!text) return ""

    return `━━━ REFERENCE IMAGE DESIGN INTENT ━━━
${text}
DIRECTIVE: Implement the design language, layout, and aesthetic described above in the generated site.`
  } catch {
    return ""
  }
}

// ── Quality scorer ────────────────────────────────────────────────────────────

export async function scoreGeneratedSite(
  html: string,
  businessName: string,
  businessType: string
): Promise<number> {
  const checks = [
    // Original 8 techniques
    html.includes("ShaderMaterial")                                        ? "✓ GLSL Shader"     : "✗ GLSL Shader",
    html.includes("splitAndAnimate") || html.includes(".char")             ? "✓ Text Split"      : "✗ Text Split",
    html.includes("lerp(")                                                 ? "✓ Lerp"            : "✗ Lerp",
    html.includes("mapRange(")                                             ? "✓ MapRange"        : "✗ MapRange",
    html.includes("IntersectionObserver")                                  ? "✓ ViewportIO"      : "✗ ViewportIO",
    html.includes("ScrollTrigger")                                         ? "✓ GSAP"            : "✗ GSAP",
    html.includes("WebGLRenderer") || html.includes("IcosahedronGeometry") ? "✓ WebGL"           : "✗ WebGL",
    html.includes(".cursor")                                               ? "✓ Cursor"          : "✗ Cursor",
    // New 6 techniques
    html.includes("page-loader") || html.includes("loader-bar")           ? "✓ Page Loader"     : "✗ Page Loader",
    html.includes("magnetic")                                              ? "✓ Magnetic Btns"   : "✗ Magnetic Btns",
    html.includes("tilt-card") || html.includes("rotateY")                ? "✓ 3D Tilt"         : "✗ 3D Tilt",
    html.includes("h-track") || html.includes("h-scroll")                 ? "✓ Horiz Scroll"    : "✗ Horiz Scroll",
    html.includes("wipe-reveal") || html.includes("clip-path")            ? "✓ Clip-Path"       : "✗ Clip-Path",
    html.includes("chip") || html.includes("btn-arrow")                   ? "✓ Micro-Anim"      : "✗ Micro-Anim",
    // Quality checks
    html.includes("data-reveal")                                           ? "✓ Reveal"          : "✗ Reveal",
    html.includes("marquee")                                               ? "✓ Marquee"         : "✗ Marquee",
    html.includes("hamburger")                                             ? "✓ Mobile Menu"     : "✗ Mobile Menu",
    html.length > 45000                                                    ? "✓ Length OK"       : "✗ Too Short",
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
