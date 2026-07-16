// Idea → outline / script / caption / shotlist. Also GET prior expansions.

export const maxDuration = 60

import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { expandIdea } from "@/lib/content/expand"
import { contentAuth } from "../_shared"

export async function POST(request: NextRequest) {
  if (!(await contentAuth(request))) return Response.json({ error: "Unauthorized" }, { status: 401 })
  let body: { ideaId?: string; kind?: string }
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }) }
  if (!body.ideaId || !body.kind) return Response.json({ error: "ideaId and kind are required" }, { status: 400 })
  const result = await expandIdea(body.ideaId, body.kind)
  if (!result) return Response.json({ error: "Expansion failed — try again." }, { status: 200 })
  return Response.json({ ok: true, ...result })
}

export async function GET(request: NextRequest) {
  if (!(await contentAuth(request))) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const { searchParams } = new URL(request.url)
  const ideaId = searchParams.get("ideaId")
  if (!ideaId) return Response.json({ error: "ideaId is required" }, { status: 400 })
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const expansions = await (prisma as any).contentExpansion.findMany({ where: { ideaId }, orderBy: { createdAt: "desc" }, take: 20 })
    return Response.json({ expansions })
  } catch {
    return Response.json({ expansions: [] })
  }
}
