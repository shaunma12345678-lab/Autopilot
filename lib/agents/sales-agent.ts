import { runAgent } from "@/lib/claude"

const SYSTEM_PROMPT = `You are an elite sales coach who has trained top-performing reps at B2B and local service businesses. You build sales systems that actually get used — not scripts that gather dust. Every word serves a purpose.

Rules:
- Scripts must sound like real conversations, not rehearsed pitches
- Objection handlers must acknowledge before reframing — never argue
- Discovery questions must reveal pain, not just gather info
- Closing lines must respect the buyer's timeline while creating urgency
- Return valid JSON only`

export async function generateSalesScript(params: {
  businessName: string
  service: string
  price: string
  targetCustomer: string
  objections: string[]
  uvp: string
}): Promise<{
  phoneOpener: string
  emailOpener: string
  inPersonOpener: string
  discoveryQuestions: string[]
  valuePitch: string
  objectionHandlers: Record<string, string>
  closingLines: { soft: string; medium: string; direct: string }
  followUpScript: string
  voicemailScript: string
}> {
  const user = `Build a complete sales toolkit for ${params.businessName}.

Service: ${params.service}
Price point: ${params.price}
Target customer: ${params.targetCustomer}
Unique value proposition: ${params.uvp}
Common objections to handle: ${params.objections.join(", ")}

Create:
1. Phone opener (first 15 seconds — hook, who you are, reason for calling, one question)
2. Email opener (subject + first 3 lines only — make them want to read more)
3. In-person opener (for networking or walk-in situations)
4. 5 discovery questions that reveal pain and budget
5. Value pitch (30-second version that leads with the outcome, not the service)
6. Objection handler for each objection listed (acknowledge → reframe → question)
7. 3 closing lines: soft (trial close), medium (next-step close), direct (ask for the sale)
8. 24-hour follow-up script
9. Voicemail script (under 20 seconds)

Return JSON with all fields.`

  return (await runAgent(SYSTEM_PROMPT, user, { jsonMode: true, maxTokens: 3000 })) as ReturnType<typeof generateSalesScript> extends Promise<infer T> ? T : never
}

export async function generateProposal(params: {
  businessName: string
  clientName: string
  clientCompany: string
  service: string
  price: string
  painPoints: string[]
  proposedSolution: string
}): Promise<{
  executiveSummary: string
  problemStatement: string
  solution: string
  deliverables: string[]
  investment: string
  timeline: string
  nextSteps: string
  closingStatement: string
}> {
  const user = `Write a concise, compelling proposal for ${params.businessName} to send to ${params.clientName} at ${params.clientCompany}.

Service: ${params.service}
Investment: ${params.price}
Their pain points: ${params.painPoints.join(", ")}
Our proposed solution: ${params.proposedSolution}

Write like a trusted advisor solving a real problem — not a salesperson. Lead with their situation, not your credentials.

Return JSON with: executiveSummary, problemStatement, solution, deliverables array, investment, timeline, nextSteps, closingStatement`

  return (await runAgent(SYSTEM_PROMPT, user, { jsonMode: true, maxTokens: 2500 })) as ReturnType<typeof generateProposal> extends Promise<infer T> ? T : never
}
