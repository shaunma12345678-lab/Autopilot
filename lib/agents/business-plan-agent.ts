import { runAgent } from "@/lib/claude"

const SYSTEM_PROMPT = `You are a business strategy consultant and experienced startup advisor. You've reviewed hundreds of business plans and know exactly what investors, lenders, and smart operators need to see. You write plans that are honest, realistic, and compelling — not fantasy projections with no basis.

Rules:
- Financial projections must show assumptions, not just numbers
- Every strategy must have a specific execution path
- Strengths must be real — don't invent competitive advantages
- Return valid JSON only`

export async function generateBusinessPlan(params: {
  businessName: string
  businessType: string
  location: string
  targetMarket: string
  problem: string
  solution: string
  revenue: string
  currentStage: "idea" | "pre-revenue" | "early-revenue" | "growth"
  fundingNeeded?: number
}): Promise<{
  executiveSummary: string
  companyDescription: { overview: string; missionStatement: string; vision: string; values: string[] }
  marketAnalysis: {
    targetMarket: string
    marketSize: string
    customerPersonas: Array<{ name: string; demographics: string; painPoints: string[]; buyingTriggers: string[] }>
    trends: string[]
    entryStrategy: string
  }
  competitiveAnalysis: {
    competitors: Array<{ name: string; strength: string; weakness: string }>
    competitiveAdvantage: string
    moat: string
  }
  productsServices: {
    offerings: Array<{ name: string; description: string; price: string; margin: string }>
    revenueModel: string
    unitEconomics: string
  }
  marketingPlan: {
    acquisitionChannels: Array<{ channel: string; strategy: string; estimatedCac: string }>
    retentionStrategy: string
    monthlyMarketingBudget: string
  }
  operationsPlan: {
    keySystems: string[]
    teamStructure: string
    technologyStack: string
    criticalMilestones: Array<{ milestone: string; targetDate: string; successMetric: string }>
  }
  financialProjections: {
    assumptions: string[]
    monthlyProjections: Array<{ month: number; revenue: number; expenses: number; profit: number; cumulativeCash: number }>
    breakEvenMonth: number
    year1Revenue: number
    year3Revenue: number
  }
  fundingAsk?: {
    amount: string
    use: Array<{ item: string; amount: string; timeline: string }>
    expectedReturn: string
    exitOptions: string[]
  }
  riskAnalysis: Array<{ risk: string; severity: "high" | "medium" | "low"; mitigation: string }>
}> {
  const user = `Write a comprehensive business plan for ${params.businessName} (${params.businessType} in ${params.location}).

Target market: ${params.targetMarket}
Problem being solved: ${params.problem}
Solution: ${params.solution}
Revenue model: ${params.revenue}
Current stage: ${params.currentStage}
Funding needed: ${params.fundingNeeded ? `$${params.fundingNeeded.toLocaleString()}` : "Not seeking funding"}

Write a complete, realistic business plan. Show your assumptions for financial projections. Be specific about the target market, not generic. The competitive advantage must be genuine.

Return JSON with all sections: executiveSummary, companyDescription, marketAnalysis, competitiveAnalysis, productsServices, marketingPlan, operationsPlan, financialProjections${params.fundingNeeded ? ", fundingAsk" : ""}, riskAnalysis`

  return (await runAgent(SYSTEM_PROMPT, user, { jsonMode: true, maxTokens: 5000 })) as ReturnType<typeof generateBusinessPlan> extends Promise<infer T> ? T : never
}

export async function generateExecutiveSummary(params: {
  businessName: string
  businessType: string
  problem: string
  solution: string
  traction: string
  ask: string
}): Promise<{
  onePager: string
  elevatorPitch: { thirtySeconds: string; twoMinutes: string }
  keyMetrics: Array<{ metric: string; value: string; context: string }>
  investorQuestions: Array<{ question: string; suggestedAnswer: string }>
}> {
  const user = `Write an executive summary and pitch materials for ${params.businessName}.

Problem: ${params.problem}
Solution: ${params.solution}
Traction/proof: ${params.traction}
The ask: ${params.ask}

Deliver:
1. One-page executive summary (600 words max) — the document that gets a meeting
2. 30-second elevator pitch
3. 2-minute investor pitch
4. 5 key metrics that tell the most compelling story
5. Top 10 questions investors will ask + suggested answers

Return JSON with: onePager, elevatorPitch, keyMetrics, investorQuestions`

  return (await runAgent(SYSTEM_PROMPT, user, { jsonMode: true, maxTokens: 3000 })) as ReturnType<typeof generateExecutiveSummary> extends Promise<infer T> ? T : never
}
