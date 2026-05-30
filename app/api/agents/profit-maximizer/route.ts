import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { analyzeProfit } from "@/lib/agents/profit-agent"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const { action, services, totalOverhead, businessGoal } = body

    if (action === "analyze") {
      if (!Array.isArray(services) || services.length === 0) {
        return Response.json({ error: "services array is required" }, { status: 400 })
      }
      const result = await analyzeProfit(services, Number(totalOverhead ?? 0), String(businessGoal ?? ""))
      return Response.json(result)
    }

    return Response.json({ error: "Unknown action" }, { status: 400 })
  } catch (err) {
    console.error("Profit maximizer agent error:", err)
    return Response.json({ error: "Agent failed" }, { status: 500 })
  }
}
