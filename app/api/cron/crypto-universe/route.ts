// Bulk crypto universe ingest + DefiLlama discovery.
//
// Cheap pass: /coins/markets returns 250 assets per call, so this establishes
// a broad universe in seconds rather than the ~12s-per-asset the enrichment
// pipeline costs. Everything it creates is marked low confidence until the
// crypto-refresh cron enriches it — see lib/crypto-universe.ts.
//
// Secured with CRON_SECRET so only Vercel's cron invoker can trigger it.

export const maxDuration = 300

import { NextRequest } from "next/server"
import { ingestCryptoUniverse, discoverCryptoFromDefiLlama } from "@/lib/crypto-universe"

const CRON_SECRET = process.env.CRON_SECRET ?? ""

export async function GET(request: NextRequest) {
  if (!CRON_SECRET || request.headers.get("authorization") !== `Bearer ${CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }
  const startedAt = Date.now()
  try {
    const universe = await ingestCryptoUniverse(2)
    const discovery = await discoverCryptoFromDefiLlama(40)
    return Response.json({ ok: true, universe, discovery, duration: Date.now() - startedAt })
  } catch (err) {
    console.error("[cron/crypto-universe]", err)
    return Response.json({ error: err instanceof Error ? err.message : "Universe ingest failed" }, { status: 500 })
  }
}
