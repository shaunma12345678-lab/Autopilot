// Inngest scheduled jobs for automated county crawls (Inngest v4 API).
// Layer 1 runs daily at 6am PT; Layer 2/3 runs weekly on Sunday 4am PT.

import { inngest } from "./client"
import { COUNTIES, type CountyConfig } from "@/lib/config/counties"
import { scrapeLayer1 } from "@/lib/scrapers/layer1"
import { scrapeLayer2 } from "@/lib/scrapers/layer2"
import { scrapeLayer3 } from "@/lib/scrapers/layer3"
import { processSignals, upsertSource } from "@/lib/signal-processor"
import { prisma } from "@/lib/prisma"

async function getDefaultBusinessId(): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const biz = await (prisma.business as any).findFirst({ where: {} })
  return biz ? (biz as { id: string }).id : null
}

async function crawlCountyLayer(
  county: CountyConfig,
  layer: 1 | 2 | 3,
  businessId: string
): Promise<{ signals: number; leads: number }> {
  const scraper = layer === 1 ? scrapeLayer1 : layer === 2 ? scrapeLayer2 : scrapeLayer3

  let rawSignals: Awaited<ReturnType<typeof scrapeLayer1>> = []
  let success = true
  let errorMsg: string | undefined

  try {
    rawSignals = await scraper(county)
  } catch (err) {
    success = false
    errorMsg = err instanceof Error ? err.message : String(err)
    console.error(`[crawl] ${county.name} Layer ${layer} error:`, errorMsg)
  }

  const sources = county.sources.filter(s => s.layer === layer)
  for (const src of sources) {
    await upsertSource({ name: src.name, county: county.name, layer, success, errorMsg })
  }

  if (!success || rawSignals.length === 0) return { signals: 0, leads: 0 }

  const result = await processSignals(rawSignals, businessId)
  return { signals: result.signals, leads: result.created + result.updated }
}

// ─── Layer 1: daily crawl (NOD / Lis Pendens / NTS) ───────────────────────────

export const layer1DailyCrawl = inngest.createFunction(
  {
    id: "foreclosure-layer1-daily",
    name: "Pre-Foreclosure Layer 1 Daily Crawl",
    triggers: [{ cron: "0 14 * * *" }], // 6am PT = 14:00 UTC
    concurrency: { limit: 1 },
    retries: 2,
  },
  async ({ step }) => {
    const businessId = await step.run("get-business-id", getDefaultBusinessId)
    if (!businessId) return { skipped: "no business configured" }

    const results: Record<string, unknown> = {}
    for (const county of COUNTIES) {
      results[county.id] = await step.run(`crawl-${county.id}-layer1`, () =>
        crawlCountyLayer(county, 1, businessId)
      )
    }
    return results
  }
)

// ─── Layer 2/3: weekly crawl (early warning signals) ─────────────────────────

export const layer2WeeklyCrawl = inngest.createFunction(
  {
    id: "foreclosure-layer2-weekly",
    name: "Early Warning Layer 2 Weekly Crawl",
    triggers: [{ cron: "0 12 * * 0" }], // Sunday 4am PT = 12:00 UTC
    concurrency: { limit: 1 },
    retries: 2,
  },
  async ({ step }) => {
    const businessId = await step.run("get-business-id", getDefaultBusinessId)
    if (!businessId) return { skipped: "no business configured" }

    const results: Record<string, unknown> = {}
    for (const county of COUNTIES) {
      results[`${county.id}-layer2`] = await step.run(`crawl-${county.id}-layer2`, () =>
        crawlCountyLayer(county, 2, businessId)
      )
      results[`${county.id}-layer3`] = await step.run(`crawl-${county.id}-layer3`, () =>
        crawlCountyLayer(county, 3, businessId)
      )
    }
    return results
  }
)

// ─── Manual trigger (for on-demand runs from admin UI) ────────────────────────

export const manualCrawl = inngest.createFunction(
  {
    id: "foreclosure-manual-crawl",
    name: "Pre-Foreclosure Manual Crawl",
    triggers: [{ event: "foreclosure/layer1.crawl" }],
    concurrency: { limit: 2 },
    retries: 1,
  },
  async ({ event, step }) => {
    const { countyId, layer, businessId: bId } = event.data
    const businessId = bId ?? await step.run("get-business-id", getDefaultBusinessId)
    if (!businessId) return { error: "no business" }

    const county = COUNTIES.find(c => c.id === countyId)
    if (!county) return { error: `unknown county: ${countyId}` }

    return step.run("crawl", () => crawlCountyLayer(county, layer as 1 | 2 | 3, businessId))
  }
)
