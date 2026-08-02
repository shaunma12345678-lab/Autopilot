// GET /api/exchange/[id]/matches — ranked replacement-property candidates
// from this business's existing lead inventory (residential + commercial).

import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { findExchangeMatches } from "@/lib/exchange-matcher"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

    const { id } = await params
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const exchangeRequest = await (prisma.exchangeRequest as any).findFirst({ where: { id } })
    if (!exchangeRequest) return Response.json({ error: "Exchange request not found" }, { status: 404 })

    const matches = await findExchangeMatches({
      businessId: exchangeRequest.businessId,
      targetPriceMin: exchangeRequest.targetPriceMin,
      targetPriceMax: exchangeRequest.targetPriceMax,
      targetPropertyType: exchangeRequest.targetPropertyType,
      targetCounties: exchangeRequest.targetCounties ?? [],
    })

    const daysToIdentify = Math.round((new Date(exchangeRequest.identificationDeadline).getTime() - Date.now()) / 86400000)

    return Response.json({ matches, daysToIdentify, exchangeRequest })
  } catch (err) {
    console.error("[exchange/[id]/matches GET]", err)
    return Response.json({ error: "Failed to find matches" }, { status: 500 })
  }
}
