import { runAgent } from "@/lib/claude"

export async function handleSupportQuery(params: {
  businessName: string
  businessType: string
  brandVoice: Record<string, unknown>
  faq: string
  query: string
}): Promise<{ response: string; shouldEscalate: boolean }> {
  const SYSTEM_PROMPT = `You are a friendly customer support agent for ${params.businessName}.
Answer questions using the provided FAQ. If the query involves a complaint, refund request, legal mention, or something not in the FAQ, set shouldEscalate to true.
Respond with JSON only: { "response": "string", "shouldEscalate": boolean }`

  const user = `FAQ/Business Info:
${params.faq}

Customer query: "${params.query}"`

  return (await runAgent(SYSTEM_PROMPT, user, { jsonMode: true })) as {
    response: string
    shouldEscalate: boolean
  }
}
