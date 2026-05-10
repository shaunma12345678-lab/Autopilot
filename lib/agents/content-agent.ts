import { runAgent } from "@/lib/claude"
import { prisma } from "@/lib/prisma"
import type { Business } from "@/app/generated/prisma"

const SYSTEM_PROMPT = `You are an expert marketing copywriter. Always respond with valid JSON only. No preamble, no explanation, just the JSON array.`

export async function generateSocialPosts(business: Business, platform: string, count: number) {
  const brandVoice = business.brandVoice as Record<string, unknown>
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })

  const recentContent = await prisma.content.findMany({
    where: { businessId: business.id },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { body: true },
  })

  const recentBodies = recentContent.map((c: { body: string }) => c.body.slice(0, 80)).join(" | ")

  const user = `Generate ${count} ${platform} posts for ${business.name}, a ${business.type} in ${business.location}.
Brand voice: ${JSON.stringify(brandVoice)}
Today: ${today}
Avoid repeating: ${recentBodies || "nothing yet"}
Return JSON array: [{ "body": "string", "hashtags": ["string"], "bestTime": "string" }]`

  return (await runAgent(SYSTEM_PROMPT, user, { jsonMode: true })) as unknown as Array<{
    body: string
    hashtags: string[]
    bestTime: string
  }>
}

export async function generateEmailNewsletter(business: Business) {
  const brandVoice = business.brandVoice as Record<string, unknown>

  const user = `Write a monthly email newsletter for ${business.name}, a ${business.type} in ${business.location}.
Brand voice: ${JSON.stringify(brandVoice)}
Return JSON: { "subject": "string", "body": "string (HTML allowed)" }`

  return (await runAgent(SYSTEM_PROMPT, user, { jsonMode: true })) as {
    subject: string
    body: string
  }
}

export async function generateSMSCampaign(business: Business, goal: string) {
  const brandVoice = business.brandVoice as Record<string, unknown>

  const user = `Write an SMS campaign for ${business.name}, a ${business.type}.
Goal: ${goal}
Brand voice: ${JSON.stringify(brandVoice)}
Return JSON: { "body": "string (under 160 chars)" }`

  return (await runAgent(SYSTEM_PROMPT, user, { jsonMode: true })) as { body: string }
}
