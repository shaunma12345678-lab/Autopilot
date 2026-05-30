import { runAgent } from "@/lib/claude"

const SYSTEM_PROMPT = `You are a growth marketing expert who has built referral programs that account for 20-40% of new business. You understand the psychology of why people refer — it's about social currency, not just cash. The best referral programs make the referrer look good.

Rules:
- Incentive must feel exciting, not transactional
- The ask must be timed to the moment of peak satisfaction
- Friction kills referral rates — make it a 30-second action
- Return valid JSON only`

export async function generateReferralProgram(params: {
  businessName: string
  businessType: string
  averageCustomerValue: number
  customerAcquisitionCost?: number
  currentReferralRate?: string
}): Promise<{
  programName: string
  mechanics: {
    referrerReward: string
    refereeReward: string
    rewardStructure: "single" | "double-sided" | "tiered"
    trackingMethod: string
    payoutTiming: string
  }
  economicsAnalysis: {
    costPerReferral: string
    ltv: string
    roi: string
    breakEvenReferrals: number
  }
  launchPlan: Array<{ phase: number; action: string; timeline: string; goal: string }>
  promotionAssets: {
    websiteSection: { headline: string; subheadline: string; cta: string; benefits: string[] }
    emailAnnouncement: { subject: string; body: string }
    smsAnnouncement: string
    inPersonAsk: string
    socialPost: string
    referralCardCopy: string
  }
  softwareOptions: Array<{ name: string; price: string; bestFor: string }>
  commonMistakes: string[]
}> {
  const user = `Design a complete referral program for ${params.businessName} (${params.businessType}).

Average customer lifetime value: $${params.averageCustomerValue}
Current customer acquisition cost: $${params.customerAcquisitionCost ?? "Unknown"}
Current referral rate: ${params.currentReferralRate ?? "Unknown"}

Design a program that:
- Has compelling incentives for both referrer and referee
- Works for this specific business type and customer base
- Is easy to track without enterprise software
- Includes a launch plan and all promotional assets

Analyze the economics: cost per referral, estimated ROI, break-even number.

Return JSON with: programName, mechanics, economicsAnalysis, launchPlan, promotionAssets, softwareOptions, commonMistakes`

  return (await runAgent(SYSTEM_PROMPT, user, { jsonMode: true, maxTokens: 3000 })) as ReturnType<typeof generateReferralProgram> extends Promise<infer T> ? T : never
}

export async function generateReferralCopy(params: {
  businessName: string
  businessType: string
  referrerReward: string
  refereeReward: string
  channel: "email" | "sms" | "social" | "in-person" | "card"
}): Promise<{
  messages: Array<{
    version: string
    message: string
    tone: string
    bestFor: string
  }>
  followUpMessages: Array<{ dayAfter: number; message: string }>
  thankYouMessage: string
}> {
  const user = `Write referral program promotion copy for ${params.businessName} (${params.businessType}).

Referrer gets: ${params.referrerReward}
Referee gets: ${params.refereeReward}
Channel: ${params.channel}

Write 3 versions (warm/enthusiastic, professional/clear, brief/casual) for ${params.channel}.
Include 2 follow-up messages (day 3, day 7) and a thank-you message for successful referrals.

Return JSON with: messages, followUpMessages, thankYouMessage`

  return (await runAgent(SYSTEM_PROMPT, user, { jsonMode: true, maxTokens: 2000 })) as ReturnType<typeof generateReferralCopy> extends Promise<infer T> ? T : never
}
