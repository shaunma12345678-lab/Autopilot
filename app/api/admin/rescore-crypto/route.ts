// POST /api/admin/rescore-crypto — re-score the assets that are actually on
// screen, highest-scoring first.
//
// WHY THIS EXISTS. Scores are computed at analysis time and stored, so the
// rankings show whatever was true when a row was last written. After a scoring
// change the code is correct and the displayed rankings are still wrong, and
// they stay wrong until every row is rewritten. The regular cron does 12 assets
// a firing against ~500 tracked, so a full pass takes days.
//
// The rows that matter are not a random 12 — they are the ones at the TOP of
// the rankings, which is exactly the set a scoring fix was meant to correct.
// This walks them in descending stored score, so the most visibly wrong entries
// are repaired first.

export const maxDuration = 300

import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { analyzeAndUpsertCrypto } from "@/lib/crypto-pipeline"

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? ""
// Enrichment touches DefiLlama, GoPlus, GitHub and the exchanges per asset, so
// a wall-clock budget is the honest control — a partial run that returns
// cleanly beats a full run killed mid-flight.
const TIME_BUDGET_MS = 240_000

export async function POST(request: NextRequest) {
  const pw = request.headers.get("x-admin-password")
  if (!ADMIN_PASSWORD || pw !== ADMIN_PASSWORD) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const startedAt = Date.now()
  const { searchParams } = new URL(request.url)
  const limit = Math.min(Number(searchParams.get("limit") ?? 40), 120)

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const targets = await (prisma.cryptoAsset as any).findMany({
      where: { qualityScore: { not: null } },
      orderBy: { qualityScore: "desc" },
      take: limit,
    }) as Array<{ symbol: string; coingeckoId: string; qualityScore: number }>

    const results: Array<{ symbol: string; before: number; after: number | null; changed: boolean }> = []
    let processed = 0

    for (const t of targets) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) break
      const before = t.qualityScore
      try {
        const r = await analyzeAndUpsertCrypto(t.coingeckoId || t.symbol)
        const after = r.ok ? ((r.asset as Record<string, unknown>)?.qualityScore as number ?? null) : null
        results.push({ symbol: t.symbol, before, after, changed: after !== null && after !== before })
      } catch {
        results.push({ symbol: t.symbol, before, after: null, changed: false })
      }
      processed++
    }

    const dropped = results.filter(r => r.after !== null && r.after < r.before)
    return Response.json({
      ok: true,
      processed,
      remaining: Math.max(targets.length - processed, 0),
      rescoredDown: dropped.length,
      biggestDrops: dropped
        .sort((a, b) => (a.after! - a.before) - (b.after! - b.before))
        .slice(0, 10)
        .map(d => `${d.symbol}: ${d.before} → ${d.after}`),
      results,
      durationMs: Date.now() - startedAt,
    })
  } catch (err) {
    console.error("[admin/rescore-crypto]", err)
    return Response.json({ error: err instanceof Error ? err.message : "Re-score failed" }, { status: 500 })
  }
}
