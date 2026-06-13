import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { handleSupportQuery, generateFAQ } from "@/lib/agents/support-agent"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { businessId, action, query, faq, conversationHistory } = body

    const business = await prisma.business.findFirst({
      where: { id: businessId },
    })
    if (!business) return Response.json({ error: "Business not found" }, { status: 404 })

    const brandVoice = business.brandVoice as Record<string, unknown>

    if (action === "generate-faq") {
      const result = await generateFAQ({
        businessName: business.name,
        businessType: business.type,
        location:     business.location,
        services:     (business.brandVoice as Record<string, unknown> & { services?: string[] })?.services ?? [],
      })
      return Response.json({ faq: result })
    }

    if (!query) return Response.json({ error: "query is required" }, { status: 400 })

    const result = await handleSupportQuery({
      businessName:        business.name,
      businessType:        business.type,
      brandVoice,
      faq:                 faq ?? "",
      query,
      conversationHistory: conversationHistory ?? [],
    })

    return Response.json({ result })
  } catch (err) {
    console.error("[support-agent]", err)
    return Response.json({ error: "Failed to generate support reply" }, { status: 500 })
  }
}
