import { runAgent } from "@/lib/claude"

const SYSTEM_PROMPT = `You are a strategic intelligence analyst who has done competitive research for Fortune 500 companies. You find the real gaps — the ones that represent million-dollar opportunities — not surface-level observations. You think like a McKinsey partner but speak like a trusted advisor.

Rules:
- Every insight must be specific and actionable, not generic
- Gaps are only worth calling out if they represent a real customer need
- Recommendations must be prioritized by impact-to-effort ratio
- Return valid JSON only`

export async function analyzeCompetitors(params: {
  businessName: string
  businessType: string
  location: string
  competitors: string[]
  yourStrengths: string[]
  yourWeaknesses?: string[]
}): Promise<{
  competitorProfiles: Array<{
    name: string
    perceivedStrengths: string[]
    perceivedWeaknesses: string[]
    likelyPricing: string
    targetSegment: string
    digitalPresence: string
  }>
  gapAnalysis: {
    serviceGaps: string[]
    pricingGaps: string
    audienceGaps: string[]
    messagingGaps: string[]
    experienceGaps: string[]
  }
  opportunities: Array<{
    opportunity: string
    estimatedImpact: "high" | "medium" | "low"
    effort: "high" | "medium" | "low"
    timeToResult: string
    howToCapture: string
  }>
  positioningRecommendation: {
    positioning: string
    tagline: string
    differentiators: string[]
    messagingPillars: string[]
  }
  battleCard: Record<string, string>
}> {
  const user = `Perform a competitive intelligence analysis for ${params.businessName} (${params.businessType} in ${params.location}).

Your business strengths: ${params.yourStrengths.join(", ")}
Your potential weaknesses: ${params.yourWeaknesses?.join(", ") ?? "Not specified"}

Competitors to analyze: ${params.competitors.join(", ")}

Deliver:
1. Profile of each competitor (strengths, weaknesses, pricing tier, target segment, digital presence)
2. Gap analysis across 5 dimensions: services, pricing, audience, messaging, experience
3. Top 5 opportunities ranked by impact/effort, with specific capture strategy for each
4. Positioning recommendation: how to stand out with specific tagline, differentiators, and messaging pillars
5. Battle card: one-line "why us vs them" statement for each competitor

Return JSON with: competitorProfiles, gapAnalysis, opportunities, positioningRecommendation, battleCard`

  return (await runAgent(SYSTEM_PROMPT, user, { jsonMode: true, maxTokens: 3500 })) as ReturnType<typeof analyzeCompetitors> extends Promise<infer T> ? T : never
}

export async function generateCompetitorSWOT(params: {
  businessName: string
  businessType: string
  location: string
  industry: string
}): Promise<{
  strengths: Array<{ item: string; howToLeverage: string }>
  weaknesses: Array<{ item: string; howToAddress: string }>
  opportunities: Array<{ item: string; actionPlan: string; priority: "high" | "medium" | "low" }>
  threats: Array<{ item: string; mitigationStrategy: string; severity: "high" | "medium" | "low" }>
  strategicSummary: string
  top3Actions: string[]
}> {
  const user = `Perform a SWOT analysis for ${params.businessName}, a ${params.businessType} in ${params.location} operating in the ${params.industry} industry.

For each quadrant, provide 5 items with specific, actionable guidance:
- Strengths: what to double down on and how
- Weaknesses: what to improve and the fastest path to improvement
- Opportunities: prioritized list with specific action plans
- Threats: severity rating and concrete mitigation strategies

End with:
- 2-sentence strategic summary
- Top 3 immediate actions they should take this month

Return JSON with: strengths, weaknesses, opportunities, threats, strategicSummary, top3Actions`

  return (await runAgent(SYSTEM_PROMPT, user, { jsonMode: true, maxTokens: 2500 })) as ReturnType<typeof generateCompetitorSWOT> extends Promise<infer T> ? T : never
}
