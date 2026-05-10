import { runAgent } from "@/lib/claude"

export type EscalationReason = "complaint" | "refund" | "legal" | "not_in_faq" | "angry" | "none"

export async function handleSupportQuery(params: {
  businessName: string
  businessType: string
  brandVoice: Record<string, unknown>
  faq: string
  query: string
  conversationHistory?: Array<{ role: "customer" | "agent"; message: string }>
}): Promise<{
  response: string
  shouldEscalate: boolean
  escalationReason: EscalationReason
  confidence: number
  suggestedFollowUp?: string
}> {
  const SYSTEM_PROMPT = `You are a friendly, knowledgeable customer support agent for ${params.businessName}, a ${params.businessType}. You represent the brand professionally and warmly.

Rules:
- Answer from the FAQ when possible — be specific, not generic
- If you don't know, say so honestly and offer to find out
- Never make promises about refunds, policies, or timelines not in the FAQ
- Match the customer's energy — calm if they're calm, extra empathetic if they're frustrated
- Keep responses concise — under 100 words unless the question genuinely requires more
- Escalate if: complaint about staff/service, refund request, legal mention, anger, or query not in FAQ
- Return valid JSON only`

  const history = params.conversationHistory
    ?.map(m => `${m.role === "customer" ? "Customer" : "Agent"}: ${m.message}`)
    .join("\n") ?? ""

  const user = `FAQ and business info:
${params.faq}

${history ? `Previous messages:\n${history}\n` : ""}Customer message: "${params.query}"

Determine:
1. Can this be answered from the FAQ? If yes, answer it specifically.
2. Should this be escalated? Check for: complaint, refund request, legal mention, anger signals, or anything not in FAQ.
3. Confidence score 0-100 in your answer's accuracy.
4. Optional: a follow-up question to better help the customer.

Return JSON:
{
  "response": "string",
  "shouldEscalate": boolean,
  "escalationReason": "complaint|refund|legal|not_in_faq|angry|none",
  "confidence": number,
  "suggestedFollowUp": "string or null"
}`

  return (await runAgent(SYSTEM_PROMPT, user, { jsonMode: true })) as ReturnType<typeof handleSupportQuery> extends Promise<infer T> ? T : never
}

export async function generateFAQ(params: {
  businessName: string
  businessType: string
  location: string
  services: string[]
}): Promise<Array<{ question: string; answer: string; category: string }>> {
  const SYSTEM_PROMPT = `You are a customer experience expert. Generate realistic FAQs that cover what customers actually ask — not what businesses wish they'd ask. Return valid JSON only.`

  const user = `Generate 15 realistic FAQs for ${params.businessName}, a ${params.businessType} in ${params.location}.

Services: ${params.services.join(", ")}

Cover: pricing questions, hours/availability, how it works, what to expect, comparisons, and common concerns.
Write answers in first person ("We...") as if the business owner is speaking.

Return JSON array:
[{ "question": "string", "answer": "string (2-4 sentences)", "category": "pricing|availability|process|policies|general" }]`

  return (await runAgent(SYSTEM_PROMPT, user, { jsonMode: true, maxTokens: 3000 }) as unknown) as ReturnType<typeof generateFAQ> extends Promise<infer T> ? T : never
}
