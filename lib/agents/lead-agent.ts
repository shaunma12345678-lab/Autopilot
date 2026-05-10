import { runAgent } from "@/lib/claude"

const SYSTEM_PROMPT = `You are an expert cold outreach copywriter. Return valid JSON only.`

export async function generateLeadOutreach(params: {
  senderBusiness: string
  senderType: string
  leadName: string
  leadCompany: string
  leadIndustry: string
  hook: string
}): Promise<{ subject: string; body: string }> {
  const user = `Write a personalized cold email for:
Sender: ${params.senderBusiness} (${params.senderType})
Lead: ${params.leadName} at ${params.leadCompany} (${params.leadIndustry})
Hook: ${params.hook}

Under 100 words. Human and genuine. Single soft CTA (15-min call).
Return JSON: { "subject": "string", "body": "string" }`

  return (await runAgent(SYSTEM_PROMPT, user, { jsonMode: true })) as {
    subject: string
    body: string
  }
}
