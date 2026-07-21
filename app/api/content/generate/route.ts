// Run the generation pipeline: profile + brief in, ranked scored ideas out.

export const maxDuration = 300

import { NextRequest } from "next/server"
import { runGeneration } from "@/lib/content/generate"
import type { ContentGoal } from "@/lib/content/voice"
import { contentAuth } from "../_shared"

const GOALS = new Set<ContentGoal>(["customers", "awareness", "appointments", "sell-item", "leads", "loyalty"])
const clampStr = (v: unknown, n: number): string | undefined => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : undefined)

export async function POST(request: NextRequest) {
  if (!(await contentAuth(request))) return Response.json({ error: "Unauthorized" }, { status: 401 })
  let body: {
    profileId?: string; description?: string; city?: string; state?: string; platforms?: string[]; count?: number; mode?: string
    goal?: string; formats?: string[]; audience?: string; tone?: string[]; avoid?: string; reference?: string; cta?: string; offer?: string; series?: number; durationSec?: number
  }
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }) }
  try {
    const result = await runGeneration(body.profileId?.trim() || null, {
      description: body.description,
      city: body.city,
      state: body.state,
      platforms: Array.isArray(body.platforms) ? body.platforms : undefined,
      count: typeof body.count === "number" ? body.count : undefined,
      mode: body.mode === "individual" || body.mode === "skit" || body.mode === "ad" ? body.mode : "business",
      goal: typeof body.goal === "string" && GOALS.has(body.goal as ContentGoal) ? body.goal as ContentGoal : undefined,
      formats: Array.isArray(body.formats) ? body.formats.map((f) => String(f).slice(0, 24)).slice(0, 6) : undefined,
      audience: clampStr(body.audience, 300),
      tone: Array.isArray(body.tone) ? body.tone.map((t) => String(t).slice(0, 24)).slice(0, 5) : undefined,
      avoid: clampStr(body.avoid, 300),
      reference: clampStr(body.reference, 400),
      cta: clampStr(body.cta, 160),
      offer: clampStr(body.offer, 200),
      series: typeof body.series === "number" && body.series > 1 ? Math.min(Math.floor(body.series), 12) : undefined,
      durationSec: typeof body.durationSec === "number" && body.durationSec > 0 ? Math.min(Math.floor(body.durationSec), 600) : undefined,
    })
    if (!result) return Response.json({ error: "Generation produced nothing usable — try again (the model may be rate-limited)." }, { status: 200 })
    return Response.json(result)
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Generation failed" }, { status: 500 })
  }
}
