// Self-Learning Adaptive Engine API — persists the running outcome tally (in
// the AgentMemory KV store, no migration) and returns the current learned
// model. POST records SEEN batches (search result sets) and PURSUED leads
// (saved / skip-traced / advanced); GET returns the model for ranking + the
// "what your system learned" insights. Best-effort: never fails the app.

export const maxDuration = 20

import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { emptyTally, applySeen, applyPursued, computeModel } from "@/lib/learning-engine"
import { loadLearningTally as loadTally, saveLearningTally as saveTally } from "@/lib/learning-store"

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "ap2026admin"

function isAuthorized(request: NextRequest, user: unknown): boolean {
  if (user) return true
  return request.headers.get("x-admin-password") === ADMIN_PASSWORD
}

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!isAuthorized(request, user)) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const businessId = new URL(request.url).searchParams.get("businessId") ?? ""
  if (!businessId) return Response.json({ model: computeModel(emptyTally()) })
  const tally = await loadTally(businessId)
  return Response.json({ model: computeModel(tally) })
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!isAuthorized(request, user)) return Response.json({ error: "Unauthorized" }, { status: 401 })

  let body: {
    businessId?: string
    event?:      "seen" | "pursued"
    featureLists?: string[][]
    areas?:      string[]
    features?:   string[]
    area?:       string
  }
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }) }

  const businessId = body.businessId
  if (!businessId) return Response.json({ model: computeModel(emptyTally()) })

  const tally = await loadTally(businessId)

  if (body.event === "seen" && Array.isArray(body.featureLists)) {
    applySeen(tally, body.featureLists.slice(0, 120), Array.isArray(body.areas) ? body.areas.slice(0, 120) : [])
  } else if (body.event === "pursued" && Array.isArray(body.features)) {
    applyPursued(tally, body.features, body.area)
  } else {
    return Response.json({ model: computeModel(tally) })
  }

  await saveTally(businessId, tally)
  return Response.json({ model: computeModel(tally) })
}
