import { runAgent } from "@/lib/claude"

export async function forecastCashFlow(input: {
  currentCashBalance: number
  monthlyRevenue: number
  monthlyFixedExpenses: number
  monthlyVariableExpenses: number
  accountsReceivable: number
  accountsPayable: number
  upcomingLargeExpenses: string
  revenueGrowthRate: number
  seasonalNotes: string
}) {
  const system = `You are a CFO-level financial forecasting expert for small businesses. Build realistic, specific cash flow forecasts. Return valid JSON only.`
  const user = `Current financial snapshot:
- Cash on hand: $${input.currentCashBalance.toLocaleString()}
- Monthly revenue: $${input.monthlyRevenue.toLocaleString()}
- Monthly fixed expenses: $${input.monthlyFixedExpenses.toLocaleString()}
- Monthly variable expenses: $${input.monthlyVariableExpenses.toLocaleString()}
- Accounts receivable (owed to you): $${input.accountsReceivable.toLocaleString()}
- Accounts payable (you owe): $${input.accountsPayable.toLocaleString()}
- Expected monthly revenue growth: ${input.revenueGrowthRate}%
- Upcoming large expenses: ${input.upcomingLargeExpenses || "None specified"}
- Seasonal notes: ${input.seasonalNotes || "None"}

Return JSON:
{
  "headline": "one-line summary",
  "currentRunway": "months at current burn rate",
  "breakEvenDate": "month and year or 'Already profitable'",
  "monthlyNetCashFlow": dollar amount,
  "forecast": [
    { "month": "Month 1", "openingBalance": 0, "revenue": 0, "expenses": 0, "netFlow": 0, "closingBalance": 0, "flag": "green/yellow/red", "scenario": "base/optimistic/conservative" }
  ],
  "scenarios": {
    "base": { "month3Balance": 0, "month6Balance": 0, "summary": "..." },
    "optimistic": { "month3Balance": 0, "month6Balance": 0, "summary": "..." },
    "conservative": { "month3Balance": 0, "month6Balance": 0, "summary": "..." }
  },
  "cashFlowRisks": ["risk1", "risk2"],
  "topActions": ["action1", "action2", "action3"],
  "warningFlags": ["warning if any"],
  "healthScore": 75
}`
  return runAgent(system, user, { jsonMode: true, maxTokens: 3000 })
}
