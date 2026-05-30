import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { analyzeTaxStrategy } from "@/lib/agents/tax-agent"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const { action, ...params } = body

    if (action === "analyze") {
      const result = await analyzeTaxStrategy({
        businessStructure: String(params.businessStructure ?? "LLC"),
        annualRevenue: Number(params.annualRevenue ?? 0),
        estimatedProfit: Number(params.estimatedProfit ?? 0),
        ownerSalary: Number(params.ownerSalary ?? 0),
        state: String(params.state ?? ""),
        topExpenseCategories: String(params.topExpenseCategories ?? ""),
        hasRetirementPlan: Boolean(params.hasRetirementPlan),
        homeOffice: Boolean(params.homeOffice),
        vehicleUsed: Boolean(params.vehicleUsed),
      })
      return Response.json(result)
    }

    return Response.json({ error: "Unknown action" }, { status: 400 })
  } catch (err) {
    console.error("Tax strategy agent error:", err)
    return Response.json({ error: "Agent failed" }, { status: 500 })
  }
}
