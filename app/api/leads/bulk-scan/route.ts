// Bulk pre-foreclosure lead scanner.
// POST { password, target: 100|200|300, counties?: string[], businessId? }
// Runs parallel ZIP-based searches across 1-4 counties and returns
// all leads ranked best-to-worst by deal score.

export const maxDuration = 60

import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { COUNTY_ZIPS, TARGET_ZIP_COUNT } from "@/lib/zip-codes"
import { bulkScan } from "@/lib/bulk-scraper"
import { processSignals } from "@/lib/signal-processor"

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? ""   // no fallback: unset env disables admin access

// Which counties to scan per target level (smaller targets = fewer counties)
const TARGET_COUNTIES: Record<number, string[]> = {
  100: ["san-diego"],
  200: ["san-diego", "riverside"],
  300: ["san-diego", "riverside", "san-bernardino"],
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const {
      password,
      target    = 100,
      counties: reqCounties,
      businessId: bId,
    } = body as {
      password:    string
      target?:     number
      counties?:   string[]
      businessId?: string
    }

    if (!ADMIN_PASSWORD || password !== ADMIN_PASSWORD) {
      return Response.json({ error: "Invalid password" }, { status: 403 })
    }

    // Resolve businessId
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const businessId: string | null = bId ?? (
      ((await (prisma.business as any).findFirst({ where: { userId: user.id } })) as { id: string } | null)?.id ?? null
    )
    if (!businessId) return Response.json({ error: "No business found for user" }, { status: 400 })

    // Normalise target to one of our three tiers
    const tier    = target >= 300 ? 300 : target >= 200 ? 200 : 100
    const counties = reqCounties?.length ? reqCounties : (TARGET_COUNTIES[tier] ?? ["san-diego"])
    const zipsPerCounty = Math.ceil((TARGET_ZIP_COUNT[tier] ?? 18) / counties.length)

    // Distribute the 60-second budget evenly across counties
    // Reserve 8 s for processSignals at the end
    const totalScrapeMs = 52000
    const msPerCounty   = Math.floor(totalScrapeMs / counties.length)
    const startMs       = Date.now()

    let totalSignals = 0
    let totalCreated = 0
    let totalUpdated = 0
    const countyBreakdown: Record<string, number> = {}

    for (const countyId of counties) {
      const zips = COUNTY_ZIPS[countyId]
      if (!zips) continue

      const countyDeadline = startMs + (counties.indexOf(countyId) + 1) * msPerCounty
      const signals = await bulkScan(countyId, zips.slice(0, zipsPerCounty), tier * 3, countyDeadline)

      if (signals.length === 0) {
        countyBreakdown[countyId] = 0
        continue
      }

      const result = await processSignals(signals, businessId)
      countyBreakdown[countyId] = result.created + result.updated
      totalSignals += result.signals
      totalCreated += result.created
      totalUpdated += result.updated
    }

    // Return the top leads sorted best-to-worst
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const leads = await (prisma.lead as any).findMany({
      where:   { businessId },
      orderBy: { score: "desc" },
      take:    tier,
      include: { rawSignals: { orderBy: { signalDate: "desc" }, take: 5 } },
    })

    return Response.json({
      success:          true,
      target:           tier,
      counties,
      signalsFound:     totalSignals,
      leadsCreated:     totalCreated,
      leadsUpdated:     totalUpdated,
      countyBreakdown,
      leads,
    })
  } catch (err) {
    console.error("[bulk-scan POST]", err)
    return Response.json({ error: err instanceof Error ? err.message : "Bulk scan failed" }, { status: 500 })
  }
}

// GET — returns existing leads sorted by score, useful for reviewing last scan results
export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "300"), 300)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const business = await (prisma.business as any).findFirst({ where: { userId: user.id } })
    if (!business) return Response.json({ leads: [] })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const leads = await (prisma.lead as any).findMany({
      where:   { businessId: (business as { id: string }).id },
      orderBy: { score: "desc" },
      take:    limit,
      include: { rawSignals: { orderBy: { signalDate: "desc" }, take: 5 } },
    })

    return Response.json({ leads })
  } catch (err) {
    console.error("[bulk-scan GET]", err)
    return Response.json({ error: "Failed to fetch leads" }, { status: 500 })
  }
}
