"use client"

// Distress Index — our own keyless index of motivated sellers BEYOND foreclosure
// (code violations, vacant/abandoned registries, …) pulled straight from county
// open data. Browse a city, enrich + bulk-mail the owners. Coverage grows one
// city/vector at a time.

import { useState } from "react"
import type { ForeclosureLead } from "@/lib/agents/foreclosure-agent"
import { openDealSheet } from "@/lib/deal-sheet"
import { enrichLeadClient, enrichMany } from "@/lib/enrich-client"
import { openMailMerge, downloadMailCsv } from "@/lib/mail-merge"

export default function DistressIndex({ password }: { password: string }) {
  const [mode, setMode]   = useState<"city" | "zip">("city")
  const [city, setCity]   = useState("")
  const [zip, setZip]     = useState("")
  const [stateAbbr, setStateAbbr] = useState("")
  const [limit, setLimit] = useState(200)
  const [loading, setLoading] = useState(false)
  const [enrichingAll, setEnrichingAll] = useState(false)
  const [enriching, setEnriching] = useState<Set<string>>(new Set())
  const [leads, setLeads] = useState<ForeclosureLead[] | null>(null)
  const [vectors, setVectors] = useState<string[]>([])
  const [note, setNote]   = useState<string | null>(null)

  const headers = { "Content-Type": "application/json", "x-admin-password": password }

  const search = async () => {
    if (!stateAbbr.trim()) { setNote("Enter a state."); return }
    if (mode === "city" && !city.trim()) { setNote("Enter a city."); return }
    if (mode === "zip" && !zip.trim()) { setNote("Enter a ZIP code."); return }
    setLoading(true); setNote(null); setLeads(null)
    try {
      const res = await fetch("/api/leads/distress", { method: "POST", headers, body: JSON.stringify({ city: mode === "city" ? city.trim() : "", zip: mode === "zip" ? zip.trim() : "", state: stateAbbr.trim(), limit }) })
      const data = await res.json()
      if (data?.error) { setNote(data.error); return }
      setVectors(data.vectors ?? [])
      setLeads(data.leads ?? [])
      if (data.note) setNote(data.note)
    } catch { setNote("Search failed — try again.") }
    setLoading(false)
  }

  const applyPatch = (lead: ForeclosureLead, patch: Partial<ForeclosureLead>) =>
    setLeads((prev) => prev ? prev.map((l) => l.address === lead.address ? { ...l, ...patch } : l) : prev)
  const enrichOne = async (lead: ForeclosureLead) => {
    setEnriching((p) => new Set(p).add(lead.address))
    const r = await enrichLeadClient(lead, password)
    if (r) applyPatch(lead, r.patch)
    setEnriching((p) => { const n = new Set(p); n.delete(lead.address); return n })
  }
  const enrichAll = async () => {
    if (!leads) return
    setEnrichingAll(true)
    await enrichMany(leads.slice(0, 40), password, applyPatch, 4)
    setEnrichingAll(false)
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-bold text-white">🚨 Distress Index</h3>
        <p className="text-sm text-gray-400 mt-0.5">Our own keyless index of motivated sellers <b>beyond foreclosure</b> — code violations, vacant/abandoned registries, and more, pulled straight from county open data. Enrich the owners and bulk-mail them.</p>
      </div>

      <div className="bg-gray-900/60 border border-gray-700/40 rounded-2xl p-4 space-y-3">
        <div className="flex gap-1.5">
          {(["city", "zip"] as const).map((md) => (
            <button key={md} onClick={() => setMode(md)} className={`text-xs font-semibold px-3 py-1.5 rounded-lg border ${mode === md ? "bg-indigo-600 border-indigo-400 text-white" : "bg-gray-800/40 border-gray-700/50 text-gray-400 hover:text-white"}`}>{md === "city" ? "🏙 City" : "📮 ZIP"}</button>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          {mode === "city"
            ? <input value={city} onChange={(e) => setCity(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} placeholder="City (e.g. Chicago)" className="bg-gray-800/60 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 sm:col-span-2" />
            : <input value={zip} onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 5))} onKeyDown={(e) => e.key === "Enter" && search()} placeholder="ZIP (e.g. 60617)" className="bg-gray-800/60 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 sm:col-span-2" />}
          <input value={stateAbbr} onChange={(e) => setStateAbbr(e.target.value.toUpperCase().slice(0, 2))} onKeyDown={(e) => e.key === "Enter" && search()} placeholder="State (e.g. IL)" className="bg-gray-800/60 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500" />
          <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="bg-gray-800/60 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-white">
            {[100, 200, 300, 500].map((v) => <option key={v} value={v}>{v} leads</option>)}
          </select>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-gray-600">Live: Chicago, IL (code violations + vacant registry). More cities/counties added one at a time.</p>
          <button onClick={search} disabled={loading} className="text-sm font-semibold px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white">{loading ? "Searching…" : "🚨 Find motivated sellers"}</button>
        </div>
      </div>

      {note && <p className="text-xs text-amber-300">{note}</p>}

      {leads && leads.length > 0 && (
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-xs text-gray-500">{leads.length} motivated sellers · vectors: <span className="text-gray-300">{vectors.join(", ")}</span></p>
          <div className="flex items-center gap-2">
            <button onClick={enrichAll} disabled={enrichingAll} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-emerald-500/40 bg-emerald-600/15 hover:bg-emerald-600/30 text-emerald-200 disabled:opacity-50">{enrichingAll ? "Enriching…" : "✨ Enrich all (owner+facts)"}</button>
            <button onClick={() => openMailMerge(leads)} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-amber-500/40 bg-amber-600/15 hover:bg-amber-600/30 text-amber-200">📬 Mail merge</button>
            <button onClick={() => downloadMailCsv(leads)} className="text-xs font-semibold text-gray-400 hover:text-gray-200">⬇ CSV</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {(leads ?? []).map((l, i) => (
          <div key={`${l.address}-${i}`} className="bg-gray-900/60 border border-gray-700/40 rounded-xl p-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="text-sm font-bold text-white truncate">{l.address}</p>
                <p className="text-xs text-gray-500">{[l.city, l.state, l.zip].filter(Boolean).join(", ")}</p>
              </div>
              {l.occupancy === "vacant" && <span className="text-[10px] font-bold text-red-300 bg-red-950/30 border border-red-500/30 rounded px-1.5 py-0.5 shrink-0">VACANT</span>}
            </div>
            {l.distressSignals && l.distressSignals.length > 0 && <p className="text-[11px] text-amber-200/90 mt-1">🚩 {l.distressSignals[0]}</p>}
            {(l.ownerName || l.sqft) && <p className="text-[11px] text-gray-300 mt-1">{l.ownerName ? `👤 ${l.ownerName}` : ""}{l.mailingAddress ? ` · ✉ ${l.mailingAddress}` : ""}{l.sqft ? ` · ${l.sqft.toLocaleString()} sqft` : ""}</p>}
            <div className="flex items-center gap-3 mt-2">
              <button onClick={() => enrichOne(l)} disabled={enriching.has(l.address)} className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 disabled:opacity-50">{enriching.has(l.address) ? "✨ Enriching…" : "✨ Enrich"}</button>
              <button onClick={() => openDealSheet(l)} className="text-xs font-semibold text-emerald-400 hover:text-emerald-300">📄 Deal Sheet</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
