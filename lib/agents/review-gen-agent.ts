import { runAgent } from "@/lib/claude"

const SYSTEM_PROMPT = `You are a reputation marketing expert who has helped businesses go from 3.2 to 4.8 stars on Google. You know exactly what to say, when to ask, and how to make it easy for happy customers to leave reviews — while preventing upset customers from posting publicly.

Rules:
- Review requests must feel personal, not automated
- Timing is everything — always ask at the peak of satisfaction
- Give customers a reason AND a clear path (frictionless)
- Negative feedback must be captured privately before it goes public
- Return valid JSON only`

export async function generateReviewCampaign(params: {
  businessName: string
  businessType: string
  currentRating?: number
  currentReviewCount?: number
  primaryPlatform: string
  reviewPageUrl?: string
}): Promise<{
  strategy: string
  askMoments: Array<{ trigger: string; channel: string; timing: string; why: string }>
  emailSequence: Array<{
    version: string
    subject: string
    body: string
    cta: string
    bestForSegment: string
  }>
  smsTemplates: Array<{ version: string; message: string; bestFor: string }>
  inPersonScript: { opener: string; ask: string; responseToYes: string; responseToHesitation: string }
  negativeFilterSystem: {
    preScreenQuestion: string
    unhappyCustomerPath: string
    happyCustomerPath: string
    followUpIfNegative: string
  }
  goalTimeline: Array<{ timeframe: string; targetReviews: number; targetRating: string; tactics: string[] }>
}> {
  const user = `Build a complete review generation system for ${params.businessName} (${params.businessType}).

Current status: ${params.currentRating ? `${params.currentRating} stars` : "Unknown"} with ${params.currentReviewCount ?? "unknown"} reviews
Primary platform: ${params.primaryPlatform}
Review page URL: ${params.reviewPageUrl ?? "To be set up"}

Design a system that:
- Identifies the best moments to ask (post-service peaks)
- Has email sequence with 3 variants (personal, professional, brief)
- Includes 3 SMS templates for different situations
- Has an in-person ask script with objection handling
- Filters unhappy customers to private feedback BEFORE they post publicly
- Sets a realistic 90-day growth timeline with milestones

Return JSON with: strategy, askMoments, emailSequence, smsTemplates, inPersonScript, negativeFilterSystem, goalTimeline`

  return (await runAgent(SYSTEM_PROMPT, user, { jsonMode: true, maxTokens: 3500 })) as ReturnType<typeof generateReviewCampaign> extends Promise<infer T> ? T : never
}

export async function generateReviewRequestTemplates(params: {
  businessName: string
  businessType: string
  platform: string
  ownerName?: string
}): Promise<{
  templates: Array<{
    channel: "email" | "sms" | "in-person" | "receipt" | "card"
    tone: "warm" | "professional" | "brief"
    message: string
    qrPlaceholder?: boolean
  }>
  followUpMessages: Array<{ dayAfter: number; message: string; channel: string }>
  dontDoList: string[]
}> {
  const user = `Write review request templates for ${params.businessName} (${params.businessType}).

Target platform: ${params.platform}
Business owner name: ${params.ownerName ?? "the owner"}

Create templates for 5 channels: email, SMS, in-person verbal, printed receipt insert, and thank-you card.
For each: 3 tone variations (warm/personal, professional, brief).

Include:
- 3 follow-up messages (sent after 2, 5, and 10 days if no review)
- "Never do" list — 10 things that get Google reviews removed or hurt credibility

Return JSON with: templates, followUpMessages, dontDoList`

  return (await runAgent(SYSTEM_PROMPT, user, { jsonMode: true, maxTokens: 2500 })) as ReturnType<typeof generateReviewRequestTemplates> extends Promise<infer T> ? T : never
}
