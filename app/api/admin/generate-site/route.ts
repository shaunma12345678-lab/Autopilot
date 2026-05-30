import { NextRequest } from "next/server"
import { generateWebsite } from "@/lib/agents/website-agent"
import { runAgent } from "@/lib/claude"
import { db } from "@/lib/db"

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "ap2026admin"

// Parse a free-form description into structured website params
async function parseDescription(description: string): Promise<{
  name: string; type: string; location: string; phone: string; website: string
  brandColor: string; tagline: string; services: string[]; description: string
  needsMoreInfo: boolean; questions: string[]
}> {
  const result = await runAgent(
    `You extract website build parameters from a user's description.
Return ONLY valid JSON — no markdown, no explanation.
If critical info is missing (business name), set needsMoreInfo: true and list questions.
Otherwise extract everything available and set needsMoreInfo: false.
Choose a brand color that fits the business type if not specified.`,
    `User description: "${description}"

Return JSON:
{
  "name": "business name (required)",
  "type": "type of business (e.g. HVAC Company, Bakery, Law Firm)",
  "location": "city/state or empty string",
  "phone": "phone number or empty string",
  "website": "existing website URL or empty string",
  "brandColor": "#hex color that fits the brand (required — pick something appropriate)",
  "tagline": "tagline or empty string",
  "services": ["service 1", "service 2"],
  "description": "brief business description for content generation",
  "needsMoreInfo": false,
  "questions": []
}`,
    { jsonMode: true, model: "haiku", maxTokens: 512 }
  ) as Record<string, unknown>

  return {
    name:          String(result.name ?? ""),
    type:          String(result.type ?? "Business"),
    location:      String(result.location ?? ""),
    phone:         String(result.phone ?? ""),
    website:       String(result.website ?? ""),
    brandColor:    String(result.brandColor ?? "#6366f1"),
    tagline:       String(result.tagline ?? ""),
    services:      Array.isArray(result.services) ? result.services.map(String) : [],
    description:   String(result.description ?? ""),
    needsMoreInfo: Boolean(result.needsMoreInfo),
    questions:     Array.isArray(result.questions) ? result.questions.map(String) : [],
  }
}

export async function POST(request: NextRequest) {
  const pw = request.headers.get("x-admin-password")
  if (pw !== ADMIN_PASSWORD) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { prompt, save = true } = body

    if (!prompt?.trim()) return Response.json({ error: "Describe what you want to build" }, { status: 400 })

    // Parse the free-form description
    const parsed = await parseDescription(prompt.trim())

    // If we need more info, return questions instead of generating
    if (parsed.needsMoreInfo || !parsed.name) {
      return Response.json({
        needsMoreInfo: true,
        questions: parsed.questions.length > 0
          ? parsed.questions
          : ["What is the name of the business?"],
      })
    }

    // Generate the full website with Claude (Anthropic key is now in production)
    const result = await generateWebsite({
      business: {
        name:        parsed.name,
        type:        parsed.type,
        description: parsed.description,
        location:    parsed.location,
        phone:       parsed.phone,
        website:     parsed.website,
      },
      brandVoice:  {},
      brandColor:  parsed.brandColor,
      services:    parsed.services.length > 0 ? parsed.services : ["Our Services"],
      tagline:     parsed.tagline || undefined,
      reviews:     [],
    })

    // Save to Site table
    let savedId: string | null = null
    if (save) {
      try {
        const slug = `${result.slug}-${Date.now()}`
        const saved = await db.site.create({
          data: {
            businessId: "admin",
            slug,
            title:     result.title,
            html:      result.html,
            published: false,
          },
        }) as Record<string, unknown>
        savedId = saved?.id as string ?? null
      } catch { /* non-blocking */ }
    }

    return Response.json({
      needsMoreInfo: false,
      html:          result.html,
      title:         result.title,
      slug:          result.slug,
      savedId,
      parsed,
    })
  } catch (err) {
    console.error("[admin/generate-site]", err)
    return Response.json({ error: err instanceof Error ? err.message : "Generation failed" }, { status: 500 })
  }
}
