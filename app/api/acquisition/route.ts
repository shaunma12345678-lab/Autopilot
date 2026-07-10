// Acquisition Agent API. GET returns config + live state (enrolled leads,
// action queue, totals). POST handles: save config, run the agent step now
// (enrolls from the durable area lead cache + advances due sequences), mark a
// queue action done, pause/resume or remove an enrolled lead.

export const maxDuration = 60

import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { resolveLearningBusinessId } from "@/lib/learning-store"
import {
  defaultConfig, loadAcquisitionConfig, saveAcquisitionConfig,
  loadAcquisitionState, saveAcquisitionState, runAcquisitionStep,
  type AcquisitionConfig,
} from "@/lib/acquisition-engine"
import { areaCacheKey, loadAreaCache } from "@/lib/lead-cache"
import { freeLeadToForeclosureLead } from "@/lib/foreclosure-lead-adapter"

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "ap2026admin"

function isAuthorized(request: NextRequest, user: unknown): boolean {
  if (user) return true
  return request.headers.get("x-admin-password") === ADMIN_PASSWORD
}

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!isAuthorized(request, user)) return Response.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const bizId = await resolveLearningBusinessId()
    if (!bizId) return Response.json({ config: defaultConfig(), state: null, note: "No business account yet." })
    const [config, state] = await Promise.all([loadAcquisitionConfig(bizId), loadAcquisitionState(bizId)])
    return Response.json({ config, state })
  } catch {
    return Response.json({ config: defaultConfig(), state: null, note: "Agent state unavailable right now." })
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!isAuthorized(request, user)) return Response.json({ error: "Unauthorized" }, { status: 401 })

  let body: {
    action?: string
    config?: Partial<AcquisitionConfig>
    area?: { searchType?: string; zipCode?: string; city?: string; county?: string; state?: string }
    actionId?: string
    sig?: string
  }
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }) }

  try {
    const bizId = await resolveLearningBusinessId()
    if (!bizId) return Response.json({ error: "No business account yet" }, { status: 503 })

    switch (body.action) {
      case "config": {
        const current = await loadAcquisitionConfig(bizId)
        const merged: AcquisitionConfig = {
          enabled: typeof body.config?.enabled === "boolean" ? body.config.enabled : current.enabled,
          dailyLimit: Math.max(1, Math.min(25, Number(body.config?.dailyLimit ?? current.dailyLimit) || current.dailyLimit)),
          minScore: Math.max(0, Math.min(100, Number(body.config?.minScore ?? current.minScore) || current.minScore)),
          fromName: typeof body.config?.fromName === "string" ? body.config.fromName.slice(0, 80) : current.fromName,
          fromPhone: typeof body.config?.fromPhone === "string" ? body.config.fromPhone.slice(0, 40) : current.fromPhone,
          autoEmail: typeof body.config?.autoEmail === "boolean" ? body.config.autoEmail : current.autoEmail,
        }
        await saveAcquisitionConfig(bizId, merged)
        return Response.json({ ok: true, config: merged })
      }

      case "run": {
        // Candidates come from the durable per-area lead cache the searches keep
        // filling — the agent works what the platform has already found.
        const a = body.area ?? {}
        const hasArea = Boolean(a.zipCode || a.city || a.county)
        const key = hasArea ? areaCacheKey({ searchType: a.searchType ?? (a.zipCode ? "zip" : a.county ? "county" : "city"), zipCode: a.zipCode, city: a.city, county: a.county, state: a.state }) : ""
        const cached = key ? await loadAreaCache(key).catch(() => []) : []
        const candidates = (cached ?? []).map(freeLeadToForeclosureLead)
        const result = await runAcquisitionStep(bizId, candidates)
        const state = await loadAcquisitionState(bizId)
        return Response.json({ ok: true, result, state, candidates: candidates.length })
      }

      case "done": {
        if (!body.actionId) return Response.json({ error: "actionId required" }, { status: 400 })
        const st = await loadAcquisitionState(bizId)
        st.queue = st.queue.filter((q) => q.id !== body.actionId)
        await saveAcquisitionState(bizId, st)
        return Response.json({ ok: true, state: st })
      }

      case "pause":
      case "resume":
      case "remove": {
        if (!body.sig) return Response.json({ error: "sig required" }, { status: 400 })
        const st = await loadAcquisitionState(bizId)
        const lead = st.enrolled[body.sig]
        if (!lead) return Response.json({ error: "Lead not enrolled" }, { status: 404 })
        if (body.action === "remove") {
          delete st.enrolled[body.sig]
          st.queue = st.queue.filter((q) => q.sig !== body.sig)
        } else {
          lead.paused = body.action === "pause"
        }
        await saveAcquisitionState(bizId, st)
        return Response.json({ ok: true, state: st })
      }

      default:
        return Response.json({ error: "Unknown action" }, { status: 400 })
    }
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Acquisition request failed" }, { status: 500 })
  }
}
