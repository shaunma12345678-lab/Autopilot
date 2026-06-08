import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { analyzeCompetitors, generateCompetitorSWOT } from "@/lib/agents/competitor-agent"

export async function POST(request: NextRequest) {
  const business = await prisma.business.findFirst({  })
  if (!business) return Response.json({ error: "No business found" }, { status: 404 })

  const body = await request.json()
  const { action, ...params } = body

  try {
    if (action === "analyze") {
      const result = await analyzeCompetitors({
        businessName: business.name,
        businessType: business.type,
        location: business.location,
        ...params,
      })
      return Response.json(result)
    }
    if (action === "swot") {
      const result = await generateCompetitorSWOT({
        businessName: business.name,
        businessType: business.type,
        location: business.location,
        ...params,
      })
      return Response.json(result)
    }
    return Response.json({ error: "Unknown action" }, { status: 400 })
  } catch (err) {
    console.error("Competitor agent error:", err)
    return Response.json({ error: "Agent failed" }, { status: 500 })
  }
}
