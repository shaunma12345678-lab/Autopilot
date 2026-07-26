// Steering & hook insights — what actually brings THIS account business.
// GET ?profileId=… → recommended objective/tone/format/hook-style + rankings.

export const maxDuration = 30

import { NextRequest } from "next/server"
import { contentInsights } from "@/lib/content/insights"
import { contentAuth } from "../_shared"

const ADHOC = "bp-adhoc-001"

export async function GET(request: NextRequest) {
  if (!(await contentAuth(request))) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const profileId = request.nextUrl.searchParams.get("profileId")?.trim() || ADHOC
  try {
    return Response.json(await contentInsights(profileId))
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Insights failed" }, { status: 500 })
  }
}
