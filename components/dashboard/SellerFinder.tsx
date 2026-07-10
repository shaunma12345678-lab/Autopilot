"use client"

// 🧲 Seller Finder — AI search for the owners MOST LIKELY TO SELL in an area,
// ranked by sell probability with the exact reasons (probate, divorce, tax
// pressure, vacancy, tenure, equity, rate lock-in). Per-card: reveal the owner
// + mailing address (county records), open the deal sheet, or hand the lead
// straight to the Acquisition Agent to start the outreach sequence.

import { useMemo, useState } from "react"
import type { ForeclosureLead } from "@/lib/agents/foreclosure-agent"
import { enrichLeadClient } from "@/lib/enrich-client"
import { openDealSheet } from "@/lib/deal-sheet"

interface SellerHit {
  lead: ForeclosureLead
  sellScore: number
  band: string
  timeframe: string
  reasons: string[]
  predictedPct: number
}

const BAND_CLS: Record<string, string> = {
  "very high": "bg-rose-600 text-white",
  high: "bg-orange-600 text-white",
  moderate: "bg-amber-600/80 text-white",
  low: "bg-gray-700 text-gray-300",
}

export default function SellerFinder({ password }: { password: string }) {
  const apiHeaders = useMemo(() => ({ "Content-Type": "application/json", "x-admin-password": password }), [password])
  const [mode, setMode] = useState<"city" | "county" | "zip">("city")
  const [city, setCity] = useState("")
  const [county, setCounty] = useState("")
  const [zip, setZip] = useState("")
  const [state, setState] = useState("CA")
  const [depth, setDepth] = useState(250)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hits, setHits] = useState<SellerHit[] | null>(null)
  const [meta, setMeta] = useState<{ area: string; exactCount: number; fellBack: boolean; total: number } | null>(null)
  const [busy, setBusy] = useState<Record<number, string>>({})   // attomId → status label

  const search = async () => {
    if (mode === "city" && !city.trim()) { setError("Enter a city."); return }
    if (mode === "county" && !county.trim()) { setError("Enter a county."); return }
    if (mode === "zip" && !zip.trim()) { setError("Enter a ZIP."); return }
    setLoading(true); setError(null); setHits(null); setMeta(null); setBusy({})
    try {
      const res = await fetch("/api/leads/sellers", {
        method: "POST", headers: apiHeaders,
        body: JSON.stringify({ searchType: mode, city: city.trim(), county: county.trim(), zip: zip.trim(), state: state.trim(), depth }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `Search failed (${res.status})`)
      setHits(data.sellers ?? [])
      setMeta({ area: data.area ?? "", exactCount: data.exactCount ?? 0, fellBack: Boolean(data.fellBack), total: data.total ?? 0 })
    } catch (e) { setError(e instanceof Error ? e.message : "Search failed — try again.") }
    setLoading(false)
  }

  const revealOwner = async (h: SellerHit) => {
    setBusy((b) => ({ ...b, [h.lead.attomId]: "Looking up county records…" }))
    try {
      const r = await enrichLeadClient(h.lead, password)
      if (r?.patch && Object.keys(r.patch).length) {
        setHits((prev) => prev ? prev.map((x) => x.lead.attomId === h.lead.attomId ? { ...x, lead: { ...x.lead, ...r.patch } as ForeclosureLead } : x) : prev)
        setBusy((b) => ({ ...b, [h.lead.attomId]: "✓ Updated from county records" }))
      } else {
        setBusy((b) => ({ ...b, [h.lead.attomId]: "No extra records found for this one" }))
      }
    } catch { setBusy((b) => ({ ...b, [h.lead.attomId]: "Lookup failed — try again" })) }
  }

  const sendToAcquisition = async (h: SellerHit) => {
    setBusy((b) => ({ ...b, [h.lead.attomId]: "Enrolling…" }))
    try {
      const res = await fetch("/api/acquisition", {
        method: "POST", headers: apiHeaders,
        body: JSON.stringify({ action: "enroll", lead: {
          address: h.lead.address, city: h.lead.city, state: h.lead.state, zip: h.lead.zip,
          ownerName: h.lead.ownerName, phone: h.lead.phone, email: h.lead.email,
          score: Math.max(h.lead.score ?? 0, h.sellScore),
        } }),
      })
      const d = await res.json()
      setBusy((b) => ({ ...b, [h.lead.attomId]: d.added ? "✓ In the Acquisition sequence" : "Already enrolled" }))
    } catch { setBusy((b) => ({ ...b, [h.lead.attomId]: "Enroll failed — try again" })) }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-bold text-white">🧲 Seller Finder</h3>
        <p className="text-sm text-gray-400 mt-0.5">Who in this area is most likely to sell soon? The AI weighs life events (probate, divorce), financial pressure, vacancy, tenure, equity, and mortgage rate lock-in — and tells you exactly why each owner made the list.</p>
      </div>

      <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex rounded-lg overflow-hidden border border-gray-700">
            {(["city", "county", "zip"] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)} className={`px-3 py-2 text-xs font-semibold capitalize ${mode === m ? "bg-rose-600 text-white" : "bg-gray-950 text-gray-400 hover:text-gray-200"}`}>{m}</button>
            ))}
          </div>
          {mode === "city" && <input value={city} onChange={(e) => setCity(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void search() }} placeholder="City — e.g. Riverside" className="bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-rose-500 w-48" />}
          {mode === "county" && <input value={county} onChange={(e) => setCounty(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void search() }} placeholder="County — e.g. Riverside" className="bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-rose-500 w-48" />}
          {mode === "zip" && <input value={zip} onChange={(e) => setZip(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void search() }} placeholder="ZIP — e.g. 92501" inputMode="numeric" className="bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-rose-500 w-32" />}
          <input value={state} onChange={(e) => setState(e.target.value.toUpperCase().slice(0, 2))} placeholder="ST" className="bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-rose-500 w-16" />
          <select value={depth} onChange={(e) => setDepth(Number(e.target.value))} className="bg-gray-950 border border-gray-700 rounded-lg px-2 py-2 text-xs text-white focus:outline-none focus:border-rose-500">
            <option value={150}>Quick (150)</option>
            <option value={250}>Standard (250)</option>
            <option value={500}>Deep (500)</option>
            <option value={1000}>Max (1000)</option>
          </select>
          <button onClick={search} disabled={loading} className="bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-sm font-bold px-5 py-2 rounded-lg">{loading ? "Finding sellers…" : "🧲 Find likely sellers"}</button>
        </div>
        {error && <p className="text-xs text-amber-300 mt-2">{error}</p>}
      </div>

      {meta && hits && (
        <p className="text-xs text-gray-500">
          {hits.length} likely sellers in {meta.area} ({meta.exactCount} confirmed in-area · {meta.total} candidates analyzed){meta.fellBack ? " — thin area, showing nearby too" : ""}. Ranked by sell probability.
        </p>
      )}

      {hits && hits.length === 0 && (
        <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-8 text-center text-sm text-gray-500">No likely-seller signals in this area right now — try County mode or a deeper scan.</div>
      )}

      <div className="space-y-2">
        {hits?.map((h) => (
          <div key={h.lead.attomId} className="bg-gray-900/60 border border-gray-800 rounded-xl p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${BAND_CLS[h.band] ?? BAND_CLS.low}`}>{h.sellScore}% · {h.band}</span>
                  <p className="font-semibold text-white text-sm truncate">{h.lead.address}{h.lead.city ? `, ${h.lead.city}` : ""} {h.lead.zip}</p>
                  {h.predictedPct >= 45 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-fuchsia-700/60 text-fuchsia-100" title="Also forecast to reach foreclosure">🔮 {h.predictedPct}%</span>}
                </div>
                <p className="text-[11px] text-gray-500 mt-1">
                  {h.lead.ownerName ? <span className="text-gray-300">{h.lead.ownerName}</span> : "Owner not yet revealed"}
                  {h.lead.mailingAddress ? <span> · 📮 {h.lead.mailingAddress}</span> : null}
                  {h.lead.phone ? <span> · 📞 {h.lead.phone}</span> : null}
                  <span> · likely to sell {h.timeframe}</span>
                </p>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {h.reasons.slice(0, 5).map((r, i) => (
                    <span key={i} className="text-[10px] bg-rose-950/50 border border-rose-800/40 text-rose-200 px-1.5 py-0.5 rounded">{r}</span>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 shrink-0">
                <button onClick={() => revealOwner(h)} className="bg-amber-700/50 hover:bg-amber-600 text-white text-[11px] font-semibold px-2.5 py-1.5 rounded-lg" title="Pull owner name + mailing address + property facts from county records (keyless)">👤 Owner &amp; records</button>
                <button onClick={() => openDealSheet(h.lead)} className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg">📄 Deal sheet</button>
                <button onClick={() => sendToAcquisition(h)} className="bg-emerald-700/60 hover:bg-emerald-600 text-white text-[11px] font-semibold px-2.5 py-1.5 rounded-lg" title="Enroll in the Acquisition Agent's outreach sequence">🚀 Work this lead</button>
              </div>
            </div>
            {busy[h.lead.attomId] && <p className="text-[11px] text-emerald-300/90 mt-2">{busy[h.lead.attomId]}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}
