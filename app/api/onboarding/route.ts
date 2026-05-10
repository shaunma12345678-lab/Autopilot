import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { buildBrandVoice } from "@/lib/agents/onboarding-agent"
import { generateSocialPosts } from "@/lib/agents/content-agent"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const { businessInfo } = body

    const brandVoice = await buildBrandVoice(businessInfo)

    const business = await prisma.business.create({
      data: {
        userId: user.id,
        name: businessInfo.name,
        type: businessInfo.type,
        description: businessInfo.description ?? "",
        location: businessInfo.location,
        phone: businessInfo.phone,
        website: businessInfo.website,
        brandVoice: JSON.parse(JSON.stringify(brandVoice)),
        socialProfiles: {},
        activeAgents: ["content", "reputation"],
      },
    })

    const welcomePosts = await generateSocialPosts(business, "Instagram", 3)
    await prisma.content.createMany({
      data: welcomePosts.map((post) => ({
        businessId: business.id,
        type: "SOCIAL_POST" as const,
        platform: "Instagram",
        body: post.body,
        hashtags: post.hashtags,
        status: "PENDING" as const,
      })),
    })

    return Response.json({ business, brandVoice })
  } catch (err) {
    console.error("[onboarding]", err)
    return Response.json({ error: "Onboarding failed" }, { status: 500 })
  }
}
