// Run the generation pipeline: profile + brief in, ranked scored ideas out.

export const maxDuration = 300

import { NextRequest } from "next/server"
import { runGeneration } from "@/lib/content/generate"
import { contentAuth } from "../_shared"

export async function POST(request: NextRequest) {
  if (!(await contentAuth(request))) return Response.json({ error: "Unauthorized" }, { status: 401 })
  let body: { profileId?: string; description?: string; city?: string; state?: string; platforms?: string[]; count?: number; mode?: string }
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }) }
  try {
    const result = await runGeneration(body.profileId?.trim() || null, {
      description: body.description,
      city: body.city,
      state: body.state,
      platforms: Array.isArray(body.platforms) ? body.platforms : undefined,
      count: typeof body.count === "number" ? body.count : undefined,
      mode: body.mode === "individual" || body.mode === "skit" || body.mode === "ad" ? body.mode : "business",
    })
    if (!result) return Response.json({ error: "Generation produced nothing usable — try again (the model may be rate-limited)." }, { status: 200 })
    return Response.json(result)
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Generation failed" }, { status: 500 })
  }
}
