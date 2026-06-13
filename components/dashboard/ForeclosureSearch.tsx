"use client"

import React, { useState, useCallback, useMemo, useRef } from "react"
import type { ForeclosureLead, OutreachPackage, ScoreBreakdown, DealCalc } from "@/lib/agents/foreclosure-agent"
import type { AtRiskLead } from "@/app/api/leads/at-risk-search/route"

// ─── Shared helpers ───────────────────────────────────────────────────────────

const fmt = (n: number | null | undefined, pre = "", suf = "") =>
  n == null ? "—" : `${pre}${n.toLocaleString()}${suf}`

function fmtDate(d: string) {
  if (!d) return "—"
  const [y, m, day] = d.split("-")
  return `${m}/${day}/${y?.slice(2)}`
}

const STAGE_LABEL: Record<string, string> = {
  NOTICE_OF_DEFAULT: "Notice of Default",
  LIS_PENDENS:       "Lis Pendens",
  NOTICE_OF_SALE:    "Notice of Sale",
  PRE_FORECLOSURE:   "Pre-Foreclosure",
  AUCTION:           "Auction",
}
const STAGE_CLR: Record<string, string> = {
  NOTICE_OF_DEFAULT: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  LIS_PENDENS:       "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
  NOTICE_OF_SALE:    "bg-red-500/15 text-red-300 border-red-500/30",
  PRE_FORECLOSURE:   "bg-blue-500/15 text-blue-300 border-blue-500/30",
  AUCTION:           "bg-red-700/20 text-red-200 border-red-600/40",
}
const PRI = {
  HOT:  { dot: "bg-red-400",    cls: "bg-red-500/15 text-red-300 border-red-500/30" },
  WARM: { dot: "bg-yellow-400", cls: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30" },
  COLD: { dot: "bg-blue-400",   cls: "bg-blue-500/15 text-blue-300 border-blue-500/30" },
}
const GRADE_CLR: Record<string, string> = {
  A: "text-emerald-400 bg-emerald-500/15 border-emerald-500/30",
  B: "text-blue-300   bg-blue-500/15   border-blue-500/30",
  C: "text-yellow-300 bg-yellow-500/15 border-yellow-500/30",
  D: "text-red-300    bg-red-500/15    border-red-500/30",
}

// ─── Shared input style ───────────────────────────────────────────────────────

const INPUT = "w-full bg-gray-800/60 border border-gray-700/50 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500/70 focus:ring-1 focus:ring-indigo-500/30"

// ─── Area search form (reused across tabs) ────────────────────────────────────

interface AreaParams {
  searchType: "zip" | "city" | "county"
  zipCode: string; city: string; state: string; county: string
  daysBack: number; maxLeads: number; enrichContacts: boolean
}

function AreaForm({ p, setP, onSearch, loading, extra }: {
  p: AreaParams
  setP: React.Dispatch<React.SetStateAction<AreaParams>>
  onSearch: () => void
  loading: boolean
  extra?: React.ReactNode
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex bg-gray-800/80 border border-gray-700/40 rounded-xl p-1 gap-1">
          {(["zip","city","county"] as const).map(t => (
            <button key={t} onClick={() => setP(q => ({ ...q, searchType: t }))}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${p.searchType === t ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-white"}`}>
              {t === "zip" ? "ZIP" : t === "city" ? "City/State" : "County"}
            </button>
          ))}
        </div>
        {extra}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {p.searchType === "zip" && (
          <div><label className="label">ZIP Code</label>
            <input value={p.zipCode} onChange={e => setP(q => ({ ...q, zipCode: e.target.value }))} placeholder="85001" maxLength={10} className={INPUT} /></div>
        )}
        {p.searchType === "city" && (<>
          <div><label className="label">City</label>
            <input value={p.city} onChange={e => setP(q => ({ ...q, city: e.target.value }))} placeholder="Phoenix" className={INPUT} /></div>
          <div><label className="label">State</label>
            <input value={p.state} onChange={e => setP(q => ({ ...q, state: e.target.value.toUpperCase().slice(0, 2) }))} placeholder="AZ" maxLength={2} className={INPUT} /></div>
        </>)}
        {p.searchType === "county" && (<>
          <div><label className="label">County</label>
            <input value={p.county} onChange={e => setP(q => ({ ...q, county: e.target.value }))} placeholder="Maricopa" className={INPUT} /></div>
          <div><label className="label">State</label>
            <input value={p.state} onChange={e => setP(q => ({ ...q, state: e.target.value.toUpperCase().slice(0, 2) }))} placeholder="AZ" maxLength={2} className={INPUT} /></div>
        </>)}
        <div><label className="label">Date Range</label>
          <select value={p.daysBack} onChange={e => setP(q => ({ ...q, daysBack: Number(e.target.value) }))} className={INPUT}>
            <option value={30}>Last 30 days</option>
            <option value={60}>Last 60 days</option>
            <option value={90}>Last 90 days</option>
            <option value={180}>Last 6 months</option>
            <option value={365}>Last year</option>
          </select></div>
        <div><label className="label">Max Leads</label>
          <select value={p.maxLeads} onChange={e => setP(q => ({ ...q, maxLeads: Number(e.target.value) }))} className={INPUT}>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
            <option value={300}>300</option>
            <option value={500}>500</option>
          </select></div>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={onSearch} disabled={loading}
          className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-all">
          {loading
            ? <span className="flex items-center gap-2"><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Searching…</span>
            : "Search"}
        </button>
        <label className="flex items-center gap-2 cursor-pointer" onClick={() => setP(q => ({ ...q, enrichContacts: !q.enrichContacts }))}>
          <div className={`relative w-8 h-4 rounded-full transition-colors ${p.enrichContacts ? "bg-indigo-600" : "bg-gray-700"}`}>
            <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${p.enrichContacts ? "translate-x-4" : "translate-x-0.5"}`} />
          </div>
          <span className="text-xs text-gray-400">AI contact discovery <span className="text-gray-600">(Tavily)</span></span>
        </label>
      </div>
    </div>
  )
}

// ─── Top ranked deals card ────────────────────────────────────────────────────

function TopDealsCard({ leads, onSave, savedIds, businessId }: {
  leads: ForeclosureLead[]
  onSave: (lead: ForeclosureLead) => void
  savedIds: Set<number>
  businessId: string
}) {
  const top = useMemo(() => {
    const PRI_RANK: Record<string, number> = { HOT: 0, WARM: 1, COLD: 2 }
    // Show HOT leads first, then grade A/B warm leads
    return [...leads]
      .filter(l => l.priority === "HOT" || (l.dealCalc && ["A", "B"].includes(l.dealCalc.dealGrade)))
      .sort((a, b) => {
        const pa = PRI_RANK[a.priority] ?? 2, pb = PRI_RANK[b.priority] ?? 2
        if (pa !== pb) return pa - pb
        return (b.score ?? 0) - (a.score ?? 0)
      })
      .slice(0, 5)
  }, [leads])

  if (top.length === 0) return null

  return (
    <div className="bg-gradient-to-r from-indigo-950/60 to-emerald-950/40 border border-emerald-500/25 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-lg">🏆</span>
        <div>
          <h3 className="text-sm font-bold text-white">AI-Ranked Top Deals</h3>
          <p className="text-[11px] text-gray-400">Best combinations of equity, distress, and deal math — pursue these first</p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
        {top.map((lead, i) => (
          <div key={lead.attomId} className="bg-gray-900/60 border border-gray-700/40 rounded-xl p-3 space-y-2">
            <div className="flex items-start justify-between">
              <span className="text-[10px] font-bold text-gray-500">#{i + 1}</span>
              <div className="flex items-center gap-1">
                <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded border ${GRADE_CLR[lead.dealCalc!.dealGrade]}`}>
                  {lead.dealCalc!.dealGrade}
                </span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${PRI[lead.priority].cls}`}>
                  {lead.score}
                </span>
              </div>
            </div>
            <div>
              <p className="text-xs text-white font-medium leading-tight truncate">{lead.address}</p>
              <p className="text-[10px] text-gray-500">{lead.city}, {lead.state}</p>
            </div>
            <div className="space-y-0.5">
              <div className="flex justify-between">
                <span className="text-[10px] text-gray-600">Equity</span>
                <span className={`text-[10px] font-semibold ${(lead.equityPercent ?? 0) >= 30 ? "text-emerald-400" : "text-yellow-400"}`}>
                  {lead.equityPercent != null ? `${lead.equityPercent}%` : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[10px] text-gray-600">Max Offer</span>
                <span className="text-[10px] text-white">{fmt(lead.dealCalc?.maxOffer, "$")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[10px] text-gray-600">Est. Profit</span>
                <span className="text-[10px] text-emerald-400 font-semibold">{fmt(lead.dealCalc?.potentialProfit, "$")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[10px] text-gray-600">Stage</span>
                <span className="text-[10px] text-orange-300">{STAGE_LABEL[lead.foreclosureStage]?.replace("Notice of ", "")}</span>
              </div>
            </div>
            <button
              onClick={() => onSave(lead)}
              disabled={savedIds.has(lead.attomId)}
              className={`w-full py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                savedIds.has(lead.attomId)
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                  : "bg-indigo-600/80 hover:bg-indigo-500/80 text-white"
              }`}>
              {savedIds.has(lead.attomId) ? "✓ Saved" : "Save to CRM"}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Score breakdown bar ──────────────────────────────────────────────────────

function ScoreBarRow({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-gray-500 w-14 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] text-gray-400 w-8 text-right">{value}/{max}</span>
    </div>
  )
}

// ─── Editable outreach panel ──────────────────────────────────────────────────

const TEMPLATES: Array<{ id: "empathetic"|"direct"|"professional"; label: string; desc: string }> = [
  { id: "empathetic",   label: "Empathetic",    desc: "Personal, understanding" },
  { id: "direct",       label: "Direct",         desc: "Cash offer, fast close" },
  { id: "professional", label: "Professional",   desc: "Formal, with disclaimers" },
]

function OutreachPanel({ lead, businessId }: { lead: ForeclosureLead; businessId: string }) {
  const [style, setStyle]           = useState<"empathetic"|"direct"|"professional">("empathetic")
  const [tab, setTab]               = useState<"letter"|"phone"|"sms">("letter")
  const [outreach, setOutreach]     = useState<OutreachPackage | null>(null)
  const [generating, setGenerating] = useState(false)
  const [edited, setEdited]         = useState<Record<string, string>>({})
  const [sending, setSending]       = useState(false)
  const [sendResult, setSendResult] = useState<string | null>(null)
  const [fromName, setFromName]     = useState("")
  const [fromPhone, setFromPhone]   = useState("")
  const [copied, setCopied]         = useState(false)

  const generate = async (newStyle = style) => {
    setGenerating(true)
    setSendResult(null)
    try {
      const res = await fetch("/api/leads/foreclosure-outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead, style: newStyle }),
      })
      const data = await res.json()
      if (res.ok) { setOutreach(data.outreach); setEdited({}) }
    } catch { /* silent */ }
    setGenerating(false)
  }

  const getText = (key: "letter"|"phone"|"sms") => {
    if (edited[key] !== undefined) return edited[key]
    if (!outreach) return ""
    return { letter: outreach.yellowLetter, phone: outreach.phoneScript, sms: outreach.smsOpener }[key]
  }

  const send = async (channel: "email"|"sms"|"both") => {
    if (!outreach) return
    setSending(true)
    setSendResult(null)
    try {
      const res = await fetch("/api/leads/foreclosure-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targets: [{ attomId: lead.attomId, ownerName: lead.ownerName, address: lead.address, email: lead.email, phone: lead.phone }],
          channel,
          emailLetter: getText("letter"),
          smsText: getText("sms"),
          fromName: fromName || undefined,
          fromPhone: fromPhone || undefined,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        const e = data.emailSent > 0 ? `✓ Email sent` : data.emailFailed > 0 ? "✗ Email failed" : ""
        const s = data.smsSent > 0 ? `✓ SMS sent` : data.smsFailed > 0 ? "✗ SMS failed" : ""
        setSendResult([e, s].filter(Boolean).join(" · ") || "Sent")
      } else {
        setSendResult(`Error: ${data.error}`)
      }
    } catch (e) { setSendResult("Send failed") }
    setSending(false)
  }

  const copy = () => {
    navigator.clipboard.writeText(getText(tab))
    setCopied(true); setTimeout(() => setCopied(false), 1500)
  }

  if (!outreach && !generating) {
    return (
      <div className="space-y-3">
        <p className="text-xs text-gray-500">Pick a template style, then generate personalized outreach for <span className="text-white font-medium">{lead.ownerName}</span>.</p>
        <div className="flex gap-2">
          {TEMPLATES.map(t => (
            <button key={t.id} onClick={() => setStyle(t.id)}
              className={`px-3 py-2 rounded-xl text-xs border transition-all ${style === t.id ? "bg-indigo-600 border-indigo-500 text-white" : "bg-gray-800/60 border-gray-700/40 text-gray-400 hover:text-white"}`}>
              <p className="font-semibold">{t.label}</p>
              <p className="text-[10px] text-gray-500">{t.desc}</p>
            </button>
          ))}
        </div>
        <button onClick={() => generate(style)}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl transition-all">
          Generate Outreach Package
        </button>
      </div>
    )
  }

  if (generating) {
    return (
      <div className="flex items-center gap-2 py-6 justify-center text-gray-400 text-xs">
        <span className="w-3.5 h-3.5 border-2 border-gray-600 border-t-indigo-400 rounded-full animate-spin" />
        Writing {style} outreach for {lead.ownerName}…
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Style + regenerate */}
      <div className="flex items-center gap-2 flex-wrap">
        {TEMPLATES.map(t => (
          <button key={t.id}
            onClick={() => { setStyle(t.id); generate(t.id) }}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all ${style === t.id ? "bg-indigo-600 border-indigo-500 text-white" : "bg-gray-800/60 border-gray-700/40 text-gray-400 hover:text-white"}`}>
            {t.label}
          </button>
        ))}
        <span className="text-gray-700 text-xs">|</span>
        <button onClick={() => generate(style)} className="text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors">↺ Regenerate</button>
      </div>

      {/* Tab selector */}
      <div className="flex items-center gap-1">
        {(["letter","phone","sms"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${tab === t ? "bg-gray-700 text-white" : "text-gray-500 hover:text-gray-300"}`}>
            {t === "letter" ? "📝 Letter" : t === "phone" ? "📞 Script" : "💬 SMS"}
          </button>
        ))}
        <button onClick={copy} className="ml-auto text-[11px] text-gray-500 hover:text-white transition-colors border border-gray-700/40 px-2.5 py-1.5 rounded-lg">
          {copied ? "✓" : "Copy"}
        </button>
      </div>

      {/* Editable textarea */}
      <textarea
        value={getText(tab)}
        onChange={e => setEdited(prev => ({ ...prev, [tab]: e.target.value }))}
        rows={tab === "sms" ? 3 : 10}
        className="w-full bg-gray-950/50 border border-gray-700/30 rounded-xl p-3 text-xs text-gray-300 font-mono leading-relaxed resize-y focus:outline-none focus:border-indigo-500/50"
        placeholder="Outreach content…"
      />

      {/* Sender identity */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label">Your Name</label>
          <input value={fromName} onChange={e => setFromName(e.target.value)} placeholder="[YOUR NAME]" className={INPUT + " text-xs"} />
        </div>
        <div>
          <label className="label">Your Phone</label>
          <input value={fromPhone} onChange={e => setFromPhone(e.target.value)} placeholder="(555) 000-0000" className={INPUT + " text-xs"} />
        </div>
      </div>

      {/* Send buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => send("email")} disabled={!lead.email || sending}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/80 hover:bg-blue-500/80 disabled:opacity-40 text-white text-[11px] font-semibold rounded-lg transition-all">
          {sending ? <span className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" /> : "✉"}
          Send Email {!lead.email && <span className="text-blue-300/60">(no email)</span>}
        </button>
        <button onClick={() => send("sms")} disabled={!lead.phone || sending}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/80 hover:bg-emerald-500/80 disabled:opacity-40 text-white text-[11px] font-semibold rounded-lg transition-all">
          {sending ? <span className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" /> : "💬"}
          Send SMS {!lead.phone && <span className="text-emerald-300/60">(no phone)</span>}
        </button>
        <button onClick={() => send("both")} disabled={(!lead.email && !lead.phone) || sending}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600/80 hover:bg-violet-500/80 disabled:opacity-40 text-white text-[11px] font-semibold rounded-lg transition-all">
          Send Both
        </button>
        {sendResult && (
          <span className={`text-[11px] font-medium ml-1 ${sendResult.startsWith("Error") || sendResult.includes("✗") ? "text-red-400" : "text-emerald-400"}`}>
            {sendResult}
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Expandable lead row ──────────────────────────────────────────────────────

function LeadRow({ lead, sel, onToggle, saved, onSave, saving, businessId }: {
  lead: ForeclosureLead; sel: boolean; onToggle: () => void
  saved: boolean; onSave: () => void; saving: boolean; businessId: string
}) {
  const [expanded, setExpanded]   = useState(false)
  const [detailTab, setDetailTab] = useState<"score"|"deal"|"outreach">("score")
  const p = PRI[lead.priority]

  return (
    <>
      <tr onClick={() => setExpanded(e => !e)}
        className={`border-b border-gray-800/50 cursor-pointer transition-colors ${sel ? "bg-indigo-950/40" : expanded ? "bg-gray-800/20" : "hover:bg-gray-800/15"}`}>
        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
          <input type="checkbox" checked={sel} onChange={onToggle} className="w-3.5 h-3.5 accent-indigo-500" />
        </td>
        <td className="px-3 py-3">
          <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-bold border ${p.cls}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${p.dot}`} />{lead.priority}
          </span>
        </td>
        <td className="px-3 py-3">
          <div className="flex items-center gap-2">
            <div className="w-12 h-1.5 bg-gray-700/60 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${lead.score >= 70 ? "bg-red-400" : lead.score >= 45 ? "bg-yellow-400" : "bg-blue-400"}`} style={{ width: `${lead.score}%` }} />
            </div>
            <span className="text-xs font-bold text-white">{lead.score}</span>
          </div>
        </td>
        <td className="px-3 py-3">
          <p className="text-xs font-medium text-white truncate max-w-[140px]">{lead.ownerName}</p>
          <div className="flex gap-1 mt-0.5">
            {lead.isAbsentee    && <span className="text-[9px] bg-purple-500/15 text-purple-300 px-1 rounded">Absentee</span>}
            {lead.taxDelinquent && <span className="text-[9px] bg-red-500/15 text-red-300 px-1 rounded">Tax Delq</span>}
            {lead.ownerType === "corporate" && <span className="text-[9px] bg-gray-700/40 text-gray-400 px-1 rounded">LLC</span>}
          </div>
        </td>
        <td className="px-3 py-3">
          <p className="text-xs text-white truncate max-w-[170px]">{lead.address}</p>
          <p className="text-[11px] text-gray-500">{lead.city}, {lead.state} {lead.zip}</p>
          {lead.beds && <p className="text-[10px] text-gray-600">{lead.beds}bd·{lead.baths}ba{lead.sqft ? ` ·${(lead.sqft/1000).toFixed(1)}k` : ""}</p>}
        </td>
        <td className="px-3 py-3">
          <span className={`px-2 py-1 rounded-lg text-[11px] font-medium border ${STAGE_CLR[lead.foreclosureStage] ?? "bg-gray-700/30 text-gray-400 border-gray-700"}`}>
            {STAGE_LABEL[lead.foreclosureStage]}
          </span>
          <p className="text-[10px] text-gray-600 mt-0.5">{lead.daysOnFile}d ago</p>
        </td>
        <td className="px-3 py-3 text-right">
          <p className="text-xs font-medium text-white">{fmt(lead.estimatedValue, "$")}</p>
          {lead.avmConfidence && <p className="text-[10px] text-gray-600">AVM {lead.avmConfidence}%</p>}
        </td>
        <td className="px-3 py-3 text-right">
          {lead.equityPercent != null
            ? <span className={`text-xs font-bold ${lead.equityPercent >= 35 ? "text-emerald-400" : lead.equityPercent >= 15 ? "text-yellow-400" : "text-orange-400"}`}>{lead.equityPercent}%</span>
            : <span className="text-xs text-gray-600">—</span>}
        </td>
        <td className="px-3 py-3 text-right"><span className="text-xs text-red-300">{fmt(lead.defaultAmount, "$")}</span></td>
        <td className="px-3 py-3">
          {lead.phone ? <p className="text-xs text-emerald-400">{lead.phone}</p>
            : lead.email ? <p className="text-xs text-blue-400 truncate max-w-[110px]">{lead.email}</p>
            : <span className="text-[11px] text-gray-600">—</span>}
        </td>
        <td className="px-3 py-3">
          {lead.dealCalc
            ? <span className={`text-xs font-bold px-2 py-1 rounded-lg border ${GRADE_CLR[lead.dealCalc.dealGrade]}`}>{lead.dealCalc.dealGrade}</span>
            : <span className="text-[11px] text-gray-600">—</span>}
        </td>
        <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
          {saved
            ? <span className="text-xs text-emerald-400 font-medium">✓ Saved</span>
            : <button onClick={onSave} disabled={saving} className="px-3 py-1.5 bg-indigo-600/80 hover:bg-indigo-500/80 disabled:opacity-40 text-white text-[11px] font-semibold rounded-lg">Save</button>}
        </td>
        <td className="px-2"><span className={`text-gray-600 text-xs transition-transform inline-block ${expanded ? "rotate-180" : ""}`}>▼</span></td>
      </tr>

      {expanded && (
        <tr className="border-b border-gray-800/50 bg-gray-900/30">
          <td colSpan={13} className="px-6 py-5">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* Left: tabs */}
              <div className="lg:col-span-1 space-y-3">
                <div className="flex gap-1 border-b border-gray-700/40 pb-2">
                  {(["score","deal","outreach"] as const).map(t => (
                    <button key={t} onClick={() => setDetailTab(t)}
                      className={`text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-all ${detailTab === t ? "bg-gray-700 text-white" : "text-gray-500 hover:text-gray-300"}`}>
                      {t === "score" ? "📊 Score" : t === "deal" ? "🧮 Deal" : "✉ Outreach"}
                    </button>
                  ))}
                </div>
                {detailTab === "score" && (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <ScoreBarRow label="Equity"   value={Math.max(0,lead.scoreBreakdown.equity)}   max={35} color="bg-emerald-500" />
                      <ScoreBarRow label="Distress" value={Math.max(0,lead.scoreBreakdown.distress)} max={25} color="bg-orange-500" />
                      <ScoreBarRow label="Stage"    value={Math.max(0,lead.scoreBreakdown.stage)}    max={20} color="bg-red-500" />
                      <ScoreBarRow label="Owner"    value={Math.max(0,lead.scoreBreakdown.owner)}    max={12} color="bg-violet-500" />
                      <ScoreBarRow label="Property" value={Math.max(0,lead.scoreBreakdown.property)} max={8}  color="bg-blue-500" />
                    </div>
                    <div className="space-y-1 pt-1">
                      {lead.distressSignals.map((s,i) => (
                        <p key={i} className="text-[11px] text-gray-400 flex gap-2">
                          <span className="text-orange-400 shrink-0">·</span>{s}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
                {detailTab === "deal" && lead.dealCalc && (
                  <div className="space-y-1.5">
                    {[["ARV", fmt(lead.dealCalc.arv, "$")],["Est. Repairs", fmt(lead.dealCalc.estimatedRepairs, "$")],["Max Offer (70%)", fmt(lead.dealCalc.maxOffer, "$")],["Total Debt", fmt(lead.dealCalc.totalDebt, "$")],["Equity Available", fmt(lead.dealCalc.equityAvailable, "$")],["Est. Profit", fmt(lead.dealCalc.potentialProfit, "$")]].map(([l,v]) => (
                      <div key={l} className="flex justify-between">
                        <span className="text-xs text-gray-500">{l}</span>
                        <span className="text-xs font-semibold text-white">{v}</span>
                      </div>
                    ))}
                    <div className="pt-2 border-t border-gray-700/40 flex justify-between">
                      <span className="text-xs text-gray-400 font-semibold">Deal Grade</span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-lg border ${GRADE_CLR[lead.dealCalc.dealGrade]}`}>
                        {lead.dealCalc.dealGrade} {lead.dealCalc.dealGrade === "A" ? "— Excellent" : lead.dealCalc.dealGrade === "B" ? "— Strong" : lead.dealCalc.dealGrade === "C" ? "— Marginal" : "— Weak"}
                      </span>
                    </div>
                  </div>
                )}
                {detailTab === "outreach" && <OutreachPanel lead={lead} businessId={businessId} />}
              </div>

              {/* Middle: property + finances */}
              <div className="space-y-1.5">
                <p className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">Property</p>
                {[["Type",lead.propertyType??"—"],["Beds/Baths",lead.beds?`${lead.beds}bd/${lead.baths}ba`:"—"],["Sqft",fmt(lead.sqft)],["Year Built",lead.yearBuilt?String(lead.yearBuilt):"—"],["Lot Size",fmt(lead.lotSize)]].map(([l,v]) => (
                  <div key={l} className="flex justify-between"><span className="text-[11px] text-gray-600">{l}</span><span className="text-[11px] text-gray-300">{v}</span></div>
                ))}
                <p className="text-[10px] font-bold text-gray-600 uppercase tracking-wider pt-2">Finances</p>
                {[["AVM Value",fmt(lead.avmValue,"$")],["AVM Confidence",lead.avmConfidence?`${lead.avmConfidence}%`:"—"],["Purchase Price",fmt(lead.purchasePrice,"$")],["Purchase Date",lead.purchaseDate?.slice(0,7)??"—"],["Years Owned",lead.yearsOwned!=null?`${lead.yearsOwned}y`:"—"],["Total Liens",fmt(lead.totalLiens,"$")],["Lien Count",String(lead.lienCount)]].map(([l,v]) => (
                  <div key={l} className="flex justify-between"><span className="text-[11px] text-gray-600">{l}</span><span className="text-[11px] text-gray-300">{v}</span></div>
                ))}
                <div className="flex justify-between"><span className="text-[11px] text-gray-600">Tax Delinquent</span><span className={`text-[11px] font-semibold ${lead.taxDelinquent?"text-orange-300":"text-gray-400"}`}>{lead.taxDelinquent?"YES ⚠":"No"}</span></div>
              </div>

              {/* Right: foreclosure + owner + contact */}
              <div className="space-y-1.5">
                <p className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">Foreclosure</p>
                {[["Stage",STAGE_LABEL[lead.foreclosureStage]],["Filed",fmtDate(lead.recordingDate)],["Days on File",`${lead.daysOnFile}d`],["Default Amt",fmt(lead.defaultAmount,"$")],["Lender",lead.lender??"—"]].map(([l,v]) => (
                  <div key={l} className="flex justify-between"><span className="text-[11px] text-gray-600">{l}</span><span className="text-[11px] text-gray-300">{v}</span></div>
                ))}
                {lead.auctionDate && <div className="flex justify-between"><span className="text-[11px] text-gray-600">Auction</span><span className="text-[11px] text-red-300 font-semibold">{fmtDate(lead.auctionDate)}</span></div>}

                <p className="text-[10px] font-bold text-gray-600 uppercase tracking-wider pt-2">Owner</p>
                {[["Name",lead.ownerName],["Type",lead.ownerType],["Absentee",lead.isAbsentee?"YES — not living there":"No"],["Mailing",lead.mailingAddress??"same as property"]].map(([l,v]) => (
                  <div key={l} className="flex justify-between gap-2"><span className="text-[11px] text-gray-600 shrink-0">{l}</span><span className={`text-[11px] truncate max-w-[180px] ${l==="Absentee"&&lead.isAbsentee?"text-orange-300 font-semibold":"text-gray-300"}`}>{v}</span></div>
                ))}

                {(lead.phone || lead.email || lead.linkedInUrl) && (
                  <>
                    <p className="text-[10px] font-bold text-gray-600 uppercase tracking-wider pt-2">Contact Found</p>
                    {lead.phone  && <div className="flex justify-between"><span className="text-[11px] text-gray-600">Phone</span><span className="text-[11px] text-emerald-400 font-semibold">{lead.phone}</span></div>}
                    {lead.email  && <div className="flex justify-between"><span className="text-[11px] text-gray-600">Email</span><span className="text-[11px] text-blue-400 truncate max-w-[180px]">{lead.email}</span></div>}
                    {lead.linkedInUrl && <button onClick={() => window.open(lead.linkedInUrl!, "_blank")} className="text-[11px] text-indigo-400 hover:underline">LinkedIn →</button>}
                    <p className="text-[10px] text-gray-600">Confidence: {lead.contactConfidence}</p>
                  </>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ─── Bulk campaign sender ─────────────────────────────────────────────────────

function CampaignTab({ leads, businessId, apiHeaders }: { leads: ForeclosureLead[]; businessId: string; apiHeaders: Record<string, string> }) {
  const withContact = leads.filter(l => l.email || l.phone)
  const [selected, setSelected]   = useState<Set<number>>(new Set())
  const [channel, setChannel]     = useState<"email"|"sms"|"both">("email")
  const [subject, setSubject]     = useState("A personal note about your property")
  const [message, setMessage]     = useState("")
  const [smsText, setSmsText]     = useState("")
  const [fromName, setFromName]   = useState("")
  const [fromPhone, setFromPhone] = useState("")
  const [sending, setSending]     = useState(false)
  const [result, setResult]       = useState<{ sent: number; failed: number } | null>(null)
  const [generating, setGenerating] = useState(false)

  const toggleAll = () => {
    const ids = withContact.map(l => l.attomId)
    const all = ids.every(id => selected.has(id))
    setSelected(all ? new Set() : new Set(ids))
  }

  const generateBulkTemplate = async () => {
    if (withContact.length === 0) return
    setGenerating(true)
    const sample = withContact[0]
    try {
      const res = await fetch("/api/leads/foreclosure-outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead: sample, style: "direct" }),
      })
      const data = await res.json()
      if (res.ok) {
        setMessage(data.outreach.yellowLetter)
        setSmsText(data.outreach.smsOpener)
      }
    } catch { /* silent */ }
    setGenerating(false)
  }

  const sendCampaign = async () => {
    if (selected.size === 0 || (!message && !smsText)) return
    setSending(true)
    setResult(null)
    const targets = withContact
      .filter(l => selected.has(l.attomId))
      .map(l => ({ attomId: l.attomId, ownerName: l.ownerName, address: l.address, email: l.email, phone: l.phone }))
    try {
      const res = await fetch("/api/leads/foreclosure-send", {
        method: "POST",
        headers: apiHeaders,
        body: JSON.stringify({ targets, channel, emailSubject: subject, emailLetter: message, smsText, fromName, fromPhone }),
      })
      const data = await res.json()
      if (res.ok) setResult({ sent: (data.emailSent||0) + (data.smsSent||0), failed: (data.emailFailed||0) + (data.smsFailed||0) })
    } catch { /* silent */ }
    setSending(false)
  }

  if (withContact.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 text-sm">
        No leads with contact information yet. Run a search with <strong className="text-white">AI Contact Discovery</strong> enabled to find phone numbers and emails.
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="bg-gray-900/60 border border-gray-700/40 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white">Bulk Outreach Campaign</h3>
            <p className="text-xs text-gray-500 mt-0.5">{withContact.length} leads with contact info · {selected.size} selected</p>
          </div>
          <div className="flex gap-2">
            <button onClick={generateBulkTemplate} disabled={generating}
              className="px-3 py-1.5 bg-gray-700/80 hover:bg-gray-600/80 text-gray-300 text-xs font-semibold rounded-xl transition-all border border-gray-600/40">
              {generating ? "Generating…" : "✨ AI Draft Message"}
            </button>
          </div>
        </div>

        {/* Channel + sender */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="label">Channel</label>
            <select value={channel} onChange={e => setChannel(e.target.value as typeof channel)} className={INPUT}>
              <option value="email">Email only</option>
              <option value="sms">SMS only</option>
              <option value="both">Email + SMS</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label">Email Subject</label>
            <input value={subject} onChange={e => setSubject(e.target.value)} className={INPUT} />
          </div>
          <div>
            <label className="label">Your Name</label>
            <input value={fromName} onChange={e => setFromName(e.target.value)} placeholder="Your name" className={INPUT} />
          </div>
        </div>

        {(channel === "email" || channel === "both") && (
          <div>
            <label className="label">Email / Letter Body <span className="text-gray-600">(use [YOUR NAME] and [YOUR PHONE] as placeholders)</span></label>
            <textarea value={message} onChange={e => setMessage(e.target.value)} rows={8}
              placeholder="Write your message or click AI Draft above…"
              className="w-full bg-gray-800/60 border border-gray-700/50 rounded-xl px-3 py-2.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500/70 resize-y" />
          </div>
        )}

        {(channel === "sms" || channel === "both") && (
          <div>
            <label className="label">SMS Text <span className="text-gray-600">(max 160 chars)</span></label>
            <textarea value={smsText} onChange={e => setSmsText(e.target.value)} rows={2} maxLength={1600}
              className="w-full bg-gray-800/60 border border-gray-700/50 rounded-xl px-3 py-2.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500/70 resize-none" />
            <p className="text-[10px] text-gray-600 mt-1">{smsText.length}/160 chars</p>
          </div>
        )}

        <button onClick={sendCampaign} disabled={sending || selected.size === 0 || (!message && !smsText)}
          className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-all">
          {sending
            ? <span className="flex items-center gap-2"><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Sending…</span>
            : `Send to ${selected.size} Lead${selected.size !== 1 ? "s" : ""}`}
        </button>

        {result && (
          <p className={`text-sm font-semibold ${result.failed > 0 ? "text-yellow-300" : "text-emerald-400"}`}>
            ✓ {result.sent} sent{result.failed > 0 ? ` · ${result.failed} failed` : ""}
          </p>
        )}
      </div>

      {/* Recipient list */}
      <div className="bg-gray-900/60 border border-gray-700/40 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-700/40 flex items-center gap-3">
          <input type="checkbox" checked={withContact.length > 0 && withContact.every(l => selected.has(l.attomId))} onChange={toggleAll} className="accent-indigo-500" />
          <span className="text-xs text-gray-400">Select all {withContact.length} with contact info</span>
        </div>
        <div className="divide-y divide-gray-800/50">
          {withContact.map(l => (
            <div key={l.attomId} className={`flex items-center gap-3 px-4 py-3 transition-colors ${selected.has(l.attomId) ? "bg-indigo-950/30" : "hover:bg-gray-800/20"}`}>
              <input type="checkbox" checked={selected.has(l.attomId)} onChange={() => setSelected(prev => { const s = new Set(prev); s.has(l.attomId) ? s.delete(l.attomId) : s.add(l.attomId); return s })} className="accent-indigo-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-white truncate">{l.ownerName}</p>
                <p className="text-[11px] text-gray-500 truncate">{l.address}, {l.city}</p>
              </div>
              <div className="text-right shrink-0">
                {l.email  && <p className="text-[11px] text-blue-400 truncate max-w-[160px]">{l.email}</p>}
                {l.phone  && <p className="text-[11px] text-emerald-400">{l.phone}</p>}
              </div>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${PRI[l.priority].cls} shrink-0`}>{l.priority}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── At-risk scanner tab ──────────────────────────────────────────────────────

const RISK_CLR: Record<string, string> = {
  CRITICAL: "bg-red-500/15 text-red-300 border-red-500/30",
  HIGH:     "bg-orange-500/15 text-orange-300 border-orange-500/30",
  MODERATE: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
}
const SIGNAL_ICON: Record<string, string> = {
  tax_delinquent:     "🏛",
  code_violation:     "🚧",
  hoa_lien:           "🏘",
  judgment_lien:      "⚖",
  court_filing:       "📋",
  vacant_distressed:  "🏚",
  multiple_signals:   "🔴",
}

function AtRiskTab({ businessId }: { businessId: string }) {
  const defaultP: AreaParams = { searchType: "zip", zipCode: "", city: "", state: "", county: "", daysBack: 90, maxLeads: 50, enrichContacts: false }
  const [p, setP]           = useState<AreaParams>(defaultP)
  const [loading, setLoading] = useState(false)
  const [leads, setLeads]   = useState<AtRiskLead[]>([])
  const [error, setError]   = useState<string | null>(null)
  const [savedIds, setSaved] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

  const search = async () => {
    if (p.searchType === "zip" && !p.zipCode) { setError("Enter a ZIP code."); return }
    if (p.searchType === "city" && (!p.city || !p.state)) { setError("Enter city and state."); return }
    if (p.searchType === "county" && (!p.county || !p.state)) { setError("Enter county and state."); return }
    setLoading(true); setError(null); setLeads([])
    try {
      const res = await fetch("/api/leads/at-risk-search", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...p, maxLeads: p.maxLeads }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Search failed")
      setLeads(data.leads ?? [])
      if (data.message && data.leads?.length === 0) setError(data.message)
    } catch (e) { setError(e instanceof Error ? e.message : "Search failed") }
    setLoading(false)
  }

  const saveLead = async (lead: AtRiskLead) => {
    setSaving(true)
    try {
      const res = await fetch("/api/leads", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId, name: `${lead.ownerName} — ${lead.address}`,
          phone: lead.phone ?? null, email: lead.email ?? null,
          source: `At-Risk · ${lead.signalType.replace(/_/g, " ")}`,
          notes: `${lead.signalSummary}\n\nAction: ${lead.actionNote}\nSource: ${lead.sourceUrl}\nRisk Score: ${lead.riskScore}/100`,
        }),
      })
      if (res.ok) setSaved(prev => new Set([...prev, lead.id]))
    } catch { /* silent */ }
    setSaving(false)
  }

  return (
    <div className="space-y-5">
      <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
        <p className="text-xs text-amber-300 font-semibold">⚡ Pre-NOD Intelligence Scanner</p>
        <p className="text-[11px] text-amber-400/70 mt-0.5">
          Finds homeowners showing distress signals BEFORE the Notice of Default is filed — tax delinquency, HOA liens, judgment liens, code violations, court filings.
          AI scans public records and web sources. First-mover advantage over investors who only watch foreclosure lists.
        </p>
      </div>

      <div className="bg-gray-900/60 border border-gray-700/40 rounded-2xl p-5">
        <AreaForm p={p} setP={setP} onSearch={search} loading={loading} />
        {error && <div className="mt-3 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-300">{error}</div>}
      </div>

      {leads.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span className="font-semibold text-white">{leads.length}</span> at-risk properties found ·
            <span className="text-red-300">{leads.filter(l => l.riskLevel === "CRITICAL").length} CRITICAL</span> ·
            <span className="text-orange-300">{leads.filter(l => l.riskLevel === "HIGH").length} HIGH</span>
          </div>
          <div className="space-y-2">
            {leads.map(lead => (
              <div key={lead.id} className="bg-gray-900/60 border border-gray-700/40 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg border ${RISK_CLR[lead.riskLevel]}`}>{lead.riskLevel}</span>
                      <span className="text-xs font-bold text-white">{lead.riskScore}</span>
                      <span className="text-lg">{SIGNAL_ICON[lead.signalType] ?? "⚠"}</span>
                      <span className="text-[11px] text-gray-400">{lead.signalType.replace(/_/g, " ")}</span>
                    </div>
                    <p className="text-sm font-medium text-white mt-2 truncate">{lead.address}{lead.city ? `, ${lead.city}` : ""}{lead.state ? `, ${lead.state}` : ""} {lead.zip}</p>
                    {lead.ownerName !== "Owner Unknown" && <p className="text-xs text-gray-400">{lead.ownerName}</p>}
                    <p className="text-xs text-orange-300 mt-1.5">{lead.signalSummary}</p>
                    <p className="text-[11px] text-gray-500 mt-1">{lead.actionNote}</p>
                    {lead.sourceUrl && (
                      <a href={lead.sourceUrl} target="_blank" rel="noreferrer" className="text-[10px] text-indigo-400 hover:underline mt-1 inline-block truncate max-w-xs">
                        Source →
                      </a>
                    )}
                  </div>
                  <div className="shrink-0">
                    {savedIds.has(lead.id)
                      ? <span className="text-xs text-emerald-400 font-medium">✓ Saved</span>
                      : <button onClick={() => saveLead(lead)} disabled={saving}
                          className="px-3 py-1.5 bg-indigo-600/80 hover:bg-indigo-500/80 text-white text-[11px] font-semibold rounded-lg">
                          Save to CRM
                        </button>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && leads.length === 0 && !error && (
        <div className="text-center py-10 text-gray-500 text-sm">
          Enter an area above to scan for at-risk properties before the NOD is filed.
        </div>
      )}
    </div>
  )
}

// ─── Main foreclosure search tab ──────────────────────────────────────────────

function ForeclosureTab({ businessId, apiBase, apiHeaders }: { businessId: string; apiBase: string; apiHeaders: Record<string, string> }) {
  const defaultP: AreaParams = { searchType: "zip", zipCode: "", city: "", state: "", county: "", daysBack: 90, maxLeads: 100, enrichContacts: false }
  const [p, setP]             = useState<AreaParams>(defaultP)
  const [loading, setLoading] = useState(false)
  const [result, setResult]   = useState<{ leads: ForeclosureLead[]; total: number; fetched: number; dataSource?: string; dataNote?: string } | null>(null)
  const [error, setError]     = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set())
  const [saving, setSaving]   = useState(false)
  const [filterPri, setFilterPri]         = useState("ALL")
  const [filterMinScore, setFilterMinScore] = useState(0)
  const [filterAbsentee, setFilterAbsentee] = useState(false)
  const [filterTaxDelq, setFilterTaxDelq]   = useState(false)
  const [filterMinEq, setFilterMinEq]       = useState(0)
  const [filterMaxDays, setFilterMaxDays]   = useState(365)
  const [filterStage, setFilterStage]       = useState("ALL")
  const [showFilters, setShowFilters]       = useState(false)
  const [sortCol, setSortCol] = useState<keyof ForeclosureLead>("score")
  const [sortDir, setSortDir] = useState<"asc"|"desc">("desc")
  // Deep Search mode state
  const [deepMode, setDeepMode]           = useState(true)
  const [progressPct, setProgressPct]     = useState(0)
  const [progressMsg, setProgressMsg]     = useState("")
  const [sourceSummary, setSourceSummary] = useState<Record<string, number> | null>(null)
  const [newCount, setNewCount]           = useState<number | null>(null)
  const progressTimerRef                  = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopProgressTimer = () => {
    if (progressTimerRef.current) { clearInterval(progressTimerRef.current); progressTimerRef.current = null }
  }

  const startProgressAnimation = (targetLeads: number) => {
    const MESSAGES = [
      "Searching public foreclosure & trustee-sale notices…",
      "Scanning Zillow, Redfin & government REO sources…",
      "Pulling notice-of-default & notice-of-sale filings…",
      "Crawling legal-notice publications for property addresses…",
      "Extracting addresses, owners, default amounts & sale dates…",
      "Running AI extraction over legal notices…",
      "Enriching owner contact phone numbers…",
      `Scoring & ranking up to ${targetLeads} leads hot → cold…`,
    ]
    let step = 0
    setProgressPct(2)
    setProgressMsg(MESSAGES[0])
    progressTimerRef.current = setInterval(() => {
      step++
      const pct = Math.min(Math.round((step / MESSAGES.length) * 95), 95)
      setProgressPct(pct)
      setProgressMsg(MESSAGES[Math.min(step, MESSAGES.length - 1)])
    }, 5500)
  }

  const search = async () => {
    if (p.searchType === "zip" && !p.zipCode) { setError("Enter a ZIP code."); return }
    if (p.searchType === "city" && (!p.city || !p.state)) { setError("Enter city and state."); return }
    if (p.searchType === "county" && (!p.county || !p.state)) { setError("Enter county and state."); return }
    setLoading(true); setError(null); setResult(null); setSelected(new Set()); setSavedIds(new Set())
    setProgressPct(0); setProgressMsg(""); setSourceSummary(null); setNewCount(null)
    stopProgressTimer()

    if (deepMode) {
      // For a county search of a known SoCal county, pass its ID for the fast
      // hardcoded bounding box. For ANY zip/city/other county, pass no countyIds
      // so the server searches exactly what the user typed — anywhere in the US.
      const COUNTY_ID_MAP: Record<string, string> = {
        "san diego":      "san-diego",
        "riverside":      "riverside",
        "san bernardino": "san-bernardino",
        "orange":         "orange",
        "los angeles":    "los-angeles",
      }
      const countyIds = p.searchType === "county" && p.county
        ? (() => {
            const id = COUNTY_ID_MAP[p.county.toLowerCase().replace(/\s+county\s*$/, "").trim()]
            return id ? [id] : undefined
          })()
        : undefined

      startProgressAnimation(p.maxLeads)

      try {
        const res = await fetch("/api/leads/deep-search", {
          method:  "POST",
          headers: apiHeaders,
          body:    JSON.stringify({
            searchType: p.searchType,
            zipCode:    p.zipCode  || undefined,
            city:       p.city     || undefined,
            state:      p.state    || undefined,
            county:     p.county   || undefined,
            countyIds,
            maxLeads:   p.maxLeads,
            daysBack:   p.daysBack,
          }),
        })

        stopProgressTimer()
        setProgressPct(100)

        if (!res.ok) {
          let errMsg = `Search failed (${res.status})`
          try { const d = await res.json(); errMsg = d.error ?? errMsg } catch { /* ignore */ }
          throw new Error(errMsg)
        }

        const data = await res.json()
        setResult({ leads: data.leads ?? [], total: data.total ?? 0, fetched: data.fetched ?? 0, dataSource: "deep-search", dataNote: data.note })
        setSourceSummary(data.sourceCounts ?? null)
        setNewCount(data.newTotal ?? null)
      } catch (e) {
        stopProgressTimer()
        setError(e instanceof Error ? e.message : "Deep search failed — please try again")
      }
      setLoading(false)
      return
    }

    // ── Standard search (non-deep mode) ───────────────────────────────────
    try {
      const res = await fetch(apiBase, { method: "POST", headers: apiHeaders, body: JSON.stringify(p) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Search failed")
      setResult(data)
    } catch (e) { setError(e instanceof Error ? e.message : "Search failed") }
    setLoading(false)
  }

  const saveSingle = async (lead: ForeclosureLead) => {
    setSaving(true)
    try {
      const res = await fetch(apiBase, { method: "PUT", headers: apiHeaders, body: JSON.stringify({ businessId, leads: [lead] }) })
      if (res.ok) setSavedIds(prev => new Set([...prev, lead.attomId]))
    } catch { /* silent */ }
    setSaving(false)
  }

  const saveSelected = async () => {
    if (!result || selected.size === 0) return
    setSaving(true)
    const leads = result.leads.filter(l => selected.has(l.attomId))
    try {
      const res = await fetch(apiBase, { method: "PUT", headers: apiHeaders, body: JSON.stringify({ businessId, leads }) })
      if (res.ok) { setSavedIds(prev => new Set([...prev, ...leads.map(l => l.attomId)])); setSelected(new Set()) }
    } catch { /* silent */ }
    setSaving(false)
  }

  const exportCSV = () => {
    if (!result?.leads.length) return
    const hdrs = ["Priority","Score","Owner","Absentee","TaxDelq","Address","City","State","ZIP","Stage","Filed","DaysOnFile","EstValue","AVMValue","AVMConf","Equity%","EquityAmt","TotalLiens","LienCount","DefaultAmt","Lender","PurchasePrice","PurchaseDate","YearsOwned","Beds","Baths","Sqft","YearBuilt","Phone","Email","DealGrade","MaxOffer","PotentialProfit","ScoreReason"]
    const rows = result.leads.map(l => [l.priority,l.score,`"${l.ownerName}"`,l.isAbsentee?"Y":"N",l.taxDelinquent?"Y":"N",`"${l.address}"`,l.city,l.state,l.zip,l.foreclosureStage,l.recordingDate,l.daysOnFile,l.estimatedValue??"",l.avmValue??"",l.avmConfidence??"",l.equityPercent??"",l.estimatedEquity??"",l.totalLiens,l.lienCount,l.defaultAmount??"",`"${l.lender??""}"`,l.purchasePrice??"",l.purchaseDate??"",l.yearsOwned??"",l.beds??"",l.baths??"",l.sqft??"",l.yearBuilt??"",`"${l.phone??""}"`,`"${l.email??""}"`,l.dealCalc?.dealGrade??"",l.dealCalc?.maxOffer??"",l.dealCalc?.potentialProfit??"",`"${l.scoreReason}"`].join(","))
    const blob = new Blob([[hdrs.join(","), ...rows].join("\n")], { type: "text/csv" })
    const url = URL.createObjectURL(blob); const a = document.createElement("a")
    a.href = url; a.download = `foreclosure-leads-${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  const filtered = useMemo(() => {
    if (!result) return []
    return result.leads.filter(l =>
      (filterPri === "ALL" || l.priority === filterPri) &&
      l.score >= filterMinScore &&
      (!filterAbsentee || l.isAbsentee) &&
      (!filterTaxDelq || l.taxDelinquent) &&
      (filterMinEq === 0 || (l.equityPercent != null && l.equityPercent >= filterMinEq)) &&
      l.daysOnFile <= filterMaxDays &&
      (filterStage === "ALL" || l.foreclosureStage === filterStage)
    )
  }, [result, filterPri, filterMinScore, filterAbsentee, filterTaxDelq, filterMinEq, filterMaxDays, filterStage])

  const PRI_RANK: Record<string, number> = { HOT: 0, WARM: 1, COLD: 2 }
  const sorted = useMemo(() =>
    [...filtered].sort((a, b) => {
      // Always group by priority first (HOT → WARM → COLD) when sorting by score
      if (sortCol === "score") {
        const pa = PRI_RANK[a.priority] ?? 2, pb = PRI_RANK[b.priority] ?? 2
        if (pa !== pb) return sortDir === "desc" ? pa - pb : pb - pa
      }
      const av = (a[sortCol] ?? 0) as string|number, bv = (b[sortCol] ?? 0) as string|number
      const c = typeof av === "string" ? av.localeCompare(String(bv)) : Number(av) - Number(bv)
      return sortDir === "asc" ? c : -c
    })
  , [filtered, sortCol, sortDir])

  const counts = useMemo(() => result ? {
    hot: result.leads.filter(l => l.priority === "HOT").length,
    warm: result.leads.filter(l => l.priority === "WARM").length,
    cold: result.leads.filter(l => l.priority === "COLD").length,
    absentee: result.leads.filter(l => l.isAbsentee).length,
    taxDelq: result.leads.filter(l => l.taxDelinquent).length,
    withContact: result.leads.filter(l => l.phone || l.email).length,
    gradeA: result.leads.filter(l => l.dealCalc?.dealGrade === "A").length,
  } : null, [result])

  const SH = ({ col, label }: { col: keyof ForeclosureLead; label: string }) => (
    <button onClick={() => { setSortCol(c => { if (c === col) { setSortDir(d => d === "asc" ? "desc" : "asc"); return c } setSortDir("desc"); return col }); }} className="flex items-center gap-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wider hover:text-white whitespace-nowrap">
      {label}{sortCol === col && <span className="text-indigo-400">{sortDir === "asc" ? "↑" : "↓"}</span>}
    </button>
  )

  return (
    <div className="space-y-5">
      <div className="bg-gray-900/60 border border-gray-700/40 rounded-2xl p-5">
        {/* Deep Search toggle */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setDeepMode(m => !m)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                deepMode
                  ? "bg-indigo-600/20 border-indigo-500/40 text-indigo-300"
                  : "bg-gray-800/60 border-gray-700/40 text-gray-500 hover:text-white"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${deepMode ? "bg-indigo-400 animate-pulse" : "bg-gray-600"}`} />
              Deep Search
            </button>
            {deepMode && (
              <p className="text-[11px] text-indigo-400/70">
                7 sources · tiled maps · 40+ queries · AI extraction — surfaces leads no one else finds
              </p>
            )}
          </div>
          {result && (
            <div className="flex items-center gap-3">
              <p className="text-xs text-gray-500">{result.fetched} leads</p>
              {newCount !== null && (
                <span className="px-2 py-0.5 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[11px] font-semibold rounded-lg">
                  {newCount} new
                </span>
              )}
            </div>
          )}
        </div>

        <AreaForm p={p} setP={setP} onSearch={search} loading={loading} />

        {/* Progress during Deep Search */}
        {loading && deepMode && (
          <div className="mt-4 bg-indigo-950/40 border border-indigo-500/20 rounded-xl px-4 py-3">
            <div className="flex items-center gap-3 mb-2">
              <span className="w-3.5 h-3.5 border-2 border-indigo-400/40 border-t-indigo-400 rounded-full animate-spin shrink-0" />
              <p className="text-xs text-indigo-300 font-medium">
                {progressMsg || "Initializing Deep Search — querying 7 sources…"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-gray-800 rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-full bg-indigo-500 transition-all duration-[2000ms] ease-out rounded-full"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <span className="text-[11px] text-indigo-400 font-mono shrink-0">{progressPct}%</span>
            </div>
          </div>
        )}

        {/* Source breakdown after search */}
        {sourceSummary && Object.keys(sourceSummary).length > 0 && !loading && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {Object.entries(sourceSummary).map(([src, n]) => (
              <span key={src} className="px-2 py-0.5 bg-gray-800/60 border border-gray-700/40 text-[10px] text-gray-400 rounded-lg">
                {src} <span className="text-white font-semibold">{n}</span>
              </span>
            ))}
          </div>
        )}

        {error && <div className="mt-3 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-300">{error}</div>}
      </div>

      {result && result.leads.length > 0 && counts && (
        <>
          {/* Data source badge */}
          {result.dataSource === "ai-research-mode" && (
            <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl px-4 py-3 flex items-start gap-3">
              <span className="text-lg shrink-0">🤖</span>
              <div>
                <p className="text-xs font-semibold text-amber-300">AI Research Mode</p>
                <p className="text-[11px] text-amber-400/70 mt-0.5">
                  Leads generated by Groq using real market knowledge for this area — not pulled from live public records.
                  Add <code className="text-amber-300 bg-amber-900/30 px-1 rounded">TAVILY_API_KEY</code> (free at tavily.com) to switch to live data.
                </p>
              </div>
            </div>
          )}
          {result.dataSource === "duckduckgo-live" && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-2.5 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
              <p className="text-[11px] text-emerald-300">Live public records found via web search</p>
            </div>
          )}
          {result.dataSource === "attom" && (
            <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl px-4 py-2.5 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-400 shrink-0" />
              <p className="text-[11px] text-indigo-300">ATTOM Data — full 6-pass enrichment with equity, liens, and AVM</p>
            </div>
          )}
          <TopDealsCard leads={result.leads} onSave={saveSingle} savedIds={savedIds} businessId={businessId} />

          <div className="flex flex-wrap gap-2 items-center">
            {[
              { l:"Total", v:result.fetched, c:"text-white", clk: undefined },
              { l:"HOT", v:counts.hot, c:"text-red-300", clk:() => setFilterPri(q => q === "HOT" ? "ALL" : "HOT"), active: filterPri === "HOT" },
              { l:"WARM", v:counts.warm, c:"text-yellow-300", clk:() => setFilterPri(q => q === "WARM" ? "ALL" : "WARM"), active: filterPri === "WARM" },
              { l:"COLD", v:counts.cold, c:"text-blue-300", clk:() => setFilterPri(q => q === "COLD" ? "ALL" : "COLD"), active: filterPri === "COLD" },
              { l:"Absentee", v:counts.absentee, c:"text-purple-300", clk:() => setFilterAbsentee(q => !q), active: filterAbsentee },
              { l:"Tax Delq", v:counts.taxDelq, c:"text-orange-300", clk:() => setFilterTaxDelq(q => !q), active: filterTaxDelq },
              { l:"Contacts", v:counts.withContact, c:"text-emerald-300", clk: undefined },
              { l:"Grade A", v:counts.gradeA, c:"text-emerald-400", clk: undefined },
            ].map(chip => (
              <div key={chip.l} onClick={chip.clk}
                className={`flex items-center gap-2 border rounded-xl px-3 py-2 transition-all ${chip.clk ? "cursor-pointer" : ""} ${chip.active ? "bg-gray-700/60 border-gray-500/50" : "bg-gray-900/60 border-gray-700/40"} ${chip.c}`}>
                <span className="text-[10px] text-gray-500 uppercase tracking-wider">{chip.l}</span>
                <span className="text-sm font-bold">{chip.v}</span>
              </div>
            ))}
            <div className="ml-auto flex gap-2">
              <button onClick={() => setShowFilters(v => !v)} className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all ${showFilters ? "bg-gray-700 border-gray-600 text-white" : "bg-gray-800/60 border-gray-700/40 text-gray-400 hover:text-white"}`}>⚙ Filters</button>
              {selected.size > 0 && <button onClick={saveSelected} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-emerald-600/80 hover:bg-emerald-500/80 text-white text-xs font-semibold rounded-xl border border-emerald-500/40">💾 Save {selected.size}</button>}
              <button onClick={exportCSV} className="px-3 py-2 bg-gray-800/80 text-gray-300 text-xs font-semibold rounded-xl border border-gray-700/40 hover:bg-gray-700/80">📊 CSV</button>
            </div>
          </div>

          {showFilters && (
            <div className="bg-gray-900/60 border border-gray-700/40 rounded-xl p-4 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              <div><label className="label">Min Score</label><input type="number" min={0} max={100} value={filterMinScore} onChange={e => setFilterMinScore(Number(e.target.value))} className={INPUT+" text-xs"} /></div>
              <div><label className="label">Min Equity %</label><input type="number" min={0} max={100} value={filterMinEq} onChange={e => setFilterMinEq(Number(e.target.value))} className={INPUT+" text-xs"} /></div>
              <div><label className="label">Max Days Filed</label><input type="number" min={1} max={365} value={filterMaxDays} onChange={e => setFilterMaxDays(Number(e.target.value))} className={INPUT+" text-xs"} /></div>
              <div><label className="label">Stage</label>
                <select value={filterStage} onChange={e => setFilterStage(e.target.value)} className={INPUT+" text-xs"}>
                  <option value="ALL">All</option>
                  <option value="NOTICE_OF_DEFAULT">NOD</option>
                  <option value="LIS_PENDENS">Lis Pendens</option>
                  <option value="NOTICE_OF_SALE">Notice of Sale</option>
                  <option value="AUCTION">Auction</option>
                </select></div>
              <div className="flex flex-col gap-2 pt-1">
                <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={filterAbsentee} onChange={e => setFilterAbsentee(e.target.checked)} className="accent-indigo-500" /><span className="text-xs text-gray-400">Absentee only</span></label>
                <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={filterTaxDelq} onChange={e => setFilterTaxDelq(e.target.checked)} className="accent-indigo-500" /><span className="text-xs text-gray-400">Tax delq. only</span></label>
              </div>
              <div className="flex items-end"><button onClick={() => { setFilterPri("ALL"); setFilterMinScore(0); setFilterAbsentee(false); setFilterTaxDelq(false); setFilterMinEq(0); setFilterMaxDays(365); setFilterStage("ALL") }} className="text-xs text-gray-500 hover:text-white underline">Reset</button></div>
            </div>
          )}

          <p className="text-xs text-gray-600">{sorted.length.toLocaleString()} leads shown · click any row to expand score + deal + outreach</p>

          <div className="bg-gray-900/60 border border-gray-700/40 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700/40 bg-gray-900/40">
                    <th className="px-4 py-3 w-10"><input type="checkbox" checked={sorted.length > 0 && sorted.every(l => selected.has(l.attomId))} onChange={() => { const ids = sorted.map(l => l.attomId); const all = ids.every(id => selected.has(id)); setSelected(all ? new Set() : new Set(ids)) }} className="w-3.5 h-3.5 accent-indigo-500" /></th>
                    <th className="px-3 py-3 text-left"><SH col="priority" label="Priority" /></th>
                    <th className="px-3 py-3 text-left"><SH col="score" label="Score" /></th>
                    <th className="px-3 py-3 text-left"><SH col="ownerName" label="Owner" /></th>
                    <th className="px-3 py-3 text-left"><SH col="address" label="Property" /></th>
                    <th className="px-3 py-3 text-left"><SH col="foreclosureStage" label="Stage" /></th>
                    <th className="px-3 py-3 text-right"><SH col="estimatedValue" label="Value" /></th>
                    <th className="px-3 py-3 text-right"><SH col="equityPercent" label="Equity" /></th>
                    <th className="px-3 py-3 text-right"><SH col="defaultAmount" label="Default" /></th>
                    <th className="px-3 py-3 text-left"><SH col="phone" label="Contact" /></th>
                    <th className="px-3 py-3 text-left"><span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Deal</span></th>
                    <th className="px-3 py-3 w-20"><span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Action</span></th>
                    <th className="px-2 w-6" />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(lead => (
                    <LeadRow key={lead.attomId} lead={lead} sel={selected.has(lead.attomId)} onToggle={() => setSelected(prev => { const s = new Set(prev); s.has(lead.attomId) ? s.delete(lead.attomId) : s.add(lead.attomId); return s })} saved={savedIds.has(lead.attomId)} onSave={() => saveSingle(lead)} saving={saving} businessId={businessId} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {result && result.leads.length === 0 && (
        <div className="bg-gray-900/60 border border-gray-700/40 rounded-2xl p-12 text-center">
          <p className="text-gray-400 text-sm">No records found. Try a wider date range or larger area.</p>
        </div>
      )}

      {!result && !loading && (
        <div className="bg-gray-900/40 border border-dashed border-gray-700/40 rounded-2xl p-12 text-center space-y-3">
          <p className="text-2xl">🏚</p>
          <p className="text-white font-semibold">Deep search pre-foreclosure leads</p>
          <p className="text-gray-500 text-xs max-w-lg mx-auto">6-pass ATTOM enrichment · 40-signal AI scoring · deal calculator · AI contact discovery · personalized outreach generator</p>
        </div>
      )}
    </div>
  )
}

// ─── Root component ───────────────────────────────────────────────────────────

export default function ForeclosureSearch({ businessId, adminPw }: { businessId: string; adminPw?: string }) {
  const [tab, setTab] = useState<"foreclosure"|"atrisk"|"campaign">("foreclosure")
  const [campaignLeads, setCampaignLeads] = useState<ForeclosureLead[]>([])

  // When running inside the admin panel, route all API calls through admin endpoints
  const apiBase = adminPw ? "/api/admin/foreclosure" : "/api/leads/foreclosure-search"
  const apiHeaders: Record<string, string> = adminPw
    ? { "Content-Type": "application/json", "x-admin-password": adminPw }
    : { "Content-Type": "application/json" }

  const TABS = [
    { id: "foreclosure", label: "🏚 Pre-Foreclosure", desc: "Active NOD / Lis Pendens / NOS" },
    { id: "atrisk",      label: "⚡ At Risk (Pre-NOD)", desc: "Tax delinquent, liens, court filings" },
    { id: "campaign",    label: "📤 Send Campaign", desc: "Bulk email & SMS to leads" },
  ] as const

  return (
    <div className="space-y-5">
      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-900/60 border border-gray-700/40 rounded-2xl p-1.5">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 px-4 py-2.5 rounded-xl text-left transition-all ${tab === t.id ? "bg-indigo-600 shadow-sm" : "hover:bg-gray-800/60"}`}>
            <p className={`text-xs font-semibold ${tab === t.id ? "text-white" : "text-gray-400"}`}>{t.label}</p>
            <p className={`text-[10px] mt-0.5 ${tab === t.id ? "text-indigo-200" : "text-gray-600"}`}>{t.desc}</p>
          </button>
        ))}
      </div>

      {tab === "foreclosure" && <ForeclosureTab businessId={businessId} apiBase={apiBase} apiHeaders={apiHeaders} />}
      {tab === "atrisk"      && <AtRiskTab businessId={businessId} />}
      {tab === "campaign"    && <CampaignTab leads={campaignLeads} businessId={businessId} apiHeaders={apiHeaders} />}

      <style>{`
        .label { display:block; font-size:11px; color:#6b7280; margin-bottom:6px; font-weight:500 }
      `}</style>
    </div>
  )
}
