// Deep research pass — the expensive analysis, run continuously against the
// candidates where it actually changes the answer.
//
// THE PROBLEM THIS SOLVES: filing-narrative reading, DEF 14A governance, the
// news scan and narrative-vs-numbers contradiction detection are the highest-
// value criteria in the system — and they were running on 4 of 237 companies.
// They're opt-in because each costs an 8MB filing fetch plus AI calls (15-70s
// per company versus ~12s without), so bulk seeding and the fast refresh cron
// both skip them. The best analysis was effectively switched off at scale.
//
// PRIORITIZATION: deep research is most valuable on companies that already
// look like candidates. Reading a proxy statement to discover that a company
// scoring 30 also has weak governance changes nothing — it was already out.
// Reading it on a company scoring 80 can reveal that the number is built on
// related-party revenue, and that changes everything. So this works down from
// the strongest scores, and re-checks the stalest among them.
//
// Secured with CRON_SECRET so only Vercel's cron invoker can trigger it.

export const maxDuration = 300

import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { analyzeAndUpsertTicker } from "@/lib/stock-pipeline"

const CRON_SECRET = process.env.CRON_SECRET ?? ""
// Deep analysis runs 15-70s per company. Four keeps the run inside the limit
// even when several filings are large.
const BATCH_SIZE = 4
const RESEARCH_STALE_DAYS = 30

export async function GET(request: NextRequest) {
  if (!CRON_SECRET || request.headers.get("authorization") !== `Bearer ${CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }
  const startedAt = Date.now()

  try {
    // Candidates worth the expense: decent score, confident data, and either
    // never deep-researched or researched long enough ago to be stale.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pool = await (prisma.ticker as any).findMany({
      where: { dataConfidence: { in: ["medium", "high"] }, qualityScore: { not: null } },
      orderBy: { qualityScore: "desc" },
      take: 120,
    }) as Array<{ symbol: string; qualityScore: number | null; narrativeSummary: string | null; narrativeFilingDate: string | null }>

    const staleCutoff = Date.now() - RESEARCH_STALE_DAYS * 86400000

    // Never-researched first (biggest information gain), then stale.
    const never = pool.filter(t => !t.narrativeSummary)
    const stale = pool.filter(t =>
      t.narrativeSummary &&
      (!t.narrativeFilingDate || new Date(t.narrativeFilingDate).getTime() < staleCutoff))

    const queue = [...never, ...stale].slice(0, BATCH_SIZE)

    const results: Record<string, string> = {}
    for (const t of queue) {
      try {
        const r = await analyzeAndUpsertTicker(t.symbol, { includeNarrative: true, includeNews: true })
        results[t.symbol] = r.ok ? "researched" : (r.error ?? "failed")
      } catch (err) {
        results[t.symbol] = err instanceof Error ? err.message : "error"
      }
    }

    return Response.json({
      ok: true,
      researched: queue.length,
      neverResearchedRemaining: Math.max(never.length - queue.length, 0),
      results,
      duration: Date.now() - startedAt,
    })
  } catch (err) {
    console.error("[cron/deep-research]", err)
    return Response.json({ error: err instanceof Error ? err.message : "Deep research failed" }, { status: 500 })
  }
}
