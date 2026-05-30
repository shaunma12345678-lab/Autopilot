import { runAgent } from "@/lib/claude"

const SYSTEM_PROMPT = `You are a CFO-level advisor for small businesses. You find the money hiding in plain sight — redundant subscriptions, over-staffed processes, vendor alternatives, and pricing tiers that small businesses are paying enterprise rates for. You speak in plain English with specific dollar amounts.

Rules:
- Every recommendation must have an estimated dollar impact
- Savings suggestions must be immediately actionable
- Never recommend cutting expenses that drive revenue
- Return valid JSON only`

export async function analyzeExpenses(params: {
  businessName: string
  businessType: string
  monthlyExpenses: Array<{ category: string; amount: number; vendor?: string; description?: string }>
  monthlyRevenue: number
}): Promise<{
  totalMonthlyExpenses: number
  expenseRatio: string
  benchmarkComparison: string
  categoryBreakdown: Array<{
    category: string
    amount: number
    percentOfRevenue: string
    benchmark: string
    status: "over" | "on-track" | "under"
  }>
  savingsOpportunities: Array<{
    item: string
    currentCost: string
    suggestedAction: string
    estimatedMonthlySavings: number
    difficulty: "easy" | "medium" | "hard"
    timeline: string
  }>
  negotiationTargets: Array<{
    vendor: string
    currentRate: string
    negotiationScript: string
    potentialSavings: string
  }>
  totalPotentialMonthlySavings: number
  prioritizedActionPlan: string[]
}> {
  const user = `Analyze expenses for ${params.businessName} (${params.businessType}).

Monthly revenue: $${params.monthlyRevenue.toLocaleString()}
Monthly expenses:
${params.monthlyExpenses.map(e => `- ${e.category}${e.vendor ? ` (${e.vendor})` : ""}: $${e.amount}${e.description ? ` — ${e.description}` : ""}`).join("\n")}

Deliver:
1. Total expenses with expense/revenue ratio and benchmark comparison for this business type
2. Category breakdown with benchmark comparison and status indicator
3. Savings opportunities: each with current cost, specific action, estimated monthly savings, difficulty, timeline
4. Vendor negotiation targets: which vendors to call, what to say, expected outcome
5. Total potential monthly savings (realistic, not optimistic)
6. Prioritized action plan: top 5 actions this week

Return JSON with: totalMonthlyExpenses, expenseRatio, benchmarkComparison, categoryBreakdown, savingsOpportunities, negotiationTargets, totalPotentialMonthlySavings, prioritizedActionPlan`

  return (await runAgent(SYSTEM_PROMPT, user, { jsonMode: true, maxTokens: 3000 })) as ReturnType<typeof analyzeExpenses> extends Promise<infer T> ? T : never
}

export async function generateBudgetPlan(params: {
  businessName: string
  businessType: string
  currentMonthlyRevenue: number
  targetMonthlyRevenue: number
  currentExpenses: Record<string, number>
  timeframeMonths: number
}): Promise<{
  currentState: { revenue: number; expenses: number; profit: number; margin: string }
  targetState: { revenue: number; expenses: number; profit: number; margin: string }
  budgetAllocation: Array<{
    category: string
    currentAmount: number
    recommendedAmount: number
    percentOfRevenue: string
    rationale: string
  }>
  investmentPriorities: Array<{
    area: string
    monthlyBudget: number
    expectedReturn: string
    startMonth: number
  }>
  milestones: Array<{ month: number; revenue: number; keyMetric: string }>
  cashFlowWarnings: string[]
}> {
  const user = `Build a ${params.timeframeMonths}-month budget plan for ${params.businessName} to grow from $${params.currentMonthlyRevenue}/month to $${params.targetMonthlyRevenue}/month.

Business type: ${params.businessType}
Current expenses: ${JSON.stringify(params.currentExpenses)}

Create:
1. Current vs target state comparison with margins
2. Recommended budget allocation for each expense category at target revenue
3. Investment priorities: where to spend to hit the revenue goal (with expected ROI)
4. Monthly milestones with leading indicators
5. Cash flow warnings: what to watch for that would derail the plan

Return JSON with: currentState, targetState, budgetAllocation, investmentPriorities, milestones, cashFlowWarnings`

  return (await runAgent(SYSTEM_PROMPT, user, { jsonMode: true, maxTokens: 2500 })) as ReturnType<typeof generateBudgetPlan> extends Promise<infer T> ? T : never
}
