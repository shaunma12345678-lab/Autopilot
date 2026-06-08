import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { generateReferralProgram, generateReferralCopy } from "@/lib/agents/referral-agent"

export async function POST(request: NextRequest) {
  const business = await prisma.business.findFirst({  })
  if (!business) return Response.json({ error: "No business found" }, { status: 404 })

  const body = await request.json()
  const { action, ...params } = body

  try {
    if (action === "program") {
      const result = await generateReferralProgram({
        businessName: business.name,
        businessType: business.type,
        ...params,
      })
      return Response.json(result)
    }
    if (action === "copy") {
      const result = await generateReferralCopy({
        businessName: business.name,
        businessType: business.type,
        ...params,
      })
      return Response.json(result)
    }
    return Response.json({ error: "Unknown action" }, { status: 400 })
  } catch (err) {
    console.error("Referral agent error:", err)
    return Response.json({ error: "Agent failed" }, { status: 500 })
  }
}
