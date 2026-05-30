import { runAgent } from "@/lib/claude"

const SYSTEM_PROMPT = `You are a world-class direct-response copywriter and paid media strategist. You write ads that stop the scroll, spark curiosity, and drive clicks. Every word earns its place. You know Google Quality Score, Facebook relevance scores, and conversion psychology cold.

Rules:
- Headlines create curiosity gaps or make bold claims with proof
- Descriptions complete the thought the headline started
- CTAs create urgency without being desperate
- Match the platform's character limits exactly
- Return valid JSON only`

export async function generateGoogleAds(params: {
  businessName: string
  businessType: string
  service: string
  targetKeywords: string[]
  uvp: string
  offer?: string
}): Promise<{
  campaigns: Array<{
    campaign: string
    adGroups: Array<{
      adGroup: string
      keywords: string[]
      ads: Array<{
        headlines: string[]
        descriptions: string[]
        displayPath: string
        finalUrl: string
      }>
    }>
  }>
  negativeKeywords: string[]
  bidStrategy: string
  qualityScoreTips: string[]
}> {
  const user = `Create complete Google Search Ad campaigns for ${params.businessName} (${params.businessType}).

Service being advertised: ${params.service}
Target keywords: ${params.targetKeywords.join(", ")}
Unique value proposition: ${params.uvp}
Current offer: ${params.offer ?? "Free consultation"}

Requirements:
- 2 ad campaigns with 2 ad groups each
- Each ad group gets 3 expanded text ads (3 headlines max 30 chars each, 2 descriptions max 90 chars each)
- Display paths that include the keyword naturally
- Include a list of 10 negative keywords to prevent wasted spend
- Recommend bid strategy based on the business type
- 5 quality score improvement tips specific to these ads

Return JSON with: campaigns, negativeKeywords, bidStrategy, qualityScoreTips`

  return (await runAgent(SYSTEM_PROMPT, user, { jsonMode: true, maxTokens: 3000 })) as ReturnType<typeof generateGoogleAds> extends Promise<infer T> ? T : never
}

export async function generateFacebookAds(params: {
  businessName: string
  businessType: string
  service: string
  targetAudience: string
  offer: string
  budget?: string
}): Promise<{
  campaigns: Array<{
    objective: string
    audience: {
      demographics: string
      interests: string[]
      behaviors: string[]
      lookalike: string
    }
    ads: Array<{
      format: string
      primaryText: string
      headline: string
      description: string
      cta: string
      imagePrompt: string
    }>
  }>
  audienceStrategy: string
  retargetingSequence: string[]
  budgetSplit: Record<string, string>
}> {
  const user = `Create complete Facebook/Instagram ad campaigns for ${params.businessName} (${params.businessType}).

Service: ${params.service}
Target audience: ${params.targetAudience}
Offer: ${params.offer}
Budget: ${params.budget ?? "Not specified"}

Requirements:
- 3 campaigns: Awareness, Consideration, Conversion
- Each campaign gets 2 ad variants (A/B test)
- Primary text under 125 chars (shown above image), headline under 27 chars, description under 30 chars
- Detailed audience targeting including demographics, interests, and behaviors
- Image prompts describing the ideal creative for each ad
- Retargeting sequence (3 touchpoints) for non-converters
- Budget split recommendation across campaigns

Return JSON with: campaigns, audienceStrategy, retargetingSequence, budgetSplit`

  return (await runAgent(SYSTEM_PROMPT, user, { jsonMode: true, maxTokens: 3000 })) as ReturnType<typeof generateFacebookAds> extends Promise<infer T> ? T : never
}

export async function generateLandingPageCopy(params: {
  businessName: string
  service: string
  targetAudience: string
  painPoints: string[]
  offer: string
  guarantee?: string
}): Promise<{
  headline: string
  subheadline: string
  heroSection: { headline: string; subheadline: string; cta: string; socialProof: string }
  problemSection: { hook: string; painPoints: string[]; agitationCopy: string }
  solutionSection: { headline: string; benefits: Array<{ title: string; description: string }> }
  socialProofSection: { testimonials: Array<{ name: string; result: string; quote: string }> }
  offerSection: { headline: string; whatYouGet: string[]; price: string; guarantee: string; cta: string }
  faqSection: Array<{ question: string; answer: string }>
  footerCta: string
}> {
  const user = `Write complete high-converting landing page copy for ${params.businessName}.

Service: ${params.service}
Target audience: ${params.targetAudience}
Their main pain points: ${params.painPoints.join(", ")}
Offer: ${params.offer}
Guarantee: ${params.guarantee ?? "Satisfaction guaranteed"}

Follow the Pain-Agitate-Solve framework. Use social proof throughout. Create urgency honestly.
Write every word as if it directly affects whether the visitor buys.

Return JSON with: headline, subheadline, heroSection, problemSection, solutionSection, socialProofSection, offerSection, faqSection, footerCta`

  return (await runAgent(SYSTEM_PROMPT, user, { jsonMode: true, maxTokens: 3000 })) as ReturnType<typeof generateLandingPageCopy> extends Promise<infer T> ? T : never
}
