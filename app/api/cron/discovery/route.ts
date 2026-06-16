// Continuous lead discovery — runs every 2 hours via Vercel Cron.
// Searches all configured counties, compares against existing DB records,
// and saves only genuinely new leads. Users see "new today" counts on login.
//
// Secured with CRON_SECRET so only Vercel's cron invoker can trigger it.

export const maxDuration = 300

import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { deepSearch } from "@/lib/deep-search-engine"
import { freeLeadToForeclosureLead } from "@/lib/foreclosure-lead-adapter"
import { processSignals } from "@/lib/signal-processor"
import { sendEmail } from "@/lib/email"
import { sendSms } from "@/lib/sms"
import { fmtMoney } from "@/lib/deal-analysis"
import type { RawSignalInput } from "@/lib/scrapers/base"

const CRON_SECRET = process.env.CRON_SECRET ?? ""

// County IDs to crawl on each run — all 5 CA counties
const DISCOVERY_COUNTIES = [
  "san-diego",
  "riverside",
  "san-bernardino",
  "orange",
  "los-angeles",
]

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const startedAt = new Date()

  try {
    // Gather all existing lead addresses from DB so we skip them
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existingLeads = await (prisma.lead as any).findMany({
      select: { name: true },
      take:   10000,
    }) as { name: string }[]

    const existingAddresses = new Set(
      existingLeads.map(l => l.name.toLowerCase().replace(/[\s,#.-]/g, ""))
    )

    // Deep search across all counties at a moderate target (150 per county)
    // This keeps the cron run within budget while still finding new leads
    const result = await deepSearch({
      searchType:        "county",
      countyIds:         DISCOVERY_COUNTIES,
      maxLeads:          200,
      existingAddresses,
    })

    if (result.newLeads.length === 0) {
      return Response.json({
        ok:        true,
        newLeads:  0,
        totalSeen: result.total,
        duration:  Date.now() - startedAt.getTime(),
      })
    }

    // ── Event-driven URGENT alert: a NEW deal with an auction ≤7 days fires
    //    immediately (deduped — only new leads reach here, so never spammy).
    try {
      const urgent = result.newLeads
        .filter(fl => typeof fl.daysUntilAuction === "number" && fl.daysUntilAuction >= 0 && fl.daysUntilAuction <= 7)
        .map(freeLeadToForeclosureLead)
        .filter(l => (l.score ?? 0) >= 65)
        .sort((a, b) => (a.daysUntilAuction ?? 99) - (b.daysUntilAuction ?? 99))
        .slice(0, 6)
      if (urgent.length) {
        const email = process.env.AUTOPILOT_NOTIFY_EMAIL, phone = process.env.AUTOPILOT_NOTIFY_PHONE
        const lines = urgent.map(l => `🔨 ${l.daysUntilAuction}d · ${l.address}, ${l.city} — score ${l.score}${l.estimatedValue ? ` · ${fmtMoney(l.estimatedValue)}` : ""}`).join("\n")
        if (email) {
          const html = `<div style="font-family:Arial,sans-serif;max-width:600px"><h2 style="color:#b00">🔥 ${urgent.length} URGENT auction deal${urgent.length === 1 ? "" : "s"} (≤7 days)</h2><pre style="font-family:inherit;white-space:pre-wrap">${lines}</pre><p style="color:#999;font-size:12px">AutoPilot — act fast, these sell within days.</p></div>`
          await sendEmail(email, `🔥 URGENT: ${urgent.length} auction deal(s) ≤7 days`, html).catch(() => {})
        }
        if (phone) await sendSms(phone, `🔥 URGENT AutoPilot: ${urgent.length} new deal(s) with auctions ≤7 days:\n${lines}`).catch(() => {})
      }
    } catch { /* alerts are best-effort, never block discovery */ }

    // Find all businesses to attach leads to (or use a system business)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const businesses = await (prisma.business as any).findMany({
      select: { id: true },
      take:   50,
    }) as { id: string }[]

    let savedTotal = 0

    for (const business of businesses) {
      // Convert to RawSignalInput format for processSignals
      const signals: RawSignalInput[] = result.newLeads.map(fl => ({
        address:    fl.address,
        apn:        undefined,
        county:     fl.city ?? "Unknown",
        signalType: stageToSignalType(fl.foreclosureStage),
        signalDate: fl.recordingDate || new Date().toISOString().split("T")[0],
        rawData: {
          ownerName:   fl.ownerName  || null,
          amount:      fl.defaultAmount ?? null,
          lender:      fl.lender        ?? null,
          auctionDate: fl.auctionDate   ?? null,
          sourceUrl:   fl.sourceUrl,
          notes:       fl.rawSignals?.join("; ") ?? "",
        },
        source: "continuous-discovery",
      }))

      const processed = await processSignals(signals, business.id)
      savedTotal += processed.created
    }

    return Response.json({
      ok:         true,
      newLeads:   result.newLeads.length,
      saved:      savedTotal,
      totalSeen:  result.total,
      sources:    result.sourceCounts,
      duration:   Date.now() - startedAt.getTime(),
    })
  } catch (err) {
    console.error("[cron/discovery]", err)
    return Response.json(
      { error: err instanceof Error ? err.message : "Discovery failed" },
      { status: 500 }
    )
  }
}

function stageToSignalType(stage: string): string {
  const map: Record<string, string> = {
    NOTICE_OF_DEFAULT: "nod",
    LIS_PENDENS:       "lis_pendens",
    NOTICE_OF_SALE:    "notice_of_sale",
    AUCTION:           "notice_of_sale",
    PRE_FORECLOSURE:   "nod",
  }
  return map[stage] ?? "nod"
}
