// POST /api/exchange — create a 1031 exchange request (auto-computes the IRS
// 45-day identification / 180-day closing deadlines from the sale date).
// GET  /api/exchange — list this business's exchange requests.

import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { computeDeadlines } from "@/lib/exchange-matcher"

async function resolveBusinessId(userId: string): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const business = await (prisma.business as any).findFirst({ where: { userId } })
  return business?.id ?? null
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const businessId = await resolveBusinessId(user.id)
  if (!businessId) return Response.json({ error: "No business found for user" }, { status: 400 })

  let body: {
    sellingPropertyAddress?: string
    saleClosingDate?: string
    targetPriceMin?: number
    targetPriceMax?: number
    targetPropertyType?: string
    targetCounties?: string[]
    notes?: string
  }
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }) }
  if (!body.sellingPropertyAddress || !body.saleClosingDate) {
    return Response.json({ error: "sellingPropertyAddress and saleClosingDate are required" }, { status: 400 })
  }

  const saleClosingDate = new Date(body.saleClosingDate)
  if (isNaN(saleClosingDate.getTime())) return Response.json({ error: "Invalid saleClosingDate" }, { status: 400 })
  const { identificationDeadline, closingDeadline } = computeDeadlines(saleClosingDate)

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const created = await (prisma.exchangeRequest as any).create({
      data: {
        businessId,
        sellingPropertyAddress: body.sellingPropertyAddress,
        saleClosingDate: saleClosingDate.toISOString(),
        identificationDeadline: identificationDeadline.toISOString(),
        closingDeadline: closingDeadline.toISOString(),
        targetPriceMin: body.targetPriceMin ?? null,
        targetPriceMax: body.targetPriceMax ?? null,
        targetPropertyType: body.targetPropertyType ?? "any",
        targetCounties: body.targetCounties ?? [],
        notes: body.notes ?? null,
      },
    })
    return Response.json({ exchangeRequest: created })
  } catch (err) {
    console.error("[exchange POST]", err)
    return Response.json({ error: "Failed to create exchange request" }, { status: 500 })
  }
}

export async function GET() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const businessId = await resolveBusinessId(user.id)
  if (!businessId) return Response.json({ error: "No business found for user" }, { status: 400 })

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const requests = await (prisma.exchangeRequest as any).findMany({
      where: { businessId },
      orderBy: { identificationDeadline: "asc" },
    })
    return Response.json({ exchangeRequests: requests })
  } catch (err) {
    console.error("[exchange GET]", err)
    return Response.json({ error: "Failed to fetch exchange requests" }, { status: 500 })
  }
}
