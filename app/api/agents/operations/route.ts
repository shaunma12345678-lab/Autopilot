import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { generateSOP, generateDailyChecklist, generateDelegationPlan } from "@/lib/agents/operations-agent"

export async function POST(request: NextRequest) {
  const business = await prisma.business.findFirst({  })
  if (!business) return Response.json({ error: "No business found" }, { status: 404 })

  const body = await request.json()
  const { action, ...params } = body

  try {
    if (action === "sop") {
      const result = await generateSOP({
        businessName: business.name,
        businessType: business.type,
        ...params,
      })
      return Response.json(result)
    }
    if (action === "checklist") {
      const result = await generateDailyChecklist({
        businessName: business.name,
        businessType: business.type,
        ...params,
      })
      return Response.json(result)
    }
    if (action === "delegation") {
      const result = await generateDelegationPlan({
        businessName: business.name,
        ...params,
      })
      return Response.json(result)
    }
    return Response.json({ error: "Unknown action" }, { status: 400 })
  } catch (err) {
    console.error("Operations agent error:", err)
    return Response.json({ error: "Agent failed" }, { status: 500 })
  }
}
