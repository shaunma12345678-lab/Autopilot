import { runAgent } from "@/lib/claude"

interface Service {
  name: string
  monthlyRevenue: number
  estimatedCost: number
  hoursPerMonth: number
}

export async function analyzeProfit(services: Service[], totalOverhead: number, businessGoal: string) {
  const system = `You are a business profitability consultant. Identify exactly which parts of the business make the most money and what to do about it. Be specific with numbers. Return valid JSON only.`
  const user = `Services/products breakdown:
${JSON.stringify(services)}
Monthly overhead (not in service costs above): $${totalOverhead}
Business goal: ${businessGoal}

Return JSON:
{
  "totalMonthlyRevenue": 0,
  "totalMonthlyCost": 0,
  "netProfit": 0,
  "overallMargin": 0,
  "services": [
    {
      "name": "...",
      "revenue": 0,
      "cost": 0,
      "grossProfit": 0,
      "margin": 0,
      "revenuePerHour": 0,
      "tier": "star/cashcow/questionmark/dog",
      "recommendation": "grow/maintain/fix-pricing/cut"
    }
  ],
  "starServices": ["most profitable services"],
  "underperformers": ["services to fix or cut"],
  "pricingLevers": [
    { "service": "...", "currentImpliedPrice": 0, "recommendedPrice": 0, "revenueImpact": 0 }
  ],
  "costCuts": [
    { "area": "...", "currentCost": 0, "reducedCost": 0, "monthlySavings": 0, "difficulty": "easy/medium/hard" }
  ],
  "topActions": ["action1", "action2", "action3"],
  "revenueIf10PctPriceIncrease": 0,
  "profitableHourlyRate": 0
}`
  return runAgent(system, user, { jsonMode: true, maxTokens: 3000 })
}
