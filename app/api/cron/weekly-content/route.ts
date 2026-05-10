import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { generateSocialPosts, generateEmailNewsletter } from "@/lib/agents/content-agent"
import { sendContentReadyEmail } from "@/lib/email"

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const businesses = await prisma.business.findMany({
    include: { user: true },
  })

  let totalGenerated = 0

  for (const business of businesses) {
    try {
      const posts = await generateSocialPosts(business, "Instagram", 7)
      await prisma.content.createMany({
        data: posts.map((post) => ({
          businessId: business.id,
          type: "SOCIAL_POST" as const,
          platform: "Instagram",
          body: post.body,
          hashtags: post.hashtags,
          status: "PENDING" as const,
        })),
      })

      const newsletter = await generateEmailNewsletter(business)
      await prisma.content.create({
        data: {
          businessId: business.id,
          type: "EMAIL",
          platform: "Email",
          body: newsletter.body,
          hashtags: [],
          status: "PENDING",
        },
      })

      const count = posts.length + 1
      totalGenerated += count
      await sendContentReadyEmail(business.user.email, business.name, count).catch(() => {})
    } catch (err) {
      console.error(`[weekly-content] failed for business ${business.id}`, err)
    }
  }

  return Response.json({ success: true, totalGenerated, businesses: businesses.length })
}
