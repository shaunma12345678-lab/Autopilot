// Trend radar. GET recent signals; POST manual entry; PUT refresh via adapters.

export const maxDuration = 90

import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { addManualTrend, refreshTrends } from "@/lib/content/trends"
import { contentAuth } from "../_shared"

export async function GET(request: NextRequest) {
  if (!(await contentAuth(request))) return Response.json({ error: "Unauthorized" }, { status: 401 })
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const trends = await (prisma as any).trendSignal.findMany({ orderBy: { capturedAt: "desc" }, take: 60 })
    return Response.json({ trends })
  } catch {
    return Response.json({ trends: [] })
  }
}

export async function POST(request: NextRequest) {
  if (!(await contentAuth(request))) return Response.json({ error: "Unauthorized" }, { status: 401 })
  let body: { platform?: string; kind?: string; label?: string; description?: string; velocity?: number; saturation?: number }
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }) }
  if (!body.label?.trim()) return Response.json({ error: "label is required" }, { status: 400 })
  const ok = await addManualTrend({
    platform: body.platform ?? "all", kind: body.kind ?? "topic", label: body.label.trim(),
    description: body.description, velocity: body.velocity, saturation: body.saturation,
  })
  return Response.json({ ok })
}

export async function PUT(request: NextRequest) {
  if (!(await contentAuth(request))) return Response.json({ error: "Unauthorized" }, { status: 401 })
  let body: { niche?: string }
  try { body = await request.json() } catch { body = {} }
  const added = await refreshTrends((body.niche ?? "short form content creators").slice(0, 100))
  return Response.json({ ok: true, added })
}
