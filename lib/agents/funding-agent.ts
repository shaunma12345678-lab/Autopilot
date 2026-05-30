import { runAgent } from "@/lib/claude"

export async function analyzeFundingReadiness(input: {
  businessAgeMonths: number
  annualRevenue: number
  monthlyRevenue: number
  monthlyProfit: number
  currentDebt: number
  monthlyDebtPayments: number
  creditScore: string
  industryType: string
  fundingAmount: number
  fundingPurpose: string
  fundingType: string
}) {
  const system = `You are a business finance advisor who has helped hundreds of small businesses secure SBA loans, lines of credit, and investor funding. Return valid JSON only.`
  const user = `Business profile:
- Age: ${input.businessAgeMonths} months
- Annual revenue: $${input.annualRevenue.toLocaleString()}
- Monthly revenue: $${input.monthlyRevenue.toLocaleString()}
- Monthly profit: $${input.monthlyProfit.toLocaleString()}
- Current debt: $${input.currentDebt.toLocaleString()}
- Monthly debt payments: $${input.monthlyDebtPayments.toLocaleString()}
- Credit score range: ${input.creditScore}
- Industry: ${input.industryType}
- Funding needed: $${input.fundingAmount.toLocaleString()}
- Purpose: ${input.fundingPurpose}
- Funding type sought: ${input.fundingType}

Return JSON:
{
  "overallReadinessScore": 75,
  "readinessGrade": "B",
  "dscrRatio": 0,
  "debtToIncomeRatio": 0,
  "estimatedMonthlyPayment": 0,
  "loanToRevenueRatio": 0,
  "fundingOptions": [
    {
      "type": "SBA 7(a) Loan",
      "likelihood": "High/Medium/Low",
      "estimatedRate": "7–10%",
      "requirements": ["req1", "req2"],
      "howToApply": "specific steps"
    }
  ],
  "strengthsForLenders": ["strength1", "strength2"],
  "weaknessesToFix": [
    { "issue": "...", "impact": "...", "fix": "...", "timeToFix": "3–6 months" }
  ],
  "documentsNeeded": ["doc1", "doc2"],
  "pitchSummary": "2-sentence elevator pitch for lenders/investors",
  "topActions": ["action to take now 1", "action 2", "action 3"],
  "timelineToApproval": "estimate"
}`
  return runAgent(system, user, { jsonMode: true, maxTokens: 3000 })
}
