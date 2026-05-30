import { runAgent } from "@/lib/claude"

export async function analyzeTaxStrategy(input: {
  businessStructure: string
  annualRevenue: number
  estimatedProfit: number
  ownerSalary: number
  state: string
  topExpenseCategories: string
  hasRetirementPlan: boolean
  homeOffice: boolean
  vehicleUsed: boolean
}) {
  const system = `You are a small business tax strategist and CPA. Provide specific, actionable tax reduction strategies. Always add disclaimer that this is for educational purposes. Return valid JSON only.`
  const user = `Business profile:
- Structure: ${input.businessStructure}
- Annual revenue: $${input.annualRevenue.toLocaleString()}
- Estimated annual profit: $${input.estimatedProfit.toLocaleString()}
- Owner salary/draw: $${input.ownerSalary.toLocaleString()}
- State: ${input.state}
- Top expenses: ${input.topExpenseCategories}
- Has retirement plan: ${input.hasRetirementPlan}
- Home office: ${input.homeOffice}
- Vehicle for business: ${input.vehicleUsed}

Return JSON:
{
  "estimatedAnnualTaxBill": 0,
  "quarterlyEstimatedPayments": [
    { "quarter": "Q1 (April 15)", "amount": 0 },
    { "quarter": "Q2 (June 15)", "amount": 0 },
    { "quarter": "Q3 (Sept 15)", "amount": 0 },
    { "quarter": "Q4 (Jan 15)", "amount": 0 }
  ],
  "effectiveTaxRate": 0,
  "topDeductions": [
    { "category": "...", "estimatedDeduction": 0, "notes": "..." }
  ],
  "missedDeductions": [
    { "deduction": "...", "potentialSavings": 0, "howToQualify": "..." }
  ],
  "entityOptimization": {
    "currentStructure": "...",
    "recommendedStructure": "...",
    "potentialAnnualSavings": 0,
    "reasoning": "..."
  },
  "retirementStrategies": ["strategy1", "strategy2"],
  "totalPotentialSavings": 0,
  "urgentActions": ["action1", "action2"],
  "disclaimer": "This is for educational purposes only. Consult a licensed CPA or tax professional."
}`
  return runAgent(system, user, { jsonMode: true, maxTokens: 3000 })
}
