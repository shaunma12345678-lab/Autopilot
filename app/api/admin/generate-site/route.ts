import { NextRequest } from "next/server"
import { generateWebsite, getQualityBaseline, getGenerationCount, parseUserCommand } from "@/lib/agents/website-agent"
import { buildResearchContext, analyzeScreenshot } from "@/lib/agents/site-researcher"
import { runAgent } from "@/lib/claude"

export const maxDuration = 300

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "ap2026admin"

// ── SSE helper ─────────────────────────────────────────────────────────────────

function sseEvent(type: string, data: Record<string, unknown>): string {
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`
}

// ── Prompt parser ──────────────────────────────────────────────────────────────

async function parsePrompt(prompt: string, history: string): Promise<{
  name: string; type: string; location: string; phone: string; website: string
  brandColor: string; tagline: string; services: string[]; description: string
  needsMoreInfo: boolean; questions: string[]
}> {
  const contextBlock = history
    ? `Conversation so far (use this for context — do NOT ask again for info already given):\n${history}\n\nLatest message: "${prompt}"`
    : `User said: "${prompt}"`

  const result = await runAgent(
    `You extract website build parameters from a user description. You have access to the full conversation history.

RULES:
- If the business name was already given in the conversation history, use it — never ask again
- If the business type is clear from context, infer it — never ask what you can deduce
- Only set needsMoreInfo: true if the business NAME is genuinely unknown after reading all history
- When you do ask a question, make it specific to what's missing and relevant to building the site
- Choose a premium, industry-authentic brand color (never generic #6366f1 blue)
- Return ONLY valid JSON`,
    `${contextBlock}

Return this JSON:
{
  "name": "business name — infer from history if available",
  "type": "specific business type (e.g. Luxury Roofing Company, Personal Injury Law Firm, CrossFit Gym)",
  "location": "city and state or empty string",
  "phone": "phone number or empty string",
  "website": "existing website URL or empty string",
  "brandColor": "#hex — premium color that fits the specific industry",
  "tagline": "short memorable tagline or empty string",
  "services": ["service 1", "service 2", "service 3", "service 4", "service 5"],
  "description": "2-3 sentence business description with personality",
  "needsMoreInfo": false,
  "questions": []
}`,
    { jsonMode: true, model: "haiku", maxTokens: 700 }
  ) as Record<string, unknown>

  return {
    name:          String(result.name          ?? "").trim(),
    type:          String(result.type          ?? "Business").trim(),
    location:      String(result.location      ?? "").trim(),
    phone:         String(result.phone         ?? "").trim(),
    website:       String(result.website       ?? "").trim(),
    brandColor:    /^#[0-9a-fA-F]{6}$/.test(String(result.brandColor ?? ""))
                     ? String(result.brandColor)
                     : "#1a1a2e",
    tagline:       String(result.tagline       ?? "").trim(),
    services:      Array.isArray(result.services) ? (result.services as unknown[]).map(String) : [],
    description:   String(result.description   ?? "").trim(),
    needsMoreInfo: !!(result.needsMoreInfo),
    questions:     Array.isArray(result.questions) ? (result.questions as unknown[]).map(String) : [],
  }
}

// ── Retry wrapper ─────────────────────────────────────────────────────────────

async function generateWithRetry(
  params: Parameters<typeof generateWebsite>[0],
  maxAttempts = 3
): Promise<Awaited<ReturnType<typeof generateWebsite>>> {
  let lastError: Error = new Error("Generation failed")

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await generateWebsite(params)
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      const lower = lastError.message.toLowerCase()

      if (lower.includes("401") || lower.includes("api key")) throw lastError

      if (attempt < maxAttempts) {
        // runAgent already retries rate limits internally; this handles other transient errors
        const delay = lower.includes("rate") || lower.includes("429") ? 5000 : 4000
        await new Promise(r => setTimeout(r, delay))
      }
    }
  }

  throw lastError
}

// ── Route handler — SSE streaming ─────────────────────────────────────────────

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

  const prompt   = String(body.prompt   ?? "").trim()
  const history  = String(body.history  ?? "").slice(0, 3000)
  const imageUrl = body.imageUrl ? String(body.imageUrl).trim() : undefined

  if (!prompt) {
    return Response.json({ error: "Describe the website you want to build" }, { status: 400 })
  }

  const stream = new ReadableStream({
    async start(controller) {
      const send = (type: string, data: Record<string, unknown>) => {
        controller.enqueue(new TextEncoder().encode(sseEvent(type, data)))
      }

      try {
        // Step 1: Parse prompt
        send("progress", { msg: "Parsing your description…", pct: 5 })
        const parsed = await parsePrompt(prompt, history)

        if (parsed.needsMoreInfo || !parsed.name) {
          send("clarify", {
            questions: parsed.questions.length > 0
              ? parsed.questions
              : ["What is the name of the business you want a website for?"],
          })
          controller.close()
          return
        }

        // Step 2: CSS scraping
        send("progress", { msg: "Deep-scraping existing site code…", pct: 12 })

        // Step 3: Vision analysis (if imageUrl provided)
        let visionContext = ""
        if (imageUrl) {
          send("progress", { msg: "Analyzing with AI vision…", pct: 22 })
          visionContext = await analyzeScreenshot(imageUrl)
        }

        // Step 4: Research pipeline (URL scraping + CSS + Tavily — parallel)
        send("progress", { msg: "Extracting CSS design system…", pct: 22 })
        let researchContext = ""
        let researchMeta    = { urlScraped: false, tavilyUsed: false }
        let designSystemData: { colors: string[]; fonts: string[]; framework: string } | null = null

        try {
          const research = await buildResearchContext(
            prompt,
            { name: parsed.name, type: parsed.type, location: parsed.location },
            visionContext || undefined
          )
          researchContext = research.combined
          researchMeta    = { urlScraped: research.urlScraped, tavilyUsed: research.tavilyUsed }

          if (research.designSystem) {
            designSystemData = {
              colors:    research.designSystem.colors,
              fonts:     research.designSystem.fonts,
              framework: research.designSystem.framework,
            }
            send("design_system", {
              colors:    research.designSystem.colors,
              fonts:     research.designSystem.fonts,
              framework: research.designSystem.framework,
            })
          }
        } catch {
          // Research is best-effort — never block generation
        }

        // Step 5: Parse style directives from the user's full prompt
        send("progress", { msg: "Parsing style directives…", pct: 44 })
        const directives = await parseUserCommand(prompt).catch(() => null)

        // Step 6: Generate site
        send("progress", { msg: "Generating with 15 techniques…", pct: 55 })
        const result = await generateWithRetry({
          business: {
            name:        parsed.name,
            type:        parsed.type,
            description: parsed.description,
            location:    parsed.location,
            phone:       parsed.phone    || null,
            website:     parsed.website  || null,
          },
          brandVoice:      {},
          brandColor:      parsed.brandColor,
          services:        parsed.services.length > 0 ? parsed.services : [`${parsed.type} Services`],
          tagline:         parsed.tagline || undefined,
          reviews:         [],
          researchContext: researchContext || undefined,
          directives:      directives ?? undefined,
        })

        // Step 7: Done
        send("progress", { msg: "Finalizing…", pct: 95 })
        send("complete", {
          html:         result.html,
          title:        result.title,
          slug:         result.slug,
          qualityScore: result.qualityScore,
          iterations:   result.iterations,
          research:     {
            ...researchMeta,
            designSystem: designSystemData,
          },
          meta: {
            qualityBaseline: getQualityBaseline(),
            totalGenerated:  getGenerationCount(),
          },
          parsed,
        })
      } catch (err) {
        console.error("[admin/generate-site]", err)
        const msg   = err instanceof Error ? err.message : String(err)
        const lower = msg.toLowerCase()

        let userMessage: string
        if (lower.includes("rate") || lower.includes("429")) {
          userMessage = "AI rate limit reached after retrying. Please wait 60 seconds and try again."
        } else if (lower.includes("401") || lower.includes("api key")) {
          userMessage = "AI provider not configured. Set ANTHROPIC_API_KEY in Vercel environment variables."
        } else if (lower.includes("no html") || lower.includes("output limit")) {
          userMessage = "The AI couldn't fit the full site in one response. Try again — it usually works on the second attempt."
        } else if (lower.includes("timeout") || lower.includes("timed out")) {
          userMessage = "Generation timed out. Please try again."
        } else {
          userMessage = `Generation failed: ${msg.slice(0, 200)}`
        }

        send("error", { message: userMessage })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type":     "text/event-stream",
      "Cache-Control":    "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      "Connection":       "keep-alive",
    },
  })
}

// ── GET: return quality stats ─────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const pw = request.headers.get("x-admin-password")
  if (pw !== ADMIN_PASSWORD) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  return Response.json({
    qualityBaseline: getQualityBaseline(),
    totalGenerated:  getGenerationCount(),
    hasTavily:       !!(process.env.TAVILY_API_KEY),
    hasAnthropic:    !!(process.env.ANTHROPIC_API_KEY),
  })
}
