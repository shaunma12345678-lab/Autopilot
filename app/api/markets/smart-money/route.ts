// GET /api/markets/smart-money — position changes at concentrated,
// research-driven institutional managers, from Form 13F.
//
// The diff, never the portfolio: everyone knows Berkshire owns Apple, but a
// brand-new position means someone with a research budget reached a conclusion
// recently enough to act. Every row carries its as-of date because 13F is filed
// 45 days after quarter end — this is a research lead, not a current position.

export const maxDuration = 300

import { NextRequest } from "next/server"
import { isMarketsAuthorized } from "@/lib/markets-auth"
import { ELITE_FILERS, getFilerChanges, type HoldingChange } from "@/lib/institutional-holdings"

export async function GET(request: NextRequest) {
  try {
    if (!(await isMarketsAuthorized(request))) {
      return Response.json({ error: "Unauthorized" }, { status: 401 })
    }
    const { searchParams } = new URL(request.url)
    const limit = Math.min(Number(searchParams.get("limit") ?? 40), 100)
    const onlyNew = searchParams.get("onlyNew") === "1"

    // Sequential, not parallel: each filer costs several SEC requests and the
    // client enforces a 120ms floor, so parallelism would only queue behind it.
    const all: HoldingChange[] = []
    for (const filer of ELITE_FILERS) {
      const changes = await getFilerChanges(filer).catch(() => [])
      all.push(...changes)
    }

    const filtered = onlyNew ? all.filter(c => c.changeType === "new_position") : all
    filtered.sort((a, b) =>
      Math.max(b.valueUsd, b.previousValueUsd) - Math.max(a.valueUsd, a.previousValueUsd))

    return Response.json({
      changes: filtered.slice(0, limit),
      filersScanned: ELITE_FILERS.length,
      total: filtered.length,
      caveat: "Form 13F is filed 45 days after quarter end. These are research leads, not current positions — the manager may already have changed them.",
    })
  } catch (err) {
    console.error("[markets/smart-money GET]", err)
    return Response.json({ error: "Failed to load institutional changes" }, { status: 500 })
  }
}
