import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { generateSocialPosts, generateEmailNewsletter } from "@/lib/agents/content-agent"
import { sendContentReadyEmail } from "@/lib/email"


export async function POST(request: NextRequest) {
  try {
  const _supabase = await createSupabaseServerClient()
  const { data: { user: _sessionUser } } = await _supabase.auth.getUser()
  const user = _sessionUser ?? await prisma.user.findFirst()
  if (!user) return Response.json({ error: "Service unavailable" }, { status: 503 })
    const body = await request.json()
    const { businessId, contentType, platform, count = 3 } = body

    const business = await prisma.business.findFirst({
      where: { id: businessId },
    })
    if (!business) return Response.json({ error: "Business not found" }, { status: 404 })

    let generated: Array<{ body: string; hashtags?: string[] }> = []

    if (contentType === "EMAIL") {
      const newsletter = await generateEmailNewsletter(business)
      generated = [{ body: newsletter.body }]
    } else {
      const posts = await generateSocialPosts(business, platform ?? "Instagram", count)
      generated = posts
    }

    const created = await prisma.content.createMany({
      data: generated.map((item) => ({
        businessId,
        type: contentType ?? "SOCIAL_POST",
        platform: platform ?? "Instagram",
        body: item.body,
        hashtags: item.hashtags ?? [],
        status: "PENDING",
      })),
    })

    const dbUser = await prisma.user.findUnique({ where: { id: user.id } })
    if (dbUser) {
      await sendContentReadyEmail(dbUser.email, business.name, created.count).catch(() => {})
    }

    return Response.json({ count: created.count, message: "Content generated successfully" })
  } catch (err) {
    console.error("[content-agent]", err)
    return Response.json({ error: "Failed to generate content" }, { status: 500 })
  }
}


export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const businessId = searchParams.get("businessId")
    const status = searchParams.get("status")

    if (!businessId) return Response.json({ error: "businessId required" }, { status: 400 })

    const business = await prisma.business.findFirst({
      where: { id: businessId },
    })
    if (!business) return Response.json({ error: "Business not found" }, { status: 404 })

    const content = await prisma.content.findMany({
      where: {
        businessId,
        ...(status ? { status: status as "PENDING" | "APPROVED" | "REJECTED" | "POSTED" } : {}),
      },
      orderBy: { createdAt: "desc" },
    })

    return Response.json({ content })
  } catch (err) {
    console.error("[content-agent GET]", err)
    return Response.json({ error: "Failed to fetch content" }, { status: 500 })
  }
}


export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, status, editedBody } = body

    const content = await prisma.content.findFirst({
      where: { id },
      include: { business: true },
    })
    if (!content) {
      return Response.json({ error: "Not found" }, { status: 404 })
    }

    const updated = await prisma.content.update({
      where: { id },
      data: {
        status,
        ...(editedBody ? { body: editedBody } : {}),
        ...(status === "POSTED" ? { postedAt: new Date() } : {}),
      },
    })

    return Response.json({ content: updated })
  } catch (err) {
    console.error("[content-agent PATCH]", err)
    return Response.json({ error: "Failed to update content" }, { status: 500 })
  }
}
