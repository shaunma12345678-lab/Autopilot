// GET /api/leads/[id]/flood-risk — on-demand FEMA flood-zone lookup for any
// lead (residential or commercial). Cached into RawSignal (signalType
// "flood_risk") since flood maps don't change often — re-run only clears
// on explicit refresh.

export const maxDuration = 20

import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { assessFloodRisk } from "@/lib/flood-risk"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

    const { id } = await params
    const { searchParams } = new URL(request.url)
    const forceRefresh = searchParams.get("refresh") === "true"

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lead = await (prisma.lead as any).findFirst({ where: { id } })
    if (!lead) return Response.json({ error: "Lead not found" }, { status: 404 })

    if (!forceRefresh) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cached = await (prisma.rawSignal as any).findFirst({
        where: { leadId: id, signalType: "flood_risk" },
        orderBy: { createdAt: "desc" },
      })
      if (cached) return Response.json({ floodRisk: cached.rawData, cached: true })
    }

    const result = await assessFloodRisk(lead.name)
    if (!result) return Response.json({ error: "Could not geocode this address or reach FEMA's flood service" }, { status: 502 })

    const CUID_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789"
    const id2 = `c${Array.from({ length: 24 }, () => CUID_CHARS[Math.floor(Math.random() * CUID_CHARS.length)]).join("")}`
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma.rawSignal as any).create({
      data: {
        id: id2,
        leadId: id,
        address: lead.name,
        county: lead.source ?? "unknown",
        signalType: "flood_risk",
        signalDate: new Date().toISOString(),
        rawData: result,
        source: "fema-nfhl",
        assetClass: lead.assetClass ?? "residential",
      },
    })

    return Response.json({ floodRisk: result, cached: false })
  } catch (err) {
    console.error("[leads/[id]/flood-risk GET]", err)
    return Response.json({ error: "Failed to assess flood risk" }, { status: 500 })
  }
}
