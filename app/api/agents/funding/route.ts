import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { analyzeFundingReadiness } from "@/lib/agents/funding-agent"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const { action, ...params } = body

    if (action === "analyze") {
      const result = await analyzeFundingReadiness({
        businessAgeMonths: Number(params.businessAgeMonths ?? 0),
        annualRevenue: Number(params.annualRevenue ?? 0),
        monthlyRevenue: Number(params.monthlyRevenue ?? 0),
        monthlyProfit: Number(params.monthlyProfit ?? 0),
        currentDebt: Number(params.currentDebt ?? 0),
        monthlyDebtPayments: Number(params.monthlyDebtPayments ?? 0),
        creditScore: String(params.creditScore ?? "650-699"),
        industryType: String(params.industryType ?? ""),
        fundingAmount: Number(params.fundingAmount ?? 0),
        fundingPurpose: String(params.fundingPurpose ?? ""),
        fundingType: String(params.fundingType ?? "SBA Loan"),
      })
      return Response.json(result)
    }

    return Response.json({ error: "Unknown action" }, { status: 400 })
  } catch (err) {
    console.error("Funding agent error:", err)
    return Response.json({ error: "Agent failed" }, { status: 500 })
  }
}
