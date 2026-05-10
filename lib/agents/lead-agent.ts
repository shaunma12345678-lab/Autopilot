import { runAgent } from "@/lib/claude"

const SYSTEM_PROMPT = `You are an expert B2B sales development rep and cold outreach specialist. You write messages that get replies — not because they're clever, but because they're specific, human, and relevant. You never use templates that smell like templates.

Rules:
- Open with something specific to THEM — not a generic compliment
- Lead with value or a relevant observation, not a pitch
- Keep emails under 100 words. Under 300 for sequences.
- One soft CTA only — a question or a 15-min call ask
- Write like a thoughtful human, not a sales bot
- Return valid JSON only`

export async function generateLeadOutreach(params: {
  senderBusiness: string
  senderType: string
  leadName: string
  leadCompany: string
  leadIndustry: string
  hook: string
}): Promise<{
  subject: string
  body: string
  followUp1: { subject: string; body: string; sendDay: number }
  followUp2: { subject: string; body: string; sendDay: number }
  linkedInMessage: string
  score: number
  scoreReason: string
}> {
  const user = `Create a complete outreach sequence for this lead.

Sender: ${params.senderBusiness} (${params.senderType})
Lead: ${params.leadName} at ${params.leadCompany} (${params.leadIndustry})
Hook / reason for reaching out: ${params.hook}

Generate:
1. Initial cold email (under 100 words, specific to their industry)
2. Follow-up #1 (day 3 — add value, reference the first email briefly)
3. Follow-up #2 (day 7 — soft breakup email, light humor okay)
4. LinkedIn connection message (under 300 chars)
5. Lead score 0-100 based on: industry relevance, company size signal from name, hook quality
6. One-line reason for the score

Return JSON:
{
  "subject": "string",
  "body": "string",
  "followUp1": { "subject": "string", "body": "string", "sendDay": 3 },
  "followUp2": { "subject": "string", "body": "string", "sendDay": 7 },
  "linkedInMessage": "string",
  "score": number,
  "scoreReason": "string"
}`

  return (await runAgent(SYSTEM_PROMPT, user, { jsonMode: true, maxTokens: 2500 })) as ReturnType<typeof generateLeadOutreach> extends Promise<infer T> ? T : never
}

export async function scoreLeads(leads: Array<{
  id: string
  name: string
  source: string
  notes?: string | null
  industry?: string
}>): Promise<Array<{ id: string; score: number; priority: "hot" | "warm" | "cold"; reason: string }>> {
  const SCORE_PROMPT = `You are a sales ops expert. Score leads by conversion likelihood. Return valid JSON only.`

  const user = `Score these leads 0-100 for conversion likelihood. Consider: source quality, notes content, industry relevance.

Leads: ${JSON.stringify(leads)}

Return JSON array:
[{
  "id": "string",
  "score": number,
  "priority": "hot (80+) | warm (50-79) | cold (under 50)",
  "reason": "one sentence"
}]`

  return (await runAgent(SCORE_PROMPT, user, { jsonMode: true }) as unknown) as ReturnType<typeof scoreLeads> extends Promise<infer T> ? T : never
}
