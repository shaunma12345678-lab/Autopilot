// "More like this / less like this" — a thumbs on an idea records its pattern
// as a steering hint for that profile; the next generation obeys it.

export const maxDuration = 20

import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { addSteerHint } from "@/lib/content/steer-hints"
import { contentAuth } from "../_shared"

const ADHOC = "bp-adhoc-001"

export async function POST(request: NextRequest) {
  if (!(await contentAuth(request))) return Response.json({ error: "Unauthorized" }, { status: 401 })
  let body: { ideaId?: string; direction?: string }
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }) }
  const direction = body.direction === "less" ? "less" : "more"
  if (!body.ideaId) return Response.json({ error: "ideaId is required" }, { status: 400 })
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const idea = await (prisma as any).contentIdea.findFirst({ where: { id: body.ideaId } }) as { title: string; angle: string; brandProfileId: string } | null
    if (!idea) return Response.json({ error: "idea not found" }, { status: 404 })
    const profileId = idea.brandProfileId === ADHOC ? null : idea.brandProfileId
    const ok = await addSteerHint(profileId, direction, { title: idea.title, angle: idea.angle })
    return Response.json({ ok, direction })
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Steer failed" }, { status: 500 })
  }
}
