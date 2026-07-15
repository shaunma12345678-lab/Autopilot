// Workspace persistence — the user's CRM, buyers, farm zones, buy-box,
// reminders, and driving routes, durably in OUR database instead of a single
// browser's localStorage. One row per (business, kind) holding the whole store
// as JSONB with last-write-wins timestamps: simple, atomic, multi-device.
// GET returns every kind; POST upserts one kind's blob.

export const maxDuration = 20

import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { getAdminClient } from "@/lib/supabase/admin"
import { resolveLearningBusinessId } from "@/lib/learning-store"

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? ""   // no fallback: unset env disables admin access

function isAuthorized(request: NextRequest, user: unknown): boolean {
  if (user) return true
  return ADMIN_PASSWORD.length > 0 && request.headers.get("x-admin-password") === ADMIN_PASSWORD
}

const KINDS = ["crm", "crmReminders", "buyers", "buybox", "farms", "driving", "zoneAlerts", "voiceCustom"] as const

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = () => (getAdminClient() as any).from("WorkspaceStore")

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!isAuthorized(request, user)) return Response.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const bizId = await resolveLearningBusinessId()
    if (!bizId) return Response.json({ stores: {} })
    const { data } = await table().select("kind,value,updatedAt").eq("businessId", bizId)
    const stores: Record<string, { value: unknown; updatedAt: string }> = {}
    for (const row of (data ?? []) as Array<{ kind: string; value: unknown; updatedAt: string }>) {
      stores[row.kind] = { value: row.value, updatedAt: row.updatedAt }
    }
    return Response.json({ stores })
  } catch {
    return Response.json({ stores: {} })
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!isAuthorized(request, user)) return Response.json({ error: "Unauthorized" }, { status: 401 })

  let body: { kind?: string; value?: unknown }
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }) }
  const kind = KINDS.find((k) => k === body.kind)
  if (!kind || body.value === undefined) return Response.json({ error: "kind and value are required" }, { status: 400 })
  // Keep blobs sane — the largest store (seen-leads) intentionally stays out.
  if (JSON.stringify(body.value).length > 900_000) return Response.json({ error: "store too large" }, { status: 413 })

  try {
    const bizId = await resolveLearningBusinessId()
    if (!bizId) return Response.json({ error: "No business account yet" }, { status: 503 })
    const now = new Date().toISOString()
    const { error } = await table().upsert(
      { id: `${bizId}:${kind}`, businessId: bizId, kind, value: body.value, updatedAt: now },
      { onConflict: "businessId,kind" },
    )
    if (error) throw error
    return Response.json({ ok: true, updatedAt: now })
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "save failed" }, { status: 500 })
  }
}
