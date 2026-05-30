import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { forecastCashFlow } from "@/lib/agents/cashflow-agent"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const { action, ...params } = body

    if (action === "forecast") {
      const result = await forecastCashFlow({
        currentCashBalance: Number(params.currentCashBalance ?? 0),
        monthlyRevenue: Number(params.monthlyRevenue ?? 0),
        monthlyFixedExpenses: Number(params.monthlyFixedExpenses ?? 0),
        monthlyVariableExpenses: Number(params.monthlyVariableExpenses ?? 0),
        accountsReceivable: Number(params.accountsReceivable ?? 0),
        accountsPayable: Number(params.accountsPayable ?? 0),
        upcomingLargeExpenses: String(params.upcomingLargeExpenses ?? ""),
        revenueGrowthRate: Number(params.revenueGrowthRate ?? 5),
        seasonalNotes: String(params.seasonalNotes ?? ""),
      })
      return Response.json(result)
    }

    return Response.json({ error: "Unknown action" }, { status: 400 })
  } catch (err) {
    console.error("Cashflow agent error:", err)
    return Response.json({ error: "Agent failed" }, { status: 500 })
  }
}
