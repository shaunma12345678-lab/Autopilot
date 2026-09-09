// GET /api/markets/health — verifies every upstream data source still returns
// USABLE data, not merely a 200. See lib/data-health.ts for why each assertion
// exists; all three past silent breakages would have been caught here.

export const maxDuration = 120

import { NextRequest } from "next/server"
import { isMarketsAuthorized } from "@/lib/markets-auth"
import { runHealthChecks } from "@/lib/data-health"
import { latestCoverage } from "@/lib/coverage-store"
import { brokenSources } from "@/lib/source-coverage"
import { readFreshness } from "@/lib/market-freshness"

export async function GET(request: NextRequest) {
  const isCron = process.env.CRON_SECRET
    && request.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`
  if (!isCron && !(await isMarketsAuthorized(request))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }
  // Three different questions, which fail independently:
  //   probes     — can each source be reached and does it return usable data
  //   coverage   — did the sources actually answer during real pipeline runs
  //   freshness  — is what we already hold still current
  // A source can pass its probe and still have returned nothing all week.
  const [report, stockCoverage, cryptoCoverage, stockFreshness, cryptoFreshness] = await Promise.all([
    runHealthChecks(),
    latestCoverage("stocks"),
    latestCoverage("crypto"),
    readFreshness("stocks"),
    readFreshness("crypto"),
  ])

  const staleDomains = [stockFreshness, cryptoFreshness]
    .filter(f => f.status === "falling-behind" || f.status === "stalled")

  const problems = [
    ...report.checks.filter(c => !c.ok).map(c => `probe · ${c.source}: ${c.detail}`),
    ...brokenSources(stockCoverage?.health ?? []).map(h => `stocks · ${h.source}: ${h.note}`),
    ...brokenSources(cryptoCoverage?.health ?? []).map(h => `crypto · ${h.source}: ${h.note}`),
    ...staleDomains.map(f => `${f.domain} · freshness: ${f.note}`),
  ]

  return Response.json({
    ...report,
    problems,
    coverage: { stocks: stockCoverage, crypto: cryptoCoverage },
    freshness: { stocks: stockFreshness, crypto: cryptoFreshness },
  }, { status: report.healthy ? 200 : 503 })
}
