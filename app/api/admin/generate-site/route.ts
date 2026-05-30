import { NextRequest } from "next/server"
import { generateWebsite } from "@/lib/agents/website-agent"
import { db } from "@/lib/db"

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "ap2026admin"

export async function POST(request: NextRequest) {
  const pw = request.headers.get("x-admin-password")
  if (pw !== ADMIN_PASSWORD) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const {
      name, type, description = "", location = "", phone = "", website = "",
      brandColor = "#6366f1", tagline, services = [], save = false,
    } = body

    if (!name?.trim()) return Response.json({ error: "Business name required" }, { status: 400 })

    const result = await generateWebsite({
      business: { name: name.trim(), type: type?.trim() || "Business", description, location, phone, website },
      brandVoice: {},
      brandColor,
      services: Array.isArray(services) && services.length > 0
        ? services
        : ["Our Services"],
      tagline: tagline?.trim() || undefined,
      reviews: [],
    })

    // Optionally save to Site table (no businessId needed for admin builds)
    let savedId: string | null = null
    if (save) {
      try {
        const existing = await db.site.findFirst({ where: { slug: result.slug } })
        if (!existing) {
          const saved = await db.site.create({
            data: {
              businessId: "admin",   // sentinel value — no user business required
              slug:       result.slug,
              title:      result.title,
              html:       result.html,
              published:  false,
            },
          }) as Record<string, unknown>
          savedId = saved?.id as string ?? null
        }
      } catch {
        // Save failure is non-blocking — HTML is still returned
      }
    }

    return Response.json({ html: result.html, title: result.title, slug: result.slug, savedId })
  } catch (err) {
    console.error("[admin/generate-site]", err)
    return Response.json({ error: err instanceof Error ? err.message : "Generation failed" }, { status: 500 })
  }
}
