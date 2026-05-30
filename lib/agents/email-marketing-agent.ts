import { runAgent } from "@/lib/claude"

const SYSTEM_PROMPT = `You are an elite email marketing strategist who has built sequences that generate 40-60% open rates. You understand buyer psychology, subject line science, and the perfect balance between value and promotion.

Rules:
- Subject lines create curiosity or make a bold promise — never both at once
- First lines cannot be a repeat of the subject line
- Every email has ONE primary CTA — never two
- Sequences build on each other — reference what came before
- Return valid JSON only`

export async function generateWelcomeSequence(params: {
  businessName: string
  businessType: string
  service: string
  brandVoice: Record<string, unknown>
}): Promise<{
  emails: Array<{
    day: number
    subject: string
    previewText: string
    body: string
    cta: string
    goal: string
  }>
  sequenceStrategy: string
}> {
  const user = `Write a 5-email welcome sequence for new leads/customers of ${params.businessName} (${params.businessType}).

Service: ${params.service}
Brand voice: ${JSON.stringify(params.brandVoice)}

Email schedule: Day 0 (immediate), Day 1, Day 3, Day 7, Day 14
Each email should advance the relationship while delivering real value.

Email goals:
1. Day 0: Welcome + deliver on promise + set expectations
2. Day 1: Showcase biggest quick win or tip they can act on today
3. Day 3: Social proof + overcome biggest objection
4. Day 7: Value-first email (teach something) → soft pitch
5. Day 14: Limited-time offer or next step CTA

Return JSON with: emails array (each with day, subject, previewText, body HTML, cta, goal), sequenceStrategy`

  return (await runAgent(SYSTEM_PROMPT, user, { jsonMode: true, maxTokens: 4000 })) as ReturnType<typeof generateWelcomeSequence> extends Promise<infer T> ? T : never
}

export async function generateWinBackCampaign(params: {
  businessName: string
  businessType: string
  service: string
  inactiveDays: number
  offer?: string
}): Promise<{
  emails: Array<{
    day: number
    subject: string
    previewText: string
    body: string
    cta: string
    angle: string
  }>
  smsFollowUp: string
  segmentationTips: string[]
}> {
  const user = `Write a 3-email win-back campaign for ${params.businessName} customers who haven't engaged in ${params.inactiveDays} days.

Service: ${params.service}
Special offer to use: ${params.offer ?? "Generate a compelling re-engagement offer"}

Email sequence:
1. Email 1 (Day 0): "We miss you" — personal, curious, no hard pitch
2. Email 2 (Day 3): Value reminder + what's changed/improved
3. Email 3 (Day 7): Last chance + best offer + easy re-entry path

Also write:
- A follow-up SMS (160 chars max) for non-openers
- 5 segmentation tips to improve win-back rates

Return JSON with: emails array (each with day, subject, previewText, body HTML, cta, angle), smsFollowUp, segmentationTips`

  return (await runAgent(SYSTEM_PROMPT, user, { jsonMode: true, maxTokens: 3000 })) as ReturnType<typeof generateWinBackCampaign> extends Promise<infer T> ? T : never
}

export async function generatePromotionalBroadcast(params: {
  businessName: string
  businessType: string
  offer: string
  deadline: string
  audienceSegment: string
  brandVoice: Record<string, unknown>
}): Promise<{
  emails: Array<{
    version: "main" | "reminder" | "lastChance"
    subject: string
    previewText: string
    body: string
    cta: string
    sendTime: string
  }>
  abTestSubjects: Array<{ variant: "A" | "B"; subject: string; angle: string }>
  deliverabilityTips: string[]
}> {
  const user = `Write a 3-email promotional broadcast series for ${params.businessName} (${params.businessType}).

Offer: ${params.offer}
Deadline: ${params.deadline}
Audience: ${params.audienceSegment}
Brand voice: ${JSON.stringify(params.brandVoice)}

Emails needed:
1. Launch email (4 days before deadline)
2. Reminder email (2 days before deadline) — different angle, not just "reminder"
3. Last-chance email (day of deadline) — urgency, scarcity, final push

Also provide:
- 2 A/B subject line variants for the launch email with different psychological angles
- 5 deliverability tips specific to promotional emails

Return JSON with: emails array, abTestSubjects, deliverabilityTips`

  return (await runAgent(SYSTEM_PROMPT, user, { jsonMode: true, maxTokens: 3000 })) as ReturnType<typeof generatePromotionalBroadcast> extends Promise<infer T> ? T : never
}

export async function generateNurtureSequence(params: {
  businessName: string
  service: string
  leadSource: string
  salesCycleDays: number
}): Promise<{
  emails: Array<{
    day: number
    subject: string
    body: string
    cta: string
    goal: "educate" | "overcome_objection" | "build_trust" | "convert"
  }>
  sequenceLogic: string
  exitConditions: string[]
}> {
  const user = `Write a lead nurture email sequence for ${params.businessName} targeting ${params.leadSource} leads.

Service being sold: ${params.service}
Typical sales cycle: ${params.salesCycleDays} days

Create a sequence that:
- Educates the lead progressively — each email builds on the last
- Addresses the top 3 objections people have before buying
- Builds trust through expertise and social proof
- Makes purchasing feel like the obvious, safe next step

Spread emails across the sales cycle with increasing purchase urgency near the end.

Return JSON with: emails (day, subject, body HTML, cta, goal), sequenceLogic, exitConditions`

  return (await runAgent(SYSTEM_PROMPT, user, { jsonMode: true, maxTokens: 3000 })) as ReturnType<typeof generateNurtureSequence> extends Promise<infer T> ? T : never
}
