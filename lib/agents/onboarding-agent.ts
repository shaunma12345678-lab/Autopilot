import { runAgent } from "@/lib/claude"

export interface BrandVoice {
  tone: string
  personality: string[]
  targetAudience: string
  uniqueSellingPoints: string[]
  keyServices: string[]
  avoidTopics: string[]
  contentStyle: string
  emojiUsage: boolean
  postingGoals: string
}

const SYSTEM_PROMPT = `You are an expert business consultant. Extract business information and return valid JSON only. No preamble.`

export async function buildBrandVoice(businessInfo: {
  name: string
  type: string
  description: string
  location: string
  personality: string[]
  targetAudience: string
  uniqueSellingPoints: string
  tone: string
  emojiUsage: boolean
  goals: string
  platforms: string[]
}): Promise<BrandVoice> {
  const user = `Build a complete brand voice profile for this business:
${JSON.stringify(businessInfo, null, 2)}

Return JSON matching exactly:
{
  "tone": "professional|casual|friendly|authoritative",
  "personality": ["trait1", "trait2", "trait3"],
  "targetAudience": "description",
  "uniqueSellingPoints": ["usp1", "usp2"],
  "keyServices": ["service1", "service2"],
  "avoidTopics": ["topic1"],
  "contentStyle": "description of content style",
  "emojiUsage": true|false,
  "postingGoals": "description"
}`

  return (await runAgent(SYSTEM_PROMPT, user, { jsonMode: true })) as unknown as BrandVoice
}
