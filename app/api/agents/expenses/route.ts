import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { analyzeExpenses, generateBudgetPlan } from "@/lib/agents/expense-agent"

export async function POST(request: NextRequest) {
  const business = await prisma.business.findFirst({  })
  if (!business) return Response.json({ error: "No business found" }, { status: 404 })

  const body = await request.json()
  const { action, ...params } = body

  try {
    if (action === "analyze") {
      const result = await analyzeExpenses({
        businessName: business.name,
        businessType: business.type,
        ...params,
      })
      return Response.json(result)
    }
    if (action === "budget") {
      const result = await generateBudgetPlan({
        businessName: business.name,
        businessType: business.type,
        ...params,
      })
      return Response.json(result)
    }
    return Response.json({ error: "Unknown action" }, { status: 400 })
  } catch (err) {
    console.error("Expense agent error:", err)
    return Response.json({ error: "Agent failed" }, { status: 500 })
  }
}
