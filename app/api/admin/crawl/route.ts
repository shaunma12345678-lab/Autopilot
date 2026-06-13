// Manual crawl trigger — admin only.
// POST /api/admin/crawl  { password, countyId, layer, businessId? }

export const maxDuration = 60 // Vercel Hobby max

import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { COUNTIES, getCounty } from "@/lib/config/counties"
import { scrapeLayer1 } from "@/lib/scrapers/layer1"
import { scrapeLayer2 } from "@/lib/scrapers/layer2"
import { scrapeLayer3 } from "@/lib/scrapers/layer3"
import { processSignals, upsertSource } from "@/lib/signal-processor"

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "ap2026admin"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const { password, countyId = "san-diego", layer = 1, businessId: bId } = body

    if (password !== ADMIN_PASSWORD) {
      return Response.json({ error: "Invalid password" }, { status: 403 })
    }

    const county = getCounty(countyId)
    if (!county) {
      return Response.json({ error: `Unknown county: ${countyId}. Valid: ${COUNTIES.map(c => c.id).join(", ")}` }, { status: 400 })
    }

    // Resolve businessId
    const businessId: string | null = bId ?? (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((await (prisma.business as any).findFirst({ where: { userId: user.id } })) as { id: string } | null)?.id ?? null
    )
    if (!businessId) return Response.json({ error: "No business found for user" }, { status: 400 })

    const scraper = layer === 1 ? scrapeLayer1 : layer === 2 ? scrapeLayer2 : scrapeLayer3
    const layerNum = layer as 1 | 2 | 3

    let rawSignals: Awaited<ReturnType<typeof scrapeLayer1>> = []
    let success = true
    let errorMsg: string | undefined

    try {
      rawSignals = await scraper(county)
    } catch (err) {
      success = false
      errorMsg = err instanceof Error ? err.message : String(err)
    }

    const sources = county.sources.filter(s => s.layer === layerNum)
    for (const src of sources) {
      await upsertSource({ name: src.name, county: county.name, layer: layerNum, success, errorMsg })
    }

    if (!success) {
      return Response.json({ error: errorMsg, signalsFound: 0 }, { status: 500 })
    }

    const result = await processSignals(rawSignals, businessId)

    return Response.json({
      success: true,
      county: county.name,
      layer: layerNum,
      signalsFound: result.signals,
      leadsCreated: result.created,
      leadsUpdated: result.updated,
    })
  } catch (err) {
    console.error("[admin/crawl POST]", err)
    return Response.json({ error: err instanceof Error ? err.message : "Crawl failed" }, { status: 500 })
  }
}

// GET — list all counties and their source health
export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sources = await (prisma.source as any).findMany({
      where: {},
      orderBy: { county: "asc" },
    })

    return Response.json({ counties: COUNTIES.map(c => c.id), sources })
  } catch (err) {
    console.error("[admin/crawl GET]", err)
    return Response.json({ error: "Failed to fetch" }, { status: 500 })
  }
}
