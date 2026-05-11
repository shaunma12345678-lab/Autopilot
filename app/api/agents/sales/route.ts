import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { generateSalesScript } from "@/lib/agents/sales-agent"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const { businessId, service, price, targetCustomer, objections, uvp } = body

    if (!businessId || !service || !price || !targetCustomer || !uvp) {
      return Response.json({ error: "businessId, service, price, targetCustomer, and uvp are required" }, { status: 400 })
    }

    const business = await prisma.business.findFirst({
      where: { id: businessId, userId: user.id },
    })
    if (!business) return Response.json({ error: "Business not found" }, { status: 404 })

    const script = await generateSalesScript({
      businessName:   business.name,
      service,
      price,
      targetCustomer,
      objections:     objections ?? [],
      uvp,
    })

    const created = await prisma.content.create({
      data: {
        businessId,
        type:     "AD_COPY",
        platform: "Sales",
        body:     JSON.stringify(script, null, 2),
        hashtags: [],
        status:   "APPROVED",
      },
    })

    return Response.json({ content: created, script })
  } catch (err) {
    console.error("[sales-agent]", err)
    return Response.json({ error: "Failed to generate sales script" }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const businessId = searchParams.get("businessId")
    if (!businessId) return Response.json({ error: "businessId required" }, { status: 400 })

    const business = await prisma.business.findFirst({ where: { id: businessId, userId: user.id } })
    if (!business) return Response.json({ error: "Not found" }, { status: 404 })

    const scripts = await prisma.content.findMany({
      where: { businessId, type: "AD_COPY", platform: "Sales" },
      orderBy: { createdAt: "desc" },
      take: 20,
    })

    return Response.json({ scripts })
  } catch (err) {
    console.error("[sales-agent GET]", err)
    return Response.json({ error: "Failed to fetch sales scripts" }, { status: 500 })
  }
}
