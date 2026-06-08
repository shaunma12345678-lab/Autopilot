import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { businessId, name, email, phone, source } = body

    const business = await prisma.business.findFirst({
      where: { id: businessId },
    })
    if (!business) return Response.json({ error: "Not found" }, { status: 404 })

    const lead = await prisma.lead.create({
      data: { businessId, name, email: email || null, phone: phone || null, source: source ?? "Manual" },
    })

    return Response.json({ lead })
  } catch (err) {
    console.error("[leads POST]", err)
    return Response.json({ error: "Failed to create lead" }, { status: 500 })
  }
}
