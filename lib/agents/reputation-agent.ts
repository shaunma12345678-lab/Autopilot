import { runAgent } from "@/lib/claude"

const SYSTEM_PROMPT = `You are a senior customer experience manager with 15 years of experience turning unhappy customers into loyal ones. You write review responses that are genuine, specific, and brand-appropriate.

Rules:
- Never use corporate speak or templates that sound copy-pasted
- Always address the reviewer by first name
- Reference something specific from their review — never respond generically
- Never admit liability, offer refunds, or make promises in public responses
- For negative reviews: acknowledge → empathize → invite offline resolution
- For positive reviews: be warm, specific, invite them back
- Keep responses under 150 words — reviewers and future customers are skimming
- Return only the response text, no preamble`

export type ReviewFlag = "legal" | "health_safety" | "fake" | "escalate" | "none"

export async function generateReviewResponse(params: {
  businessName: string
  brandVoice: Record<string, unknown>
  rating: number
  reviewText: string
  reviewerName: string
  platform?: string
}): Promise<{ response: string; flag: ReviewFlag; autoApprove: boolean }> {
  const firstName = params.reviewerName.split(" ")[0] || params.reviewerName
  const platform = params.platform ?? "Google"

  const tone =
    params.rating >= 4 ? "warm, grateful, and inviting" :
    params.rating === 3 ? "understanding, solution-oriented, and constructive" :
    "professional, empathetic, and calm — de-escalating without admitting fault"

  const strategy =
    params.rating <= 2
      ? `Acknowledge their frustration specifically. Do NOT admit fault, offer refunds, or make promises. End by inviting them to contact you directly to resolve the issue.`
      : params.rating === 3
      ? `Acknowledge the mixed experience. Highlight what you'll take away from their feedback. Invite them to give you another chance.`
      : `Thank them warmly. Reference one specific thing they mentioned. Invite them back or share with a friend.`

  const user = `Write a ${tone} ${platform} review response for ${params.businessName}.

Reviewer: ${firstName}
Rating: ${params.rating}/5
Review: "${params.reviewText}"
Brand voice: ${JSON.stringify(params.brandVoice)}
Strategy: ${strategy}

Scan the review for:
- Legal threats, lawsuits, or injury claims → flag as "legal"
- Health, food safety, or medical complaints → flag as "health_safety"
- Suspicious content (gibberish, competitor spam, impossible claims) → flag as "fake"
- Anything requiring management attention → flag as "escalate"
- Normal review → flag as "none"

Return JSON:
{
  "response": "the review response text only",
  "flag": "legal|health_safety|fake|escalate|none",
  "autoApprove": true if rating >= 4 and flag is none, else false
}`

  const result = await runAgent(SYSTEM_PROMPT, user, { jsonMode: true }) as {
    response: string
    flag: ReviewFlag
    autoApprove: boolean
  }

  return result
}

export async function analyzeReviewTrends(reviews: Array<{
  rating: number
  reviewText: string
  createdAt: Date
}>): Promise<{
  avgRating: number
  sentiment: "positive" | "mixed" | "negative"
  recurringComplaints: string[]
  recurringPraise: string[]
  recommendations: string[]
  summary: string
}> {
  const ANALYSIS_PROMPT = `You are a business analyst. Identify patterns in customer feedback. Return valid JSON only.`

  const user = `Analyze these ${reviews.length} reviews and identify meaningful patterns.
Reviews: ${JSON.stringify(reviews.map(r => ({ rating: r.rating, text: r.reviewText.slice(0, 200) })))}

Return JSON:
{
  "avgRating": number,
  "sentiment": "positive|mixed|negative",
  "recurringComplaints": ["string"],
  "recurringPraise": ["string"],
  "recommendations": ["actionable fix for each complaint"],
  "summary": "2-sentence plain-English summary of what customers think"
}`

  return (await runAgent(ANALYSIS_PROMPT, user, { jsonMode: true })) as ReturnType<typeof analyzeReviewTrends> extends Promise<infer T> ? T : never
}
