import { NextRequest } from "next/server"
import { runAgent } from "@/lib/claude"

export const maxDuration = 120

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "ap2026admin"

type SectionTarget =
  | "hero"
  | "nav"
  | "services"
  | "about"
  | "process"
  | "testimonials"
  | "cta"
  | "footer"
  | "global-css"

// ── Section identifier ────────────────────────────────────────────────────────

async function identifyTargetSection(instruction: string): Promise<SectionTarget> {
  const raw = await runAgent(
    "You identify which section of a website an edit instruction targets. Return ONLY one of the exact strings listed.",
    `Edit instruction: "${instruction}"

Return ONLY one of these exact strings — nothing else:
hero, nav, services, about, process, testimonials, cta, footer, global-css

Rules:
- "hero" = main banner, headline, above-the-fold area
- "nav" = navigation bar, header links
- "services" = services, offerings, features, plans section
- "about" = about us, team, story, mission section
- "process" = how it works, steps, workflow section
- "testimonials" = reviews, testimonials, social proof section
- "cta" = call to action, contact form, booking section
- "footer" = footer, bottom section
- "global-css" = color, font, spacing, or style changes that apply site-wide`,
    { model: "haiku", maxTokens: 20 }
  ) as string

  const cleaned = String(raw).toLowerCase().trim().replace(/[^a-z-]/g, "")
  const valid: SectionTarget[] = [
    "hero", "nav", "services", "about", "process",
    "testimonials", "cta", "footer", "global-css",
  ]
  return valid.includes(cleaned as SectionTarget)
    ? (cleaned as SectionTarget)
    : "hero"
}

// ── Global CSS patcher ────────────────────────────────────────────────────────

async function patchGlobalCSS(html: string, instruction: string): Promise<string> {
  // Extract the :root block and key CSS sections
  const rootMatch = html.match(/:root\s*\{[\s\S]*?\}/)
  const rootBlock = rootMatch ? rootMatch[0] : ""

  const patched = await runAgent(
    "You are a CSS expert. Apply the instruction to the CSS block. Return ONLY the updated CSS block — no explanation, no markdown.",
    `Instruction: "${instruction}"

Current :root CSS block:
${rootBlock || "(no :root block found — generate one with the change applied)"}

Return the updated :root block with the instruction applied. Keep all existing variables — only change what the instruction targets.`,
    { model: "sonnet", maxTokens: 1200 }
  ) as string

  if (!rootBlock) {
    // Inject a new :root block right after <style>
    return html.replace(/(<style[^>]*>)/, `$1\n${patched}\n`)
  }

  return html.replace(/:root\s*\{[\s\S]*?\}/, patched)
}

// ── Section extractor — finds the most likely matching section block ──────────

function extractSection(html: string, target: SectionTarget): { found: string; start: number; end: number } | null {
  const lower = html.toLowerCase()

  // Keywords per section type — ordered by specificity
  const keywordMap: Record<SectionTarget, string[]> = {
    hero:         ["hero", "banner", "jumbotron"],
    nav:          ["site-nav", "navbar", "nav-"],
    services:     ["services", "offerings", "features", "plans"],
    about:        ["about", "team", "story", "mission", "who-we"],
    process:      ["process", "how-it", "steps", "workflow", "how-we"],
    testimonials: ["testimonials", "reviews", "social-proof", "clients"],
    cta:          ["cta", "contact", "booking", "get-started", "call-to"],
    footer:       ["footer"],
    "global-css": [],
  }

  const keywords = keywordMap[target]

  // Tags to search within
  const tags = target === "nav" ? ["nav", "header"] : ["section", "div", "footer"]

  for (const keyword of keywords) {
    for (const tag of tags) {
      // Find tag opening with class or id matching keyword
      const pattern = new RegExp(
        `<${tag}[^>]*(class|id)=["'][^"']*${keyword}[^"']*["'][^>]*>`,
        "gi"
      )
      let match: RegExpExecArray | null
      while ((match = pattern.exec(lower)) !== null) {
        const start = match.index
        // Find matching closing tag by counting depth
        let depth = 1
        let i = start + match[0].length
        const openTag = new RegExp(`<${tag}[\\s>]`, "gi")
        const closeTag = new RegExp(`</${tag}>`, "gi")

        while (i < html.length && depth > 0) {
          openTag.lastIndex = i
          closeTag.lastIndex = i

          const nextOpen  = openTag.exec(html)
          const nextClose = closeTag.exec(html)

          if (!nextClose) break

          if (nextOpen && nextOpen.index < nextClose.index) {
            depth++
            i = nextOpen.index + nextOpen[0].length
          } else {
            depth--
            i = nextClose.index + nextClose[0].length
          }
        }

        if (depth === 0) {
          return { found: html.slice(start, i), start, end: i }
        }
      }
    }
  }

  return null
}

// ── Section patcher ───────────────────────────────────────────────────────────

async function patchSection(
  html: string,
  target: SectionTarget,
  instruction: string
): Promise<{ html: string; sectionEdited: string }> {
  const extracted = extractSection(html, target)

  if (!extracted) {
    // Fall back to global CSS patch for style instructions, else return unchanged
    if (/color|dark|light|font|size|spacing|background/i.test(instruction)) {
      const patched = await patchGlobalCSS(html, instruction)
      return { html: patched, sectionEdited: "global-css" }
    }
    return { html, sectionEdited: "none" }
  }

  const patchedSection = await runAgent(
    `You are an expert frontend engineer. Apply the edit instruction to the provided HTML section.
Return ONLY the updated HTML for that section — no explanation, no markdown fences, no surrounding content.`,
    `Edit instruction: "${instruction}"

Current section HTML (${target}):
${extracted.found.slice(0, 8000)}

Return the updated section HTML with the instruction applied. Keep all CSS classes, IDs, and scripts intact — only change what the instruction targets.`,
    { model: "sonnet", maxTokens: 6000 }
  ) as string

  // Strip accidental markdown fences
  const clean = patchedSection.replace(/^```(?:html)?\n?/i, "").replace(/\n?```$/i, "").trim()

  // Re-inject the patched section
  const newHtml = html.slice(0, extracted.start) + clean + html.slice(extracted.end)
  return { html: newHtml, sectionEdited: target }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const pw = request.headers.get("x-admin-password")
  if (pw !== ADMIN_PASSWORD) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const html        = String(body.html        ?? "").trim()
  const instruction = String(body.instruction ?? "").trim()

  if (!html)        return Response.json({ error: "html is required" },        { status: 400 })
  if (!instruction) return Response.json({ error: "instruction is required" }, { status: 400 })

  try {
    // Step 1: Identify target section
    const target = await identifyTargetSection(instruction)

    // Step 2: Apply the edit
    let result: { html: string; sectionEdited: string }

    if (target === "global-css") {
      const patched = await patchGlobalCSS(html, instruction)
      result = { html: patched, sectionEdited: "global-css" }
    } else {
      result = await patchSection(html, target, instruction)
    }

    return Response.json(result)
  } catch (err) {
    console.error("[admin/edit-site]", err)
    const msg = err instanceof Error ? err.message : String(err)
    return Response.json({ error: `Edit failed: ${msg.slice(0, 200)}` }, { status: 500 })
  }
}
