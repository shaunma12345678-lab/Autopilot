import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { generateServiceAgreement, generatePrivacyPolicy, generateNDA, generateTermsOfService } from "@/lib/agents/legal-agent"

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const business = await prisma.business.findFirst({ where: { userId: user.id } })
  if (!business) return Response.json({ error: "No business found" }, { status: 404 })

  const body = await request.json()
  const { action, ...params } = body

  try {
    if (action === "service-agreement") {
      const result = await generateServiceAgreement({
        businessName: business.name,
        businessType: business.type,
        ...params,
      })
      return Response.json(result)
    }
    if (action === "privacy-policy") {
      const result = await generatePrivacyPolicy({
        businessName: business.name,
        ...params,
      })
      return Response.json(result)
    }
    if (action === "nda") {
      const result = await generateNDA({
        businessName: business.name,
        ...params,
      })
      return Response.json(result)
    }
    if (action === "terms") {
      const result = await generateTermsOfService({
        businessName: business.name,
        ...params,
      })
      return Response.json(result)
    }
    return Response.json({ error: "Unknown action" }, { status: 400 })
  } catch (err) {
    console.error("Legal agent error:", err)
    return Response.json({ error: "Agent failed" }, { status: 500 })
  }
}
