// GET /api/leads/early-warning — returns earlyWarning=true leads sorted by score desc.
// Also returns signal timeline for each lead.

import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const businessId = searchParams.get("businessId")
    const layerFilter = searchParams.get("layer") ? Number(searchParams.get("layer")) : null
    const earlyOnly = searchParams.get("earlyOnly") !== "false"

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const business = await (prisma.business as any).findFirst({
      where: { id: businessId ?? undefined, userId: user.id },
    })
    if (!business) return Response.json({ error: "Business not found" }, { status: 404 })

    const where: Record<string, unknown> = { businessId: (business as { id: string }).id }
    if (earlyOnly) where.earlyWarning = true
    if (layerFilter) where.distressLayer = layerFilter

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const leads = await (prisma.lead as any).findMany({
      where,
      orderBy: { score: "desc" },
      take: 100,
    })

    // Fetch raw signals for each lead
    const leadIds: string[] = (leads as Array<{ id: string }>).map(l => l.id)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawSignals = leadIds.length > 0 ? await (prisma.rawSignal as any).findMany({
      where: { leadId: { in: leadIds } },
      orderBy: { signalDate: "asc" },
    }) : []

    // Group signals by leadId
    const signalsByLead = new Map<string, unknown[]>()
    for (const sig of (rawSignals as Array<{ leadId: string }>)) {
      const arr = signalsByLead.get(sig.leadId) ?? []
      arr.push(sig)
      signalsByLead.set(sig.leadId, arr)
    }

    const enriched = (leads as Array<{ id: string }>).map(lead => ({
      ...lead,
      signals: signalsByLead.get(lead.id) ?? [],
    }))

    return Response.json({ leads: enriched, total: enriched.length })
  } catch (err) {
    console.error("[early-warning GET]", err)
    return Response.json({ error: "Failed to fetch" }, { status: 500 })
  }
}
