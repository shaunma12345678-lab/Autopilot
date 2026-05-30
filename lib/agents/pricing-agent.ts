import { runAgent } from "@/lib/claude"

const SYSTEM_PROMPT = `You are a pricing strategy consultant who has helped service businesses increase revenue 20-40% without losing customers. You understand value-based pricing, price anchoring, and the psychology of how buyers evaluate cost vs value.

Rules:
- Pricing recommendations must have a specific number, not a range
- Every pricing tier must have a clear "hero" option (the one you want most people to choose)
- Anchoring and packaging are more powerful than discounting
- Return valid JSON only`

export async function generatePricingStrategy(params: {
  businessName: string
  businessType: string
  currentPricing?: Record<string, string>
  competitors?: string[]
  targetMargin?: number
  location: string
}): Promise<{
  pricingAudit: {
    currentIssues: string[]
    revenueLeakageEstimate: string
    pricePositioning: "underpriced" | "competitive" | "premium"
  }
  recommendedPricing: Array<{
    service: string
    currentPrice: string
    recommendedPrice: string
    increaseJustification: string
    presentationTip: string
  }>
  packageStrategy: {
    packages: Array<{
      name: string
      price: string
      includes: string[]
      anchor: boolean
      hero: boolean
      targetBuyer: string
    }>
    packagingRationale: string
  }
  pricingPsychologyTips: string[]
  priceIncreaseScript: { announcement: string; emailToExistingCustomers: string; objectionHandler: string }
  pricingPageCopy: {
    headline: string
    subheadline: string
    valueStatement: string
    guaranteeCopy: string
  }
}> {
  const user = `Build a complete pricing strategy for ${params.businessName} (${params.businessType} in ${params.location}).

Current pricing: ${params.currentPricing ? JSON.stringify(params.currentPricing) : "Not provided"}
Competitors: ${params.competitors?.join(", ") ?? "Not specified"}
Target profit margin: ${params.targetMargin ? `${params.targetMargin}%` : "Not specified"}

Deliver:
1. Pricing audit: identify current issues and estimate revenue leakage from under-pricing
2. Specific price recommendations for each service with justification and presentation tip
3. Packaging strategy: 3 tiers with clear Good/Better/Best logic (identify hero option)
4. 8 pricing psychology tips specific to this business type
5. Price increase script: announcement copy, email to existing customers, objection handler
6. Pricing page copy that justifies the price before they see the number

Return JSON with: pricingAudit, recommendedPricing, packageStrategy, pricingPsychologyTips, priceIncreaseScript, pricingPageCopy`

  return (await runAgent(SYSTEM_PROMPT, user, { jsonMode: true, maxTokens: 3000 })) as ReturnType<typeof generatePricingStrategy> extends Promise<infer T> ? T : never
}

export async function generatePricingPage(params: {
  businessName: string
  service: string
  packages: Array<{ name: string; price: string; includes: string[] }>
  guarantee?: string
  targetAudience: string
}): Promise<{
  headline: string
  subheadline: string
  valueStatement: string
  packageCopy: Array<{ name: string; tagline: string; price: string; includes: string[]; cta: string; badge?: string }>
  faq: Array<{ question: string; answer: string }>
  guarantee: string
  urgencyElement: string
  socialProofLine: string
}> {
  const user = `Write high-converting pricing page copy for ${params.businessName}.

Service: ${params.service}
Packages: ${JSON.stringify(params.packages)}
Target audience: ${params.targetAudience}
Guarantee: ${params.guarantee ?? "Generate a compelling guarantee"}

Write copy that:
- Justifies the price before showing the number
- Makes the middle tier the obvious choice (anchor with high, make middle heroic)
- Handles price objections in the FAQ before they arise
- Creates urgency without fake scarcity
- Has a guarantee that removes purchase risk

Return JSON with: headline, subheadline, valueStatement, packageCopy, faq, guarantee, urgencyElement, socialProofLine`

  return (await runAgent(SYSTEM_PROMPT, user, { jsonMode: true, maxTokens: 2500 })) as ReturnType<typeof generatePricingPage> extends Promise<infer T> ? T : never
}
