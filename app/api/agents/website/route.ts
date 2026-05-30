import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { generateWebsite } from "@/lib/agents/website-agent"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const { businessId, brandColor, services, tagline } = body

    if (!businessId) return Response.json({ error: "businessId required" }, { status: 400 })

    const business = await prisma.business.findFirst({
      where: { id: businessId, userId: user.id },
      include: {
        reviews: { take: 5, orderBy: { rating: "desc" }, select: { reviewerName: true, rating: true, reviewText: true } },
      },
    })
    if (!business) return Response.json({ error: "Business not found" }, { status: 404 })

    const brandVoice = business.brandVoice as Record<string, unknown>
    const serviceList: string[] = Array.isArray(services) && services.length > 0
      ? services
      : (brandVoice?.keyServices as string[] | undefined) ?? ["Our Services"]

    const result = await generateWebsite({
      business: {
        name:        business.name,
        type:        business.type,
        description: business.description,
        location:    business.location,
        phone:       business.phone,
        website:     business.website,
      },
      brandVoice,
      brandColor: brandColor ?? "#6366f1",
      services:   serviceList,
      tagline:    tagline ?? undefined,
      reviews:    business.reviews,
    })

    const saved = await prisma.site.create({
      data: {
        businessId,
        slug:      result.slug,
        title:     result.title,
        html:      result.html,
        published: false,
      },
    })

    return Response.json({ site: saved, slug: result.slug, title: result.title })
  } catch (err) {
    console.error("[website-agent]", err)
    return Response.json({ error: "Failed to generate website" }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const businessId = searchParams.get("businessId")
    if (!businessId) return Response.json({ error: "businessId required" }, { status: 400 })

    const business = await prisma.business.findFirst({ where: { id: businessId, userId: user.id } })
    if (!business) return Response.json({ error: "Not found" }, { status: 404 })

    const sites = await prisma.site.findMany({
      where: { businessId },
      orderBy: { createdAt: "desc" },
    })

    return Response.json({ sites })
  } catch (err) {
    console.error("[website-agent GET]", err)
    return Response.json({ error: "Failed to fetch sites" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const { siteId, published } = body

    const site = await prisma.site.findFirst({
      where: { id: siteId },
      include: { business: { select: { userId: true } } },
    })
    if (!site || !site.business || site.business.userId !== user.id) {
      return Response.json({ error: "Not found" }, { status: 404 })
    }

    const updated = await prisma.site.update({
      where: { id: siteId },
      data: { published },
    })

    return Response.json({ site: updated })
  } catch (err) {
    console.error("[website-agent PATCH]", err)
    return Response.json({ error: "Failed to update site" }, { status: 500 })
  }
}
