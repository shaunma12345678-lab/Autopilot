import { runAgent } from "@/lib/claude"

const SYSTEM_PROMPT = `You are an expert customer service manager. Always respond with plain text only — the review response itself, nothing else. No quotes around the response.`

export async function generateReviewResponse(params: {
  businessName: string
  brandVoice: Record<string, unknown>
  rating: number
  reviewText: string
  reviewerName: string
}): Promise<string> {
  const tone =
    params.rating >= 4 ? "warm and grateful" :
    params.rating === 3 ? "understanding and constructive" :
    "professional, empathetic, and solution-focused"

  const instructions =
    params.rating <= 2
      ? "Do not admit fault or offer refunds. Acknowledge their experience and invite them to contact you directly to resolve the issue."
      : "Thank them warmly and invite them to return."

  const user = `Write a ${tone} response to this ${params.rating}-star review for ${params.businessName}.
Reviewer name: ${params.reviewerName}
Review: "${params.reviewText}"
Brand voice: ${JSON.stringify(params.brandVoice)}
Instructions: ${instructions}
Keep it under 150 words. Address them by first name.`

  return (await runAgent(SYSTEM_PROMPT, user)) as string
}
