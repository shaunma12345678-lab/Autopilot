// Continuous commercial real estate distress discovery — runs on Vercel Cron.
// Mirrors the residential layer1/2 scraper + processSignals pipeline used by
// /api/admin/crawl, but automated across all businesses and all CRE counties,
// tagging every Lead/RawSignal/Source with assetClass = "commercial" so it
// never collides with the residential pipeline.
//
// Secured with CRON_SECRET so only Vercel's cron invoker can trigger it.

export const maxDuration = 300

import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { CRE_COUNTIES } from "@/lib/config/cre-counties"
import { scrapeCreLayer1 } from "@/lib/scrapers/cre-layer1"
import { scrapeCreLayer2 } from "@/lib/scrapers/cre-layer2"
import { processSignals, upsertSource } from "@/lib/signal-processor"
import type { RawSignalInput } from "@/lib/scrapers/base"

const CRON_SECRET = process.env.CRON_SECRET ?? ""

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const startedAt = new Date()

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const businesses = await (prisma.business as any).findMany({
      select: { id: true },
      take: 50,
    }) as { id: string }[]

    if (businesses.length === 0) {
      return Response.json({ ok: true, leadsCreated: 0, leadsUpdated: 0, note: "No businesses found" })
    }

    let totalCreated = 0
    let totalUpdated = 0
    let totalSignals = 0
    const countyResults: Record<string, { signals: number; error?: string }> = {}

    for (const county of CRE_COUNTIES) {
      let rawSignals: RawSignalInput[] = []
      let success = true
      let errorMsg: string | undefined

      try {
        const [layer1Signals, layer2Signals] = await Promise.all([
          scrapeCreLayer1(county),
          scrapeCreLayer2(county),
        ])
        rawSignals = [...layer1Signals, ...layer2Signals]
      } catch (err) {
        success = false
        errorMsg = err instanceof Error ? err.message : String(err)
      }

      for (const src of county.sources) {
        await upsertSource({
          name: src.name,
          county: county.name,
          layer: src.layer,
          success,
          errorMsg,
          assetClass: "commercial",
        })
      }

      countyResults[county.id] = { signals: rawSignals.length, error: errorMsg }
      if (!success || rawSignals.length === 0) continue

      totalSignals += rawSignals.length

      for (const business of businesses) {
        const processed = await processSignals(rawSignals, business.id, "commercial")
        totalCreated += processed.created
        totalUpdated += processed.updated
      }
    }

    return Response.json({
      ok: true,
      signalsFound: totalSignals,
      leadsCreated: totalCreated,
      leadsUpdated: totalUpdated,
      counties: countyResults,
      duration: Date.now() - startedAt.getTime(),
    })
  } catch (err) {
    console.error("[cron/cre-discovery]", err)
    return Response.json(
      { error: err instanceof Error ? err.message : "CRE discovery failed" },
      { status: 500 }
    )
  }
}
