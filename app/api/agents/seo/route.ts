import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { generateBlogPost, generateKeywordStrategy } from "@/lib/agents/seo-agent"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const { businessId, action, keyword, wordCount } = body

    const business = await prisma.business.findFirst({
      where: { id: businessId, userId: user.id },
    })
    if (!business) return Response.json({ error: "Business not found" }, { status: 404 })

    const brandVoice = business.brandVoice as Record<string, unknown>

    if (action === "keyword-strategy") {
      const strategy = await generateKeywordStrategy({
        businessName: business.name,
        businessType: business.type,
        location:     business.location,
      })
      return Response.json({ strategy })
    }

    if (!keyword) return Response.json({ error: "keyword required" }, { status: 400 })

    const post = await generateBlogPost({
      businessName: business.name,
      businessType: business.type,
      location:     business.location,
      brandVoice,
      keyword,
      wordCount:    wordCount ?? 1200,
    })

    const created = await prisma.content.create({
      data: {
        businessId,
        type:     "BLOG_POST",
        platform: "Website",
        body:     `# ${post.title}\n\n${post.body}`,
        hashtags: post.internalLinks,
        status:   "PENDING",
      },
    })

    return Response.json({ content: created, post })
  } catch (err) {
    console.error("[seo-agent]", err)
    return Response.json({ error: "Failed to generate SEO content" }, { status: 500 })
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

    const posts = await prisma.content.findMany({
      where: { businessId, type: "BLOG_POST" },
      orderBy: { createdAt: "desc" },
      take: 20,
    })

    return Response.json({ posts })
  } catch (err) {
    console.error("[seo-agent GET]", err)
    return Response.json({ error: "Failed to fetch SEO content" }, { status: 500 })
  }
}
