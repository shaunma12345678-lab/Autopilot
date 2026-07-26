// Outcome logging — the learning loop's fuel. Must stay under 30s of effort.

export const maxDuration = 60

import { NextRequest } from "next/server"
import { logOutcome } from "@/lib/content/learn"
import { contentAuth } from "../_shared"

export async function POST(request: NextRequest) {
  if (!(await contentAuth(request))) return Response.json({ error: "Unauthorized" }, { status: 401 })
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }) }
  if (typeof body.ideaId !== "string" || !body.ideaId) return Response.json({ error: "ideaId is required" }, { status: 400 })
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : undefined)
  const result = await logOutcome({
    ideaId: body.ideaId,
    postUrl: typeof body.postUrl === "string" ? body.postUrl.slice(0, 300) : undefined,
    views: num(body.views), likes: num(body.likes), comments: num(body.comments),
    shares: num(body.shares), saves: num(body.saves), followsGained: num(body.followsGained),
    watchThrough: typeof body.watchThrough === "number" ? Math.max(0, Math.min(1, body.watchThrough)) : undefined,
    hookUsed: typeof body.hookUsed === "string" ? body.hookUsed.slice(0, 200) : undefined,
    couponCode: typeof body.couponCode === "string" ? body.couponCode.slice(0, 40) : undefined,
    redemptions: num(body.redemptions),
    revenue: typeof body.revenue === "number" && Number.isFinite(body.revenue) && body.revenue >= 0 ? Math.round(body.revenue) : undefined,
    shaunNotes: typeof body.notes === "string" ? body.notes.slice(0, 1000) : undefined,
  })
  return Response.json(result)
}
