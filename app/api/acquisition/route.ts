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
import { leadSignature } from "@/lib/seen-leads"

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

  interface IncomingLead { address?: string; city?: string; state?: string; zip?: string; ownerName?: string; phone?: string; email?: string; score?: number }
  let body: {
    action?: string
    config?: Partial<AcquisitionConfig>
    area?: { searchType?: string; zipCode?: string; city?: string; county?: string; state?: string }
    actionId?: string
    sig?: string
    lead?: IncomingLead
    leads?: IncomingLead[]
  }
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }) }

  const clean = (v: unknown, max = 160): string => (typeof v === "string" ? v.trim().slice(0, max) : "")
  const toEnrolled = (l: IncomingLead) => {
    const address = clean(l.address)
    if (!address) return null
    const sig = leadSignature({ address, zip: clean(l.zip, 10) })
    if (!sig || sig.length < 4) return null
    const nowIso = new Date().toISOString()
    return {
      sig,
      addr: address,
      city: clean(l.city, 80),
      state: clean(l.state, 2).toUpperCase(),
      zip: clean(l.zip, 10),
      owner: clean(l.ownerName),
      phone: clean(l.phone, 40),
      email: clean(l.email),
      score: typeof l.score === "number" ? Math.max(0, Math.min(100, Math.round(l.score))) : 0,
      enrolledAt: nowIso,
      step: 0,
      nextAt: nowIso,
      paused: false,
      history: [],
    }
  }

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

      // Enroll one lead (Seller Finder / Real Estate hand-off) or a whole
      // imported list (competitor CSV). Dedup by signature; never re-enrolls.
      case "enroll":
      case "import": {
        const incoming = body.action === "enroll" ? (body.lead ? [body.lead] : []) : (Array.isArray(body.leads) ? body.leads : [])
        if (!incoming.length) return Response.json({ error: "lead(s) required" }, { status: 400 })
        const st = await loadAcquisitionState(bizId)
        let added = 0
        for (const raw of incoming.slice(0, 100)) {
          const e = toEnrolled(raw)
          if (!e || st.enrolled[e.sig]) continue
          st.enrolled[e.sig] = e
          st.totals.enrolled++
          added++
        }
        await saveAcquisitionState(bizId, st)
        return Response.json({ ok: true, added, skipped: Math.min(incoming.length, 100) - added, state: st })
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
