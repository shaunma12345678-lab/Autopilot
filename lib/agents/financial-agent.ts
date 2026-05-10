import { runAgent } from "@/lib/claude"

const SYSTEM_PROMPT = `You are a trusted CFO and business advisor for small businesses. You translate financial data into plain English with actionable next steps. You never use jargon. You lead with the most important number — not a summary of everything.

Rules:
- Be direct: lead with the headline metric
- Every insight must come with a specific action, not vague advice
- Use simple comparisons (vs last month, vs industry average)
- Flag anything that needs immediate attention in red
- Return valid JSON only`

export async function generateFinancialInsights(params: {
  businessName: string
  businessType: string
  currentMonthData: Record<string, unknown>
  previousMonthData: Record<string, unknown>
}): Promise<{
  headline: string
  alert: string | null
  keyMetrics: Array<{ label: string; value: string; change: string; trend: "up" | "down" | "flat" }>
  insights: string[]
  recommendations: Array<{ action: string; impact: string; effort: "low" | "medium" | "high" }>
  summary: string
  healthScore: number
}> {
  const user = `Analyze this financial data for ${params.businessName} (${params.businessType}) and write a plain-English monthly report.

Current month: ${JSON.stringify(params.currentMonthData)}
Previous month: ${JSON.stringify(params.previousMonthData)}

Deliver:
1. A single headline — the most important financial fact this month in plain English
2. Any immediate alert (cash flow risk, unusual expense, revenue drop > 20%) — null if none
3. Key metrics with month-over-month change and trend direction
4. 3 specific insights derived from the data
5. 3 specific recommendations with estimated impact and effort level
6. A 2-sentence plain-English summary a non-financial owner can understand
7. A business health score 0-100

Return JSON with: headline, alert, keyMetrics, insights, recommendations, summary, healthScore`

  return (await runAgent(SYSTEM_PROMPT, user, { jsonMode: true, maxTokens: 2000 })) as ReturnType<typeof generateFinancialInsights> extends Promise<infer T> ? T : never
}

export async function generateCashFlowForecast(params: {
  businessName: string
  monthlyRevenue: number
  monthlyExpenses: number
  growthRate: number
  months: number
}): Promise<{
  forecast: Array<{ month: string; revenue: number; expenses: number; profit: number; cashPosition: number }>
  summary: string
  risks: string[]
  opportunities: string[]
}> {
  const user = `Create a ${params.months}-month cash flow forecast for ${params.businessName}.

Current monthly revenue: $${params.monthlyRevenue}
Current monthly expenses: $${params.monthlyExpenses}
Estimated monthly growth rate: ${params.growthRate}%

Account for typical seasonal variation, growth compounding, and common expense increases.

Return JSON: {
  "forecast": [{ "month": "string", "revenue": number, "expenses": number, "profit": number, "cashPosition": number }],
  "summary": "string",
  "risks": ["string"],
  "opportunities": ["string"]
}`

  return (await runAgent(SYSTEM_PROMPT, user, { jsonMode: true, maxTokens: 2000 })) as ReturnType<typeof generateCashFlowForecast> extends Promise<infer T> ? T : never
}
