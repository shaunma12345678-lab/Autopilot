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
// related-party revenue, and that changes everything.
//
// "Candidate" used to mean qualityScore desc — which is circular. Quality
// score doesn't depend on narrative/governance, so ranking the research queue
// by quality score just re-researches whichever names already look strong on
// the cheap metrics, forever, and it skews toward mega-caps (the biggest,
// most stable balance sheets score well on the core ratios almost by
// construction). It can never verify a name the opportunity screen would
// actually surface, because the screen ranks its survivors by valuation, not
// quality (see lib/opportunity-screen.ts). This orders the queue by
// valuationScore desc over the same quality/risk-gated population the screen
// itself draws from, so the names most likely to reach a user get the deep
// read first — and re-checks the stalest among them once researched.
//
// Secured with CRON_SECRET so only Vercel's cron invoker can trigger it.

export const maxDuration = 300

import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { analyzeAndUpsertTicker } from "@/lib/stock-pipeline"

const CRON_SECRET = process.env.CRON_SECRET ?? ""
// Deep analysis runs 15-70s per company depending on filing size, so a fixed
// batch size is the wrong control — four large filings in a row exceeded the
// 300s function limit and the request died with no response at all.
//
// A wall-clock budget is the robust version: the loop stops before the limit
// no matter how slow individual companies turn out to be, and a partial run
// that returns cleanly beats a full run that gets killed. Anything not reached
// is simply picked up by the next firing.
const BATCH_SIZE = 6
const TIME_BUDGET_MS = 225_000   // 300s limit, with headroom for the last company
const RESEARCH_STALE_DAYS = 30

export async function GET(request: NextRequest) {
  if (!CRON_SECRET || request.headers.get("authorization") !== `Bearer ${CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }
  const startedAt = Date.now()

  try {
    // Candidates worth the expense: confident data, clears the same
    // quality/risk bar the opportunity screen gates on (lib/opportunity-screen.ts
    // MIN_QUALITY/MAX_RISK), and either never deep-researched or researched
    // long enough ago to be stale. Ordered by valuation, not quality — that's
    // what actually predicts which of these the screen will rank to the top.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pool = await (prisma.ticker as any).findMany({
      where: {
        dataConfidence: { in: ["medium", "high"] },
        qualityScore: { gte: 55 },
        OR: [{ riskScore: null }, { riskScore: { lte: 55 } }],
        valuationScore: { not: null },
      },
      orderBy: { valuationScore: "desc" },
      take: 300,
    }) as Array<{ symbol: string; qualityScore: number | null; narrativeSummary: string | null; narrativeFilingDate: string | null }>

    const staleCutoff = Date.now() - RESEARCH_STALE_DAYS * 86400000

    // Never-researched first (biggest information gain), then stale.
    const never = pool.filter(t => !t.narrativeSummary)
    const stale = pool.filter(t =>
      t.narrativeSummary &&
      (!t.narrativeFilingDate || new Date(t.narrativeFilingDate).getTime() < staleCutoff))

    const queue = [...never, ...stale].slice(0, BATCH_SIZE)

    const deadline = startedAt + TIME_BUDGET_MS
    const results: Record<string, string> = {}
    for (const t of queue) {
      // Stop cleanly rather than being killed mid-company.
      if (Date.now() > deadline) { results[t.symbol] = "deferred to next run"; continue }
      try {
        const r = await analyzeAndUpsertTicker(t.symbol, { includeNarrative: true, includeNews: true })
        results[t.symbol] = r.ok ? "researched" : (r.error ?? "failed")
      } catch (err) {
        results[t.symbol] = err instanceof Error ? err.message : "error"
      }
    }

    const researched = Object.values(results).filter(v => v === "researched").length
    return Response.json({
      ok: true,
      researched,
      attempted: queue.length,
      neverResearchedRemaining: Math.max(never.length - queue.length, 0),
      results,
      duration: Date.now() - startedAt,
    })
  } catch (err) {
    console.error("[cron/deep-research]", err)
    return Response.json({ error: err instanceof Error ? err.message : "Deep research failed" }, { status: 500 })
  }
}
