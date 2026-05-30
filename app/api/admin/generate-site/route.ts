import { NextRequest } from "next/server"
import { generateWebsite } from "@/lib/agents/website-agent"
import { runAgent } from "@/lib/claude"

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "ap2026admin"

async function parsePrompt(prompt: string): Promise<{
  name: string; type: string; location: string; phone: string; website: string
  brandColor: string; tagline: string; services: string[]; description: string
  needsMoreInfo: boolean; questions: string[]
}> {
  const result = await runAgent(
    `Extract website build parameters from the user's description. Return ONLY valid JSON.
If the business name is completely missing, set needsMoreInfo: true.
Otherwise extract everything, set needsMoreInfo: false, and make reasonable inferences.
Pick a premium brand color hex that authentically fits the business type.`,
    `User said: "${prompt}"

Return JSON:
{
  "name": "business name (required)",
  "type": "business type (e.g. HVAC Company, Roofing, Law Firm, Gym, Restaurant)",
  "location": "city/state or empty string",
  "phone": "phone or empty string",
  "website": "existing URL or empty string",
  "brandColor": "#hex color that feels premium and fits the industry",
  "tagline": "tagline or empty string",
  "services": ["service 1", "service 2", "service 3", "service 4"],
  "description": "2-3 sentence business description for content generation",
  "needsMoreInfo": false,
  "questions": []
}`,
    { jsonMode: true, model: "haiku", maxTokens: 600 }
  ) as Record<string, unknown>

  return {
    name:          String(result.name ?? "").trim(),
    type:          String(result.type ?? "Business").trim(),
    location:      String(result.location ?? "").trim(),
    phone:         String(result.phone ?? "").trim(),
    website:       String(result.website ?? "").trim(),
    brandColor:    /^#[0-9a-fA-F]{6}$/.test(String(result.brandColor ?? "")) ? String(result.brandColor) : "#1a1a2e",
    tagline:       String(result.tagline ?? "").trim(),
    services:      Array.isArray(result.services) ? (result.services as unknown[]).map(String) : [],
    description:   String(result.description ?? "").trim(),
    needsMoreInfo: !!(result.needsMoreInfo),
    questions:     Array.isArray(result.questions) ? (result.questions as unknown[]).map(String) : [],
  }
}

export async function POST(request: NextRequest) {
  const pw = request.headers.get("x-admin-password")
  if (pw !== ADMIN_PASSWORD) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const prompt = String(body.prompt ?? "").trim()
    if (!prompt) return Response.json({ error: "Describe the website you want to build" }, { status: 400 })

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

    // Step 3: Generate the enterprise-quality website with Claude
    const result = await generateWebsite({
      business: {
        name:        parsed.name,
        type:        parsed.type,
        description: parsed.description,
        location:    parsed.location,
        phone:       parsed.phone || null,
        website:     parsed.website || null,
      },
      brandVoice:  {},
      brandColor:  parsed.brandColor,
      services:    parsed.services.length > 0 ? parsed.services : [`${parsed.type} Services`],
      tagline:     parsed.tagline || undefined,
      reviews:     [],
    })

    // Return the HTML directly — no DB save needed for admin preview/download
    return Response.json({
      needsMoreInfo: false,
      html:          result.html,
      title:         result.title,
      slug:          result.slug,
      parsed,
    })
  } catch (err) {
    console.error("[admin/generate-site]", err)
    const msg = err instanceof Error ? err.message : "Generation failed"
    return Response.json({
      error: msg.includes("JSON") || msg.includes("parse")
        ? "The AI produced unexpected output. Try again with more specific details about the business."
        : msg.includes("rate") || msg.includes("429")
        ? "Rate limit reached — please wait 30 seconds and try again."
        : msg.includes("token") || msg.includes("length")
        ? "Prompt too large — please try again."
        : `Generation failed: ${msg.slice(0, 150)}`,
    }, { status: 500 })
  }
}
