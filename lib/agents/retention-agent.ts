import { runAgent } from "@/lib/claude"

const SYSTEM_PROMPT = `You are a customer success and retention expert who has reduced churn at multiple SaaS and service businesses. You understand that keeping a customer is 5x cheaper than acquiring one — and you build systems that make customers feel valued, not just sold to.

Rules:
- Every retention strategy must be specific, not "improve your service"
- Loyalty programs must have economics that work for the business
- Win-back copy must acknowledge the gap without groveling
- Return valid JSON only`

export async function analyzeChurnRisk(params: {
  businessName: string
  businessType: string
  customerData: {
    totalCustomers: number
    activeCustomers: number
    avgPurchaseFrequency: string
    avgCustomerValue: string
    commonCancellationReasons?: string[]
  }
}): Promise<{
  churnRateEstimate: string
  revenueAtRisk: string
  riskSegments: Array<{
    segment: string
    description: string
    size: string
    riskLevel: "critical" | "high" | "medium" | "low"
    retentionStrategy: string
    expectedLiftPercent: number
  }>
  earlyWarningSignals: string[]
  retentionPlaybook: Array<{
    trigger: string
    action: string
    timing: string
    channel: string
  }>
  healthScoreModel: {
    metrics: Array<{ metric: string; weight: number; greenRange: string; redRange: string }>
    scoringFormula: string
  }
}> {
  const user = `Analyze churn risk and build a retention system for ${params.businessName} (${params.businessType}).

Customer data:
- Total customers: ${params.customerData.totalCustomers}
- Active customers: ${params.customerData.activeCustomers}
- Avg purchase frequency: ${params.customerData.avgPurchaseFrequency}
- Avg customer value: ${params.customerData.avgCustomerValue}
- Common cancellation reasons: ${params.customerData.commonCancellationReasons?.join(", ") ?? "Unknown"}

Deliver:
1. Estimated churn rate and revenue at risk calculation
2. Customer risk segments (4 segments from critical to low) with specific retention strategy for each
3. 8 early warning signals to watch for before a customer churns
4. Retention playbook: trigger → action → timing → channel mappings
5. Customer health score model with weighted metrics, scoring formula, green/red ranges

Return JSON with: churnRateEstimate, revenueAtRisk, riskSegments, earlyWarningSignals, retentionPlaybook, healthScoreModel`

  return (await runAgent(SYSTEM_PROMPT, user, { jsonMode: true, maxTokens: 3000 })) as ReturnType<typeof analyzeChurnRisk> extends Promise<infer T> ? T : never
}

export async function generateLoyaltyProgram(params: {
  businessName: string
  businessType: string
  avgTransactionValue: number
  avgPurchaseFrequency: string
  currentRetentionRate?: number
}): Promise<{
  programName: string
  programMechanic: "points" | "tiers" | "cashback" | "punch-card" | "subscription"
  structure: {
    tiers?: Array<{ name: string; requirement: string; benefits: string[]; color: string }>
    pointValue?: string
    rewardOptions?: string[]
    punchCardDetails?: string
  }
  launchPlan: Array<{ week: number; action: string; channel: string }>
  emailAnnouncement: { subject: string; body: string }
  economicsAnalysis: { costPerRedemption: string; projectedLiftPercent: number; roi: string; breakEvenTimeframe: string }
  promotionCopy: { signupHeadline: string; benefits: string[]; cta: string }
}> {
  const user = `Design a complete loyalty program for ${params.businessName} (${params.businessType}).

Average transaction value: $${params.avgTransactionValue}
Purchase frequency: ${params.avgPurchaseFrequency}
Current retention rate: ${params.currentRetentionRate ? `${params.currentRetentionRate}%` : "Unknown"}

Design a program that:
- Is easy to understand (customers know exactly what they get)
- Has economics that work (profitable at target redemption rates)
- Creates genuine behavioral change (more frequent purchases)
- Is simple to administer without complex software

Include a 4-week launch plan, announcement email, economics analysis (cost per redemption, projected lift, ROI, break-even), and promotion copy for the website/counter.

Return JSON with: programName, programMechanic, structure, launchPlan, emailAnnouncement, economicsAnalysis, promotionCopy`

  return (await runAgent(SYSTEM_PROMPT, user, { jsonMode: true, maxTokens: 2500 })) as ReturnType<typeof generateLoyaltyProgram> extends Promise<infer T> ? T : never
}

export async function generateRetentionCampaign(params: {
  businessName: string
  businessType: string
  customerSegment: string
  inactivePeriod: string
  winBackOffer?: string
}): Promise<{
  strategy: string
  touchpoints: Array<{
    channel: "email" | "sms" | "call" | "in-person" | "mail"
    timing: string
    message: string
    offer?: string
  }>
  emailCopy: { subject: string; body: string; cta: string }
  smsCopy: string
  callScript: { opener: string; valueStatement: string; offer: string; close: string }
  successMetrics: string[]
}> {
  const user = `Create a multi-channel retention campaign for ${params.businessName} targeting ${params.customerSegment} who have been inactive for ${params.inactivePeriod}.

Business type: ${params.businessType}
Win-back offer to use: ${params.winBackOffer ?? "Generate the most compelling offer for this business type"}

Design a 30-day multi-touch retention campaign that feels personal, not automated.
Include channel sequencing (which to try first, fallbacks), specific copy for email and SMS, a call script, and success metrics.

Return JSON with: strategy, touchpoints, emailCopy, smsCopy, callScript, successMetrics`

  return (await runAgent(SYSTEM_PROMPT, user, { jsonMode: true, maxTokens: 2500 })) as ReturnType<typeof generateRetentionCampaign> extends Promise<infer T> ? T : never
}
