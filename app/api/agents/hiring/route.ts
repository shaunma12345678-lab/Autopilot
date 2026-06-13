import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { generateJobDescription, generateInterviewKit, generateOfferLetter } from "@/lib/agents/hiring-agent"

export async function POST(request: NextRequest) {
  const business = await prisma.business.findFirst({  })
  if (!business) return Response.json({ error: "No business found" }, { status: 404 })

  const body = await request.json()
  const { action, ...params } = body

  try {
    if (action === "job-description") {
      const result = await generateJobDescription({
        businessName: business.name,
        businessType: business.type,
        ...params,
      })
      return Response.json(result)
    }
    if (action === "interview-kit") {
      const result = await generateInterviewKit({
        businessType: business.type,
        ...params,
      })
      return Response.json(result)
    }
    if (action === "offer-letter") {
      const result = await generateOfferLetter({
        businessName: business.name,
        ...params,
      })
      return Response.json(result)
    }
    return Response.json({ error: "Unknown action" }, { status: 400 })
  } catch (err) {
    console.error("Hiring agent error:", err)
    return Response.json({ error: "Agent failed" }, { status: 500 })
  }
}
