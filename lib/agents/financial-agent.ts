import { runAgent } from "@/lib/claude"

const SYSTEM_PROMPT = `You are a friendly business financial advisor. Return valid JSON only.`

export async function generateFinancialInsights(params: {
  businessName: string
  businessType: string
  currentMonthData: Record<string, unknown>
  previousMonthData: Record<string, unknown>
}): Promise<{
  headline: string
  keyMetrics: Array<{ label: string; value: string; change: string }>
  insights: string[]
  recommendations: string[]
  summary: string
}> {
  const user = `Analyze this financial data and write a plain-English monthly summary for ${params.businessName} (${params.businessType}).
Current month: ${JSON.stringify(params.currentMonthData)}
Previous month: ${JSON.stringify(params.previousMonthData)}

Lead with the most important number. Use simple language. Under 300 words for the summary.
Return JSON with headline, keyMetrics array, insights array, recommendations array, and summary.`

  return (await runAgent(SYSTEM_PROMPT, user, {
    jsonMode: true,
    maxTokens: 2000,
  })) as ReturnType<typeof generateFinancialInsights> extends Promise<infer T> ? T : never
}
