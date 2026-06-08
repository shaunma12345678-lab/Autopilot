import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { generateFinancialInsights } from "@/lib/agents/financial-agent"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { businessId, currentMonthData, previousMonthData } = body

    if (!businessId || !currentMonthData || !previousMonthData) {
      return Response.json({ error: "businessId, currentMonthData, and previousMonthData are required" }, { status: 400 })
    }

    const business = await prisma.business.findFirst({
      where: { id: businessId },
    })
    if (!business) return Response.json({ error: "Business not found" }, { status: 404 })

    const insights = await generateFinancialInsights({
      businessName:        business.name,
      businessType:        business.type,
      currentMonthData,
      previousMonthData,
    })

    const report = await prisma.report.create({
      data: {
        businessId,
        type:    "FINANCIAL",
        summary: insights.summary,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data:    insights as any,
      },
    })

    return Response.json({ report, insights })
  } catch (err) {
    console.error("[financial-agent]", err)
    return Response.json({ error: "Failed to generate financial report" }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const businessId = searchParams.get("businessId")
    if (!businessId) return Response.json({ error: "businessId required" }, { status: 400 })

    const business = await prisma.business.findFirst({ where: { id: businessId } })
    if (!business) return Response.json({ error: "Not found" }, { status: 404 })

    const reports = await prisma.report.findMany({
      where: { businessId, type: "FINANCIAL" },
      orderBy: { createdAt: "desc" },
      take: 12,
    })

    return Response.json({ reports })
  } catch (err) {
    console.error("[financial-agent GET]", err)
    return Response.json({ error: "Failed to fetch reports" }, { status: 500 })
  }
}
