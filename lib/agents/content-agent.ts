import { runAgent } from "@/lib/claude"
import { prisma } from "@/lib/prisma"
import type { Business } from "@/app/generated/prisma/client"

const SYSTEM_PROMPT = `You are a world-class social media strategist and copywriter. You write content that stops the scroll, builds trust, and drives action. You never write generic posts. Every post has a specific hook, a clear point, and a reason to engage.

Rules:
- Open with a scroll-stopping first line — a bold claim, a question, a number, or a surprising fact
- Write like a real human, not a corporation
- Every post must serve ONE purpose: educate, entertain, inspire, promote, or build social proof
- Match platform conventions exactly
- Return valid JSON only`

const PLATFORM_RULES: Record<string, string> = {
  Instagram: "Caption up to 2,200 chars. Hook in first line (appears before 'more'). 3–5 line breaks for readability. 5–10 hashtags. End with a question or CTA.",
  Facebook: "Conversational, longer-form okay. Tell a story. Ask a question to drive comments. 1–3 hashtags max.",
  LinkedIn: "Professional but personal. Lead with a surprising insight or contrarian take. Use line breaks. No hashtag spam — 3 max.",
  Twitter: "Under 280 chars. Punchy. One idea. Hashtag only if it adds context.",
  TikTok: "Write a video script hook — first 3 seconds must stop the scroll. Conversational, trend-aware, energetic.",
  Google: "Under 1,500 chars. Promote offers, events, or news. Include your location and a call-to-action.",
}

const CONTENT_TYPES = [
  "educational — teach your audience something useful",
  "social proof — share a win, result, or transformation",
  "behind-the-scenes — show how the work gets done",
  "promotional — announce an offer, discount, or service",
  "engagement — ask a question that invites a real answer",
]

export async function generateSocialPosts(business: Business, platform: string, count: number) {
  const brandVoice = business.brandVoice as Record<string, unknown>
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
  const platformRule = PLATFORM_RULES[platform] ?? "Keep it concise and on-brand."

  const recentContent = await prisma.content.findMany({
    where: { businessId: business.id },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { body: true },
  })

  const recentBodies = recentContent.map((c: { body: string }) => c.body.slice(0, 100)).join(" | ")

  const user = `Generate ${count} ${platform} posts for ${business.name}, a ${business.type} in ${business.location}.

Brand voice: ${JSON.stringify(brandVoice)}
Today: ${today}
Platform rules: ${platformRule}
Content type mix to use: ${CONTENT_TYPES.slice(0, count).join("; ")}
Avoid repeating topics from: ${recentBodies || "nothing yet"}

For each post include a strong scroll-stopping hook. Vary the content types.

Return JSON array:
[{
  "body": "full post text",
  "hashtags": ["tag1", "tag2"],
  "bestTime": "e.g. Tuesday 7pm",
  "contentType": "educational|social_proof|behind_scenes|promotional|engagement",
  "hook": "the opening line"
}]`

  return (await runAgent(SYSTEM_PROMPT, user, { jsonMode: true, maxTokens: 3000 })) as unknown as Array<{
    body: string
    hashtags: string[]
    bestTime: string
    contentType: string
    hook: string
  }>
}

export async function generateContentCalendar(business: Business, platform: string, weeks: number) {
  const brandVoice = business.brandVoice as Record<string, unknown>

  const user = `Create a ${weeks}-week content calendar for ${business.name}, a ${business.type} in ${business.location}.
Brand voice: ${JSON.stringify(brandVoice)}
Platform: ${platform}

Each week should have 3 posts with varied content types (educational, promotional, engagement).
Include specific themes, hooks, and best posting days.

Return JSON:
{
  "weeks": [{
    "weekNumber": 1,
    "theme": "string",
    "posts": [{
      "day": "Monday",
      "contentType": "string",
      "hook": "string",
      "outline": "string",
      "bestTime": "string"
    }]
  }]
}`

  return (await runAgent(SYSTEM_PROMPT, user, { jsonMode: true, maxTokens: 3000 })) as unknown as {
    weeks: Array<{
      weekNumber: number
      theme: string
      posts: Array<{ day: string; contentType: string; hook: string; outline: string; bestTime: string }>
    }>
  }
}

export async function generateEmailNewsletter(business: Business) {
  const brandVoice = business.brandVoice as Record<string, unknown>

  const user = `Write a monthly email newsletter for ${business.name}, a ${business.type} in ${business.location}.
Brand voice: ${JSON.stringify(brandVoice)}

Structure: compelling subject line, personal opener, one valuable piece of content (tip/story/update), a soft offer or CTA, and a warm close.
Write like a trusted local expert, not a corporation.

Return JSON: { "subject": "string", "previewText": "string (45 chars max)", "body": "string (HTML)" }`

  return (await runAgent(SYSTEM_PROMPT, user, { jsonMode: true, maxTokens: 3000 })) as {
    subject: string
    previewText: string
    body: string
  }
}

export async function generateSMSCampaign(business: Business, goal: string) {
  const brandVoice = business.brandVoice as Record<string, unknown>

  const user = `Write an SMS campaign for ${business.name}, a ${business.type}.
Goal: ${goal}
Brand voice: ${JSON.stringify(brandVoice)}

Rules: under 160 chars, immediate value, one clear action, include business name, no spam triggers.
Return JSON: { "body": "string", "charCount": number, "cta": "string" }`

  return (await runAgent(SYSTEM_PROMPT, user, { jsonMode: true })) as {
    body: string
    charCount: number
    cta: string
  }
}
