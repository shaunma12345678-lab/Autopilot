import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { generatePricingStrategy, generatePricingPage } from "@/lib/agents/pricing-agent"

export async function POST(request: NextRequest) {
  const business = await prisma.business.findFirst({  })
  if (!business) return Response.json({ error: "No business found" }, { status: 404 })

  const body = await request.json()
  const { action, ...params } = body

  try {
    if (action === "strategy") {
      const result = await generatePricingStrategy({
        businessName: business.name,
        businessType: business.type,
        location: business.location,
        ...params,
      })
      return Response.json(result)
    }
    if (action === "page") {
      const result = await generatePricingPage({
        businessName: business.name,
        ...params,
      })
      return Response.json(result)
    }
    return Response.json({ error: "Unknown action" }, { status: 400 })
  } catch (err) {
    console.error("Pricing agent error:", err)
    return Response.json({ error: "Agent failed" }, { status: 500 })
  }
}
