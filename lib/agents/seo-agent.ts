import { runAgent } from "@/lib/claude"

const SYSTEM_PROMPT = `You are an SEO content strategist who has ranked hundreds of local service businesses on page 1. You write content that ranks AND converts — because traffic that doesn't buy is worthless.

Rules:
- Every piece of content must satisfy search intent first, then sell
- Use the target keyword naturally — never stuff it
- Structure for featured snippets: answer the question in the first paragraph
- Include local signals (city, neighborhood, landmarks) without being robotic
- Headlines must be compelling to both Google and humans
- Return valid JSON only`

export async function generateBlogPost(params: {
  businessName: string
  businessType: string
  location: string
  brandVoice: Record<string, unknown>
  keyword: string
  wordCount?: number
}): Promise<{ title: string; metaDescription: string; slug: string; body: string; internalLinks: string[] }> {
  const wordCount = params.wordCount ?? 1200

  const user = `Write a ${wordCount}-word SEO blog post for ${params.businessName}, a ${params.businessType} in ${params.location}.

Target keyword: "${params.keyword}"
Brand voice: ${JSON.stringify(params.brandVoice)}

Requirements:
- H1 must contain the exact keyword
- Answer the search intent in the first 100 words (featured snippet opportunity)
- 3–4 H2 subheadings (include keyword variations)
- Include ${params.location} naturally in at least 3 places
- Grade 7–8 reading level
- End with a local CTA mentioning ${params.businessName} and ${params.location}
- Suggest 3 internal link topics (other articles to write) that support this post

Return JSON:
{
  "title": "string (under 60 chars, keyword first)",
  "metaDescription": "string (under 155 chars, includes keyword and location)",
  "slug": "string (URL-friendly)",
  "body": "string (full markdown)",
  "internalLinks": ["suggested article title 1", "suggested article title 2", "suggested article title 3"]
}`

  return (await runAgent(SYSTEM_PROMPT, user, { jsonMode: true, maxTokens: 4000 })) as ReturnType<typeof generateBlogPost> extends Promise<infer T> ? T : never
}

export async function generateKeywordStrategy(params: {
  businessName: string
  businessType: string
  location: string
  competitors?: string[]
}): Promise<{
  primaryKeywords: Array<{ keyword: string; intent: string; difficulty: string; priority: "high" | "medium" | "low" }>
  localKeywords: string[]
  contentGaps: string[]
  quickWins: string[]
}> {
  const user = `Create a local SEO keyword strategy for ${params.businessName}, a ${params.businessType} in ${params.location}.
${params.competitors?.length ? `Competitors to consider: ${params.competitors.join(", ")}` : ""}

Focus on:
- High-intent local keywords (people ready to buy)
- Long-tail keywords with lower competition
- Neighborhood-specific variations
- "Near me" and "best in ${params.location}" patterns

Return JSON:
{
  "primaryKeywords": [{ "keyword": "string", "intent": "informational|commercial|transactional", "difficulty": "low|medium|high", "priority": "high|medium|low" }],
  "localKeywords": ["string"],
  "contentGaps": ["topics competitors rank for that you should target"],
  "quickWins": ["keywords you can rank for in under 90 days"]
}`

  return (await runAgent(SYSTEM_PROMPT, user, { jsonMode: true, maxTokens: 2000 })) as ReturnType<typeof generateKeywordStrategy> extends Promise<infer T> ? T : never
}
