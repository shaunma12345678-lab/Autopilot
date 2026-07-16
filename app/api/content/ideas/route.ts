// Idea feed + one-click triage. GET ?profileId=&status=; PATCH { id, status }.

export const maxDuration = 15

import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { contentAuth } from "../_shared"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const P = () => prisma as any

const STATUSES = ["new", "saved", "scheduled", "published", "killed"]

export async function GET(request: NextRequest) {
  if (!(await contentAuth(request))) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const { searchParams } = new URL(request.url)
  const profileId = searchParams.get("profileId") ?? undefined
  const status = searchParams.get("status") ?? undefined
  try {
    const where: Record<string, unknown> = {}
    if (profileId) where.brandProfileId = profileId
    if (status && STATUSES.includes(status)) where.status = status
    const ideas = await P().contentIdea.findMany({ where, orderBy: { createdAt: "desc" }, take: 100 })
    ideas.sort((a: { viralityScore: number }, b: { viralityScore: number }) => b.viralityScore - a.viralityScore)
    return Response.json({ ideas })
  } catch {
    return Response.json({ ideas: [] })
  }
}

export async function PATCH(request: NextRequest) {
  if (!(await contentAuth(request))) return Response.json({ error: "Unauthorized" }, { status: 401 })
  let body: { id?: string; status?: string; killReason?: string }
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }) }
  if (!body.id || !body.status || !STATUSES.includes(body.status)) return Response.json({ error: "id and a valid status are required" }, { status: 400 })
  try {
    await P().contentIdea.update({ where: { id: body.id }, data: { status: body.status } })
    return Response.json({ ok: true })
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "update failed" }, { status: 500 })
  }
}
