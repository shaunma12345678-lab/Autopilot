"use client"

// 📥 Inbound Sellers — homeowners who raised their hand on the public /sell
// page. These are exclusive, hand-raised motivated sellers (nobody can scrape
// them), so speed matters: call within minutes. Work each lead with one-tap
// call/text/email, run the deal math on the address, and track status.

import { useCallback, useEffect, useMemo, useState } from "react"
import { telHref, smsHref, mailtoHref } from "@/lib/outreach-actions"

interface Seller {
  id: string
  createdAt: string
  status: "new" | "contacted" | "appointment" | "offer" | "closed" | "dead"
  name: string
  phone: string
  email: string
  address: string
  city: string
  state: string
  zip: string
  situation: string
  timeframe: string
  owed: string
}

interface Analysis { value: number; mao: number; profit: number; verdict: string }

const STATUSES: { id: Seller["status"]; label: string; cls: string }[] = [
  { id: "new",         label: "New",         cls: "bg-emerald-600 border-emerald-500 text-white" },
  { id: "contacted",   label: "Contacted",   cls: "bg-sky-700 border-sky-500 text-white" },
  { id: "appointment", label: "Appt set",    cls: "bg-violet-700 border-violet-500 text-white" },
  { id: "offer",       label: "Offer made",  cls: "bg-amber-600 border-amber-500 text-white" },
  { id: "closed",      label: "Closed",      cls: "bg-emerald-800 border-emerald-600 text-emerald-100" },
  { id: "dead",        label: "Dead",        cls: "bg-gray-800 border-gray-700 text-gray-400" },
]

function ago(iso: string): string {
  try {
    const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
    if (mins < 60) return `${mins}m ago`
    if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`
    return `${Math.round(mins / 1440)}d ago`
  } catch { return "" }
}

export default function InboundSellers({ password }: { password: string }) {
  const apiHeaders = useMemo(() => ({ "Content-Type": "application/json", "x-admin-password": password }), [password])
  const [sellers, setSellers] = useState<Seller[]>([])
  const [loading, setLoading] = useState(true)
  const [note, setNote] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [analyses, setAnalyses] = useState<Record<string, Analysis | "loading" | "failed">>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/homeowner", { headers: apiHeaders })
      const data = await res.json()
      setSellers(Array.isArray(data.sellers) ? data.sellers : [])
      setNote(null)
    } catch { setNote("Couldn't load inbound sellers — try refresh.") }
    setLoading(false)
  }, [apiHeaders])

  // Deferred so the effect body itself never sets state synchronously.
  useEffect(() => {
    const t = setTimeout(() => { void load() }, 0)
    return () => clearTimeout(t)
  }, [load])

  const setStatus = async (id: string, status: Seller["status"]) => {
    setSellers((p) => p.map((s) => (s.id === id ? { ...s, status } : s)))
    try {
      await fetch("/api/homeowner", { method: "PATCH", headers: apiHeaders, body: JSON.stringify({ id, status }) })
    } catch { /* optimistic; next load corrects */ }
  }

  const analyze = async (s: Seller) => {
    setAnalyses((p) => ({ ...p, [s.id]: "loading" }))
    try {
      const res = await fetch("/api/leads/analyze-address", {
        method: "POST", headers: apiHeaders,
        body: JSON.stringify({ address: s.address, city: s.city, state: s.state, zip: s.zip }),
      })
      const d = await res.json()
      if (!res.ok || !d?.analysis) throw new Error()
      setAnalyses((p) => ({ ...p, [s.id]: {
        value: d.value ?? d.analysis?.arv ?? 0,
        mao: d.analysis?.mao ?? 0,
        profit: d.analysis?.profit ?? 0,
        verdict: d.analysis?.verdict?.call ?? "",
      } }))
    } catch { setAnalyses((p) => ({ ...p, [s.id]: "failed" })) }
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/sell`)
      setCopied(true); setTimeout(() => setCopied(false), 1600)
    } catch { setNote("Copy failed — the portal is at /sell on this domain.") }
  }

  const fresh = sellers.filter((s) => s.status === "new").length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-white">📥 Inbound Sellers{fresh ? <span className="ml-2 text-xs bg-emerald-600 text-white px-2 py-0.5 rounded-full align-middle">{fresh} new</span> : null}</h3>
          <p className="text-sm text-gray-400 mt-0.5">Homeowners who asked YOU for a cash offer on the public portal — exclusive, hand-raised leads. Call new ones within 5 minutes; speed wins these.</p>
        </div>
        <div className="flex gap-2">
          <a href="/sell" target="_blank" rel="noreferrer" className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 text-xs font-semibold px-3 py-2 rounded-lg">👀 View portal</a>
          <button onClick={copyLink} className="bg-emerald-700/50 hover:bg-emerald-700 border border-emerald-600/50 text-emerald-200 text-xs font-semibold px-3 py-2 rounded-lg">{copied ? "✓ Copied" : "🔗 Copy portal link"}</button>
          <button onClick={load} disabled={loading} className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 text-xs font-semibold px-3 py-2 rounded-lg disabled:opacity-50">{loading ? "…" : "🔄 Refresh"}</button>
        </div>
      </div>

      <div className="bg-sky-950/30 border border-sky-700/30 rounded-xl p-3 text-[11px] text-sky-200">
        Share the portal everywhere your sellers are: put the link on postcards and letters, in your SMS scripts, on bandit signs, and in your Google Business profile. Every submission lands here instantly{" "}
        (and alerts you by email/SMS when AUTOPILOT_NOTIFY_EMAIL / AUTOPILOT_NOTIFY_PHONE are set in Vercel).
      </div>

      {note && <p className="text-xs text-amber-300">{note}</p>}

      {!loading && sellers.length === 0 && (
        <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-8 text-center">
          <p className="text-2xl">📭</p>
          <p className="text-sm text-gray-300 font-semibold mt-2">No inbound sellers yet</p>
          <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">The channel is live at <span className="text-emerald-400">/sell</span>. Put that link in front of distressed owners (mailers, texts, signs) and their requests appear here the moment they submit.</p>
        </div>
      )}

      <div className="space-y-2">
        {sellers.map((s) => {
          const a = analyses[s.id]
          const label = [s.address, s.city, s.state].filter(Boolean).join(", ")
          return (
            <div key={s.id} className={`rounded-xl border p-4 ${s.status === "new" ? "bg-emerald-950/25 border-emerald-600/40" : "bg-gray-900/60 border-gray-800"}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-white text-sm truncate">{label} {s.zip}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{s.name || "Name not given"} · {s.phone || "no phone"} · {s.email || "no email"} · <span className="text-gray-600">{ago(s.createdAt)}</span></p>
                  {(s.timeframe || s.owed) && <p className="text-xs text-gray-500 mt-0.5">{s.timeframe && <>⏱ {s.timeframe}</>}{s.timeframe && s.owed ? " · " : ""}{s.owed && <>💰 owes ~{s.owed}</>}</p>}
                  {s.situation && <p className="text-xs text-gray-300 mt-1.5 bg-gray-950/50 border border-gray-800 rounded-lg px-2.5 py-1.5">{s.situation}</p>}
                </div>
                <div className="flex flex-wrap gap-1.5 shrink-0">
                  {s.phone && <a href={telHref(s.phone)} className="bg-emerald-700/60 hover:bg-emerald-600 text-white text-[11px] font-semibold px-2.5 py-1.5 rounded-lg">📞 Call</a>}
                  {s.phone && <a href={smsHref(s.phone, `Hi ${s.name || "there"}, thanks for reaching out about ${s.address}. When's a good time for a quick call about your cash offer?`)} className="bg-sky-700/60 hover:bg-sky-600 text-white text-[11px] font-semibold px-2.5 py-1.5 rounded-lg">💬 Text</a>}
                  {s.email && <a href={mailtoHref(s.email, `Your cash offer for ${s.address}`, `Hi ${s.name || "there"},\n\nThanks for reaching out about ${label}. I'd love to learn a bit more so we can get you a fair as-is cash offer quickly. When's a good time for a 10-minute call?\n\nNo obligation either way — if a cash sale isn't your best option, I'll tell you.\n`)} className="bg-violet-700/60 hover:bg-violet-600 text-white text-[11px] font-semibold px-2.5 py-1.5 rounded-lg">✉️ Email</a>}
                  <button onClick={() => analyze(s)} disabled={a === "loading"} className="bg-amber-700/50 hover:bg-amber-600 disabled:opacity-50 text-white text-[11px] font-semibold px-2.5 py-1.5 rounded-lg">{a === "loading" ? "Analyzing…" : "🔎 Run the numbers"}</button>
                </div>
              </div>

              {a && a !== "loading" && (
                <div className="mt-2 text-[11px] rounded-lg px-2.5 py-1.5 border bg-gray-950/60 border-gray-800 text-gray-300">
                  {a === "failed"
                    ? "Couldn't value this address automatically — try Real Estate → Check an address."
                    : <>Est. value <b className="text-white">${Math.round(a.value).toLocaleString()}</b> · Max offer (MAO) <b className="text-amber-300">${Math.round(a.mao).toLocaleString()}</b> · Potential profit <b className="text-emerald-300">${Math.round(a.profit).toLocaleString()}</b>{a.verdict ? <> · <b className="text-sky-300">{a.verdict}</b></> : null}</>}
                </div>
              )}

              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {STATUSES.map((st) => (
                  <button key={st.id} onClick={() => setStatus(s.id, st.id)}
                    className={`text-[10px] font-semibold px-2 py-1 rounded-full border transition-colors ${s.status === st.id ? st.cls : "bg-gray-900 border-gray-800 text-gray-500 hover:text-gray-300"}`}>
                    {st.label}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
