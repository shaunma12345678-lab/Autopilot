import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { analyzeChurnRisk, generateLoyaltyProgram, generateRetentionCampaign } from "@/lib/agents/retention-agent"

export async function POST(request: NextRequest) {
  const business = await prisma.business.findFirst({  })
  if (!business) return Response.json({ error: "No business found" }, { status: 404 })

  const body = await request.json()
  const { action, ...params } = body

  try {
    if (action === "churn") {
      const result = await analyzeChurnRisk({
        businessName: business.name,
        businessType: business.type,
        ...params,
      })
      return Response.json(result)
    }
    if (action === "loyalty") {
      const result = await generateLoyaltyProgram({
        businessName: business.name,
        businessType: business.type,
        ...params,
      })
      return Response.json(result)
    }
    if (action === "campaign") {
      const result = await generateRetentionCampaign({
        businessName: business.name,
        businessType: business.type,
        ...params,
      })
      return Response.json(result)
    }
    return Response.json({ error: "Unknown action" }, { status: 400 })
  } catch (err) {
    console.error("Retention agent error:", err)
    return Response.json({ error: "Agent failed" }, { status: 500 })
  }
}
