// AutoPilot — our own 24/7 deal engine. Runs on OUR Vercel cron + OUR database,
// powered entirely by OUR data systems (deepSearch, comp engine, full scoring) —
// zero paid data providers. Each morning it searches your areas, scores + values
// every deal with our own engine, and sends you a digest of the best ones.
//
// Config is via env (single-operator tool):
//   AUTOPILOT_COUNTIES   comma list (default the 5 SoCal counties)
//   AUTOPILOT_MIN_SCORE  HOT threshold (default 70)
//   AUTOPILOT_NOTIFY_EMAIL / AUTOPILOT_NOTIFY_PHONE  digest destinations
// Auth: Vercel cron Bearer CRON_SECRET, or x-admin-password for a manual run.

export const maxDuration = 300

import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { deepSearch } from "@/lib/deep-search-engine"
import { freeLeadToForeclosureLead } from "@/lib/foreclosure-lead-adapter"
import { fillComps } from "@/lib/comp-engine"
import { analyzeDeal, fmtMoney } from "@/lib/deal-analysis"
import { traceOwnerFromWeb } from "@/lib/own-skip-trace"
import { huntDiscoveredSources } from "@/lib/source-discovery"
import { sendEmail } from "@/lib/email"
import { sendSms } from "@/lib/sms"
import { computeModel, adaptiveScore, applySeen, featurize, leadArea, emptyTally } from "@/lib/learning-engine"
import { loadLearningTally, saveLearningTally, resolveLearningBusinessId } from "@/lib/learning-store"
import { applyOutcomes, loadForecastLedger, saveForecastLedger } from "@/lib/forecast-ledger"
import { runAcquisitionStep } from "@/lib/acquisition-engine"
import { observeLeads, thinHighPotential, patchRecord, setRecordLocation } from "@/lib/property-index"
import { enrichFromParcel } from "@/lib/parcel-enrich"
import { geocodeAddressComponents } from "@/lib/geocode"
import { predictPreForeclosure, isConfirmedForeclosure } from "@/lib/predictive"
import { leadSignature } from "@/lib/seen-leads"
import type { ForeclosureLead } from "@/lib/agents/foreclosure-agent"

const CRON_SECRET = process.env.CRON_SECRET ?? ""
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? ""   // no fallback: unset env disables admin access

const DEFAULT_COUNTIES = ["san-diego", "riverside", "san-bernardino", "orange", "los-angeles"]

function authorized(request: NextRequest): boolean {
  const bearer = request.headers.get("authorization")
  if (CRON_SECRET && bearer === `Bearer ${CRON_SECRET}`) return true
  return ADMIN_PASSWORD.length > 0 && request.headers.get("x-admin-password") === ADMIN_PASSWORD
}

interface Deal { lead: ForeclosureLead; mao: number; profit: number; label: string; roi: number; isNew: boolean; owner?: string | null; contact?: string | null }

function digestHtml(deals: Deal[]): string {
  const rows = deals.map((d) => `
    <tr style="border-bottom:1px solid #eee">
      <td style="padding:8px 6px"><strong>${d.lead.address}</strong><br/><span style="color:#888;font-size:12px">${d.lead.city}, ${d.lead.state} ${d.lead.zip}</span>${d.isNew ? ' <span style="background:#0ea5e9;color:#fff;font-size:10px;padding:1px 5px;border-radius:4px">NEW</span>' : ""}${d.owner || d.contact ? `<br/><span style="color:#0369a1;font-size:12px">👤 ${d.owner ?? "owner"}${d.contact ? ` · ${d.contact}` : ""}</span>` : ""}</td>
      <td style="padding:8px 6px;text-align:center"><strong>${d.lead.score}</strong><br/><span style="color:#888;font-size:11px">${d.lead.priority}</span></td>
      <td style="padding:8px 6px;text-align:right">MAO ${fmtMoney(d.mao)}<br/><span style="color:#16a34a;font-size:12px">${d.label} ${fmtMoney(d.profit)}${d.label === "Flip profit" ? ` · ${d.roi}% ROI` : ""}</span></td>
    </tr>`).join("")
  return `<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#111">
    <h2 style="margin:0 0 4px">🏠 Your AutoPilot deals — ${new Date().toLocaleDateString()}</h2>
    <p style="color:#666;margin:0 0 16px">Top ${deals.length} deals our engine found in your areas overnight.</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">${rows}</table>
    <p style="color:#999;font-size:12px;margin-top:20px">Estimates from AutoPilot's own engine — verify before contracting.</p>
  </div>`
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const startedAt = Date.now()

  try {
    const counties = (process.env.AUTOPILOT_COUNTIES || DEFAULT_COUNTIES.join(",")).split(",").map((s) => s.trim()).filter(Boolean)
    const minScore = Number(process.env.AUTOPILOT_MIN_SCORE || 70)
    const notifyEmail = process.env.AUTOPILOT_NOTIFY_EMAIL || ""
    const notifyPhone = process.env.AUTOPILOT_NOTIFY_PHONE || ""

    // Existing addresses → flag which deals are genuinely new.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing = await (prisma.lead as any).findMany({ select: { name: true }, take: 10000 }).catch(() => []) as { name: string }[]
    const existingAddresses = new Set(existing.map((l) => (l.name ?? "").toLowerCase().replace(/[\s,#.-]/g, "")))

    // Self-directing: load what the engine has learned about YOUR deals so it
    // hunts your best areas and ranks by your pattern — not just static config.
    const bizId = await resolveLearningBusinessId()
    const tally = bizId ? await loadLearningTally(bizId) : emptyTally()
    const model = computeModel(tally)
    const learnedZips = model.ready
      ? model.topAreas.map((a) => a.area).filter((a) => /^\d{5}$/.test(a)).slice(0, 3)
      : []

    // County sweep + the learned best ZIPs, all in parallel.
    const searches = await Promise.all([
      deepSearch({ searchType: "county", countyIds: counties, maxLeads: 200, existingAddresses }),
      ...learnedZips.map((zip) =>
        deepSearch({ searchType: "zip", zipCode: zip, maxLeads: 80, existingAddresses }).catch(() => null)),
    ])
    const results = searches.filter((r): r is Awaited<ReturnType<typeof deepSearch>> => r !== null)

    // Merge + dedupe leads from every sweep; collect the genuinely-new keys.
    const seenAddr = new Set<string>()
    const newKeys  = new Set<string>()
    let leads: ForeclosureLead[] = []
    for (const r of results) {
      for (const fl of r.leads) {
        const key = fl.address.toLowerCase().replace(/[\s,#.-]/g, "")
        if (seenAddr.has(key)) continue
        seenAddr.add(key)
        leads.push(freeLeadToForeclosureLead(fl))
      }
      for (const nl of r.newLeads) newKeys.add(nl.address.toLowerCase().replace(/[\s,#.-]/g, ""))
    }

    // Keep finding MORE: hunt AI-discovered data sources for extra leads.
    let discovered = 0
    try {
      const place = `${(counties[0] ?? "").replace(/-/g, " ")} county`.trim()
      const extra = await huntDiscoveredSources(place, 25)
      if (extra.length) {
        const have = new Set(leads.map((l) => l.address.toLowerCase().replace(/[^a-z0-9]/g, "")))
        const fresh = extra.filter((e) => !have.has(e.address.toLowerCase().replace(/[^a-z0-9]/g, "")))
        leads = leads.concat(fresh.map(freeLeadToForeclosureLead))
        discovered = fresh.length
      }
    } catch { /* discovery is best-effort */ }

    leads = fillComps(leads)

    // Record this sweep as "seen" so the engine keeps learning the baseline,
    // even from autonomous runs (the loop improves itself over time).
    if (bizId && leads.length) {
      const sample = leads.slice(0, 120)
      applySeen(tally, sample.map(featurize), sample.map(leadArea))
      await saveLearningTally(bizId, tally).catch(() => {})
    }

    // Feed the Property Index with today's sweep, then run the self-healing
    // backfill: take the thinnest high-potential records and upgrade them with
    // assessor-grade facts (parcel) + canonical location (Census) — the
    // database gets cleaner every night, unattended.
    let indexed = 0, backfilled = 0
    try {
      const obs = await observeLeads(leads, { cap: 400 })
      indexed = obs.observed
      const thin = await thinHighPotential(10)
      for (const rec of thin) {
        try {
          if (!rec.city || !rec.zip || !rec.county) {
            const comp = await geocodeAddressComponents(rec.address, rec.state ?? "").catch(() => null)
            if (comp) await setRecordLocation(rec, { city: comp.city, zip: comp.zip, county: comp.county })
          }
          const parcel = await enrichFromParcel(rec.address, rec.state ?? "CA").catch(() => null)
          if (parcel) {
            await patchRecord(rec, {
              ownerName: parcel.ownerName, mailingAddress: parcel.mailingAddress,
              sqft: parcel.sqft, beds: parcel.beds, baths: parcel.baths,
              yearBuilt: parcel.yearBuilt, propertyType: parcel.propertyType,
            }, "county-assessor")
            backfilled++
          }
        } catch { /* next record */ }
      }
    } catch { /* index is additive — never fail the cron */ }

    // Content Engine: refresh trend signals daily (news adapter, keyless).
    try {
      const { refreshTrends } = await import("@/lib/content/trends")
      await refreshTrends("real estate investing and small business marketing")
    } catch { /* trends are additive */ }

    // Outcome-Verified Predictions: fold today's sweep into the forecast
    // ledger so predicted properties that later get a scheduled sale become
    // verified hits — the accuracy record compounds daily, unattended.
    if (bizId && leads.length) {
      try {
        const items = leads.slice(0, 1000).map((l) => {
          const pr = predictPreForeclosure(l)
          return {
            sig: leadSignature(l),
            addr: [l.address, l.city].filter(Boolean).join(", "),
            predicted: pr.predicted,
            probability: pr.probability,
            confirmed: isConfirmedForeclosure(l),
          }
        })
        await saveForecastLedger(bizId, applyOutcomes(await loadForecastLedger(bizId), items))
      } catch { /* best-effort — never fail the cron */ }
    }

    // Rank by the LEARNED model when it's ready (what you actually pursue),
    // otherwise by base score. Quality floor lets a strong pattern-fit through.
    const rankScore = (l: ForeclosureLead) => (model.ready ? adaptiveScore(l, model) : (l.score ?? 0))
    const ranked: Deal[] = leads
      .filter((l) => Math.max(l.score ?? 0, rankScore(l)) >= minScore)
      .sort((a, b) => rankScore(b) - rankScore(a))
      .slice(0, 15)
      .map((lead) => {
        const a = analyzeDeal(lead)
        return {
          lead, mao: a.mao, profit: a.headlineProfit, label: a.headlineLabel, roi: a.roiPct,
          isNew: newKeys.has(lead.address.toLowerCase().replace(/[\s,#.-]/g, "")),
        }
      })

    // #3 Auto skip-trace the top deals with our own web tracer, so the digest
    // arrives with owner + contact ready to call. Capped to keep the run light.
    for (const d of ranked.slice(0, 6)) {
      try {
        const c = await traceOwnerFromWeb({ address: d.lead.address, city: d.lead.city, state: d.lead.state, zip: d.lead.zip, ownerName: d.lead.ownerName })
        if (c) { d.contact = c.phone ?? c.email ?? null; d.owner = d.lead.ownerName || null }
      } catch { /* best-effort */ }
    }

    // Acquisition Agent: when switched ON (Admin → 🚀 Acquisition), enroll
    // today's best finds into the outreach sequence and advance every due
    // touch — emails go out automatically, calls/texts/letters queue for you.
    let acquisition: { enrolledNew: number; emailsSent: number; queuedActions: number } | null = null
    if (bizId) {
      try {
        const r = await runAcquisitionStep(bizId, leads)
        acquisition = { enrolledNew: r.enrolledNew, emailsSent: r.emailsSent, queuedActions: r.queuedActions }
      } catch { /* best-effort — never fail the cron */ }
    }

    const newCount = ranked.filter((d) => d.isNew).length
    let emailed = false, texted = false

    if (ranked.length) {
      if (notifyEmail) emailed = await sendEmail(notifyEmail, `🏠 ${ranked.length} AutoPilot deals (${newCount} new) — ${new Date().toLocaleDateString()}`, digestHtml(ranked)).catch(() => false)
      if (notifyPhone) {
        const top = ranked.slice(0, 3).map((d) => `${d.lead.score} ${d.lead.address} — ${d.label} ${fmtMoney(d.profit)}`).join("\n")
        const r = await sendSms(notifyPhone, `🏠 AutoPilot: ${ranked.length} deals (${newCount} new) today.\n${top}`).catch(() => ({ success: false }))
        texted = r.success
      }
    }

    return Response.json({
      ok: true,
      counties,
      found: leads.length,
      discovered,
      qualified: ranked.length,
      newCount,
      learning: {
        ready:       model.ready,
        outcomes:    model.nPursued,
        areasHunted: learnedZips,
        rankedBy:    model.ready ? "adaptive (learned)" : "score",
        insights:    model.insights.slice(0, 3),
      },
      notified: { email: emailed, sms: texted, emailConfigured: Boolean(notifyEmail), smsConfigured: Boolean(notifyPhone) },
      acquisition,
      index: { indexed, backfilled },
      durationMs: Date.now() - startedAt,
    })
  } catch (err) {
    const { captureError } = await import("@/lib/observe")
    void captureError("cron-autopilot", err)
    return Response.json({ error: err instanceof Error ? err.message : "AutoPilot run failed" }, { status: 500 })
  }
}
