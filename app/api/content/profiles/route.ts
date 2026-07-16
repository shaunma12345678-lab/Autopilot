// Brand profiles — who the business is. GET list; POST create/update.

export const maxDuration = 15

import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { contentAuth } from "../_shared"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const P = () => prisma as any

export async function GET(request: NextRequest) {
  if (!(await contentAuth(request))) return Response.json({ error: "Unauthorized" }, { status: 401 })
  try {
    const profiles = await P().brandProfile.findMany({ orderBy: { createdAt: "asc" }, take: 50 })
    return Response.json({ profiles })
  } catch {
    return Response.json({ profiles: [] })
  }
}

export async function POST(request: NextRequest) {
  if (!(await contentAuth(request))) return Response.json({ error: "Unauthorized" }, { status: 401 })
  let body: { id?: string; name?: string; niche?: string; audienceNotes?: string; voiceRules?: string; platforms?: string[] }
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }) }
  const name = (body.name ?? "").trim().slice(0, 80)
  const niche = (body.niche ?? "").trim().slice(0, 160)
  if (!name || !niche) return Response.json({ error: "name and niche are required" }, { status: 400 })
  const data = {
    name, niche,
    audienceNotes: (body.audienceNotes ?? "").trim().slice(0, 2000) || null,
    voiceRules: (body.voiceRules ?? "").trim().slice(0, 2000) || null,
    platforms: (Array.isArray(body.platforms) ? body.platforms : []).map((p) => String(p).slice(0, 24)).slice(0, 8),
    updatedAt: new Date().toISOString(),
  }
  try {
    if (body.id) {
      const updated = await P().brandProfile.update({ where: { id: body.id }, data })
      return Response.json({ ok: true, profile: updated })
    }
    const created = await P().brandProfile.create({ data: { id: crypto.randomUUID(), ...data, createdAt: new Date().toISOString() } })
    return Response.json({ ok: true, profile: created })
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "save failed" }, { status: 500 })
  }
}
