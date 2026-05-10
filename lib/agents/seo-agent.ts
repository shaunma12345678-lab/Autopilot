import { runAgent } from "@/lib/claude"

const SYSTEM_PROMPT = `You are an expert SEO content writer. Return valid JSON only.`

export async function generateBlogPost(params: {
  businessName: string
  businessType: string
  location: string
  brandVoice: Record<string, unknown>
  keyword: string
  wordCount?: number
}): Promise<{ title: string; metaDescription: string; body: string }> {
  const wordCount = params.wordCount ?? 1000

  const user = `Write a ${wordCount}-word SEO blog post for ${params.businessName}, a ${params.businessType} in ${params.location}.
Target keyword: "${params.keyword}"
Brand voice: ${JSON.stringify(params.brandVoice)}
Requirements:
- Include keyword in H1, first paragraph, and 2-3 subheadings
- Write for a local ${params.location} audience
- End with a CTA to contact ${params.businessName}
- Grade 8 reading level

Return JSON: { "title": "string", "metaDescription": "string (under 160 chars)", "body": "string (markdown)" }`

  return (await runAgent(SYSTEM_PROMPT, user, { jsonMode: true })) as {
    title: string
    metaDescription: string
    body: string
  }
}
