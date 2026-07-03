"use client"

// Deal Pipeline + Relationship Engine — the daily workflow. Every deal moves
// through stages, every interaction is logged, follow-ups are surfaced, and the
// engine coaches your next move. Persisted in localStorage (reliable, offline,
// no backend to fail).

import { useState, useMemo } from "react"
import { STAGES, STAGE_CLR, coachDeal, followUpState, newDeal, type PipelineDeal, type Stage, type InteractionType } from "@/lib/pipeline"

const KEY = "dp_pipeline_v1"
const load = (): PipelineDeal[] => { if (typeof window === "undefined") return []; try { const r = localStorage.getItem(KEY); return r ? JSON.parse(r) : [] } catch { return [] } }

const IX: { type: InteractionType; label: string }[] = [
  { type: "call", label: "📞 Call" }, { type: "text", label: "💬 Text" }, { type: "email", label: "✉ Email" }, { type: "note", label: "📝 Note" },
]

export default function Pipeline() {
  const [deals, setDeals] = useState<PipelineDeal[]>(load)
  const [addr, setAddr]   = useState("")
  const [owner, setOwner] = useState("")
  const [filter, setFilter] = useState<Stage | "all">("all")
  const [logText, setLogText] = useState<Record<string, string>>({})
  const [open, setOpen]   = useState<string | null>(null)

  const persist = (next: PipelineDeal[]) => { setDeals(next); try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* ignore */ } }
  const update = (id: string, patch: Partial<PipelineDeal>) => persist(deals.map((d) => d.id === id ? { ...d, ...patch } : d))
  const remove = (id: string) => persist(deals.filter((d) => d.id !== id))
  const add = () => { if (!addr.trim()) return; persist([newDeal({ address: addr.trim(), owner: owner.trim() || undefined }), ...deals]); setAddr(""); setOwner("") }
  const logInteraction = (id: string, type: InteractionType) => {
    const text = (logText[id] ?? "").trim(); if (!text) return
    const d = deals.find((x) => x.id === id); if (!d) return
    const stage = d.stage === "New" ? "Contacted" as Stage : d.stage
    update(id, { interactions: [...d.interactions, { at: new Date().toISOString(), type, text }], stage })
    setLogText((p) => ({ ...p, [id]: "" }))
  }

  const dueList = useMemo(() => deals.filter((d) => { const s = followUpState(d); return s === "overdue" || s === "today" }), [deals])
  const counts = useMemo(() => { const c: Record<string, number> = {}; for (const d of deals) c[d.stage] = (c[d.stage] ?? 0) + 1; return c }, [deals])
  const shown = filter === "all" ? deals : deals.filter((d) => d.stage === filter)

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-bold text-white">📋 Pipeline & Relationship Engine</h3>
        <p className="text-sm text-gray-400 mt-0.5">Your daily workflow — move every deal through stages, log every seller conversation, never miss a follow-up. The engine coaches your next move so deals stop leaking.</p>
      </div>

      {/* Follow-ups due */}
      {dueList.length > 0 && (
        <div className="bg-amber-950/20 border border-amber-500/30 rounded-2xl p-4">
          <p className="text-sm font-bold text-amber-200 mb-2">🔔 Follow-ups due ({dueList.length})</p>
          <div className="space-y-1.5">
            {dueList.map((d) => (
              <div key={d.id} className="flex items-center justify-between text-xs">
                <span className="text-amber-100">{d.address}{d.owner ? ` · ${d.owner}` : ""}</span>
                <span className={followUpState(d) === "overdue" ? "text-red-300" : "text-amber-300"}>{followUpState(d) === "overdue" ? "overdue" : "today"} — {coachDeal(d)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add */}
      <div className="bg-gray-900/60 border border-gray-700/40 rounded-2xl p-4">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          <input value={addr} onChange={(e) => setAddr(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="Property address" className="bg-gray-800/60 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 sm:col-span-2" />
          <input value={owner} onChange={(e) => setOwner(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="Owner (optional)" className="bg-gray-800/60 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500" />
          <button onClick={add} className="text-sm font-semibold px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white">+ Add deal</button>
        </div>
      </div>

      {/* Stage filter */}
      <div className="flex flex-wrap gap-1.5">
        <button onClick={() => setFilter("all")} className={`text-xs font-semibold px-2.5 py-1 rounded-lg border ${filter === "all" ? "bg-indigo-600 border-indigo-400 text-white" : "bg-gray-800/40 border-gray-700/50 text-gray-400"}`}>All ({deals.length})</button>
        {STAGES.map((s) => (
          <button key={s} onClick={() => setFilter(s)} className={`text-xs font-semibold px-2.5 py-1 rounded-lg border ${filter === s ? "bg-indigo-600 border-indigo-400 text-white" : "bg-gray-800/40 border-gray-700/50 text-gray-400"}`}>{s} ({counts[s] ?? 0})</button>
        ))}
      </div>

      {deals.length === 0 && <p className="text-sm text-gray-500">No deals yet — add one above, or send deals here from Best Deals / Distress Index.</p>}

      {/* Deals */}
      <div className="space-y-2">
        {shown.map((d) => (
          <div key={d.id} className="bg-gray-900/60 border border-gray-700/40 rounded-xl p-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="text-sm font-bold text-white truncate">{d.address}</p>
                <p className="text-xs text-gray-500">{d.owner ? `👤 ${d.owner}` : "owner unknown"}{d.phone ? ` · 📞 ${d.phone}` : ""}</p>
              </div>
              <select value={d.stage} onChange={(e) => update(d.id, { stage: e.target.value as Stage })} className={`text-xs font-bold rounded-lg border px-2 py-1 ${STAGE_CLR[d.stage]}`}>
                {STAGES.map((s) => <option key={s} value={s} className="bg-gray-900 text-white">{s}</option>)}
              </select>
            </div>

            <p className="text-[11px] text-indigo-300 mt-1.5">🧠 {coachDeal(d)}</p>

            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <input value={logText[d.id] ?? ""} onChange={(e) => setLogText((p) => ({ ...p, [d.id]: e.target.value }))} placeholder="Log what happened / what they said…" className="flex-1 min-w-[160px] bg-gray-800/60 border border-gray-700/50 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-500" />
              {IX.map((x) => <button key={x.type} onClick={() => logInteraction(d.id, x.type)} className="text-xs font-semibold px-2 py-1.5 rounded-lg bg-gray-800/60 border border-gray-700/50 text-gray-300 hover:text-white">{x.label}</button>)}
            </div>

            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <label className="text-[11px] text-gray-400 flex items-center gap-1.5">Follow up
                <input type="date" value={d.nextFollowUp ?? ""} onChange={(e) => update(d.id, { nextFollowUp: e.target.value || undefined })} className="bg-gray-800/60 border border-gray-700/50 rounded px-2 py-1 text-xs text-white" />
              </label>
              {d.interactions.length > 0 && <button onClick={() => setOpen(open === d.id ? null : d.id)} className="text-[11px] font-semibold text-indigo-400 hover:text-indigo-300">{open === d.id ? "▲ Hide history" : `▼ History (${d.interactions.length})`}</button>}
              <button onClick={() => remove(d.id)} className="text-[11px] text-gray-600 hover:text-red-300 ml-auto">Delete</button>
            </div>

            {open === d.id && (
              <div className="mt-2 space-y-1 border-t border-gray-700/40 pt-2">
                {[...d.interactions].reverse().map((it, j) => (
                  <p key={j} className="text-[11px] text-gray-400"><span className="text-gray-500">{new Date(it.at).toLocaleDateString()} · {it.type}</span> — {it.text}</p>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
