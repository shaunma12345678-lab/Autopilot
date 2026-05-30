import { NextRequest } from "next/server"
import { generateWebsite } from "@/lib/agents/website-agent"
import { runAgent } from "@/lib/claude"

export const maxDuration = 300

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "ap2026admin"

async function parsePrompt(prompt: string): Promise<{
  name: string; type: string; location: string; phone: string; website: string
  brandColor: string; tagline: string; services: string[]; description: string
  needsMoreInfo: boolean; questions: string[]
}> {
  const result = await runAgent(
    `Extract website build parameters from a free-form description. Return ONLY valid JSON — no markdown, no explanation.
If the business name is completely missing or ambiguous, set needsMoreInfo: true with one clarifying question.
Otherwise extract everything and make smart inferences. Choose a premium brand color that authentically fits the industry.`,
    `User said: "${prompt}"

Return this JSON:
{
  "name": "business name (required)",
  "type": "business type (e.g. Roofing Company, HVAC, Law Firm, Gym, Restaurant, Dental, Real Estate)",
  "location": "city and state or empty string",
  "phone": "phone number or empty string",
  "website": "existing website URL or empty string",
  "brandColor": "#hex — premium color that fits the industry (not generic blue)",
  "tagline": "short powerful tagline or empty string",
  "services": ["service 1", "service 2", "service 3", "service 4"],
  "description": "2-3 sentence business description for content generation",
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

      // Don't retry auth or invalid request errors
      if (lower.includes("401") || lower.includes("invalid") || lower.includes("api key")) {
        throw lastError
      }

      if (attempt < maxAttempts) {
        const delay = lower.includes("rate") || lower.includes("429") ? 12000 : 4000
        await new Promise(r => setTimeout(r, delay))
      }
    }
  }

  throw lastError
}

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

  const prompt = String(body.prompt ?? "").trim()
  if (!prompt) {
    return Response.json({ error: "Describe the website you want to build" }, { status: 400 })
  }

  try {
    // Step 1: Parse the free-form description
    const parsed = await parsePrompt(prompt)

    // Step 2: Ask for business name if missing
    if (parsed.needsMoreInfo || !parsed.name) {
      return Response.json({
        needsMoreInfo: true,
        questions: parsed.questions.length > 0
          ? parsed.questions
          : ["What is the name of the business you want a website for?"],
      })
    }

    // Step 3: Generate the site (with retry on transient errors)
    const result = await generateWithRetry({
      business: {
        name:        parsed.name,
        type:        parsed.type,
        description: parsed.description,
        location:    parsed.location,
        phone:       parsed.phone    || null,
        website:     parsed.website  || null,
      },
      brandVoice:  {},
      brandColor:  parsed.brandColor,
      services:    parsed.services.length > 0 ? parsed.services : [`${parsed.type} Services`],
      tagline:     parsed.tagline || undefined,
      reviews:     [],
    })

    return Response.json({
      needsMoreInfo: false,
      html:          result.html,
      title:         result.title,
      slug:          result.slug,
      parsed,
    })
  } catch (err) {
    console.error("[admin/generate-site]", err)
    const msg   = err instanceof Error ? err.message : String(err)
    const lower = msg.toLowerCase()

    let userMessage: string
    if (lower.includes("rate") || lower.includes("429")) {
      userMessage = "Rate limit reached. Please wait 30 seconds and try again."
    } else if (lower.includes("401") || lower.includes("api key") || lower.includes("unauthorized")) {
      userMessage = "AI provider not configured. Ask admin to set the ANTHROPIC_API_KEY in Vercel."
    } else if (lower.includes("no html") || lower.includes("output limit")) {
      userMessage = "The AI couldn't fit the full website in one response. Try again — it usually succeeds on the second attempt."
    } else if (lower.includes("timeout") || lower.includes("timed out")) {
      userMessage = "Generation timed out. Try again."
    } else if (lower.includes("json") || lower.includes("parse")) {
      userMessage = "The AI produced unexpected output. Try again with more specific details."
    } else {
      userMessage = `Generation failed: ${msg.slice(0, 200)}`
    }

    return Response.json({ error: userMessage }, { status: 500 })
  }
}
