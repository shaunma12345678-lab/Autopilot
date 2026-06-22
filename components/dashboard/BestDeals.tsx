"use client"

// Best Deals on the Market — the unified elite feed. Scans an area and ranks
// every property by the all-signals Best-Deal score, surfacing the very best
// deals (flip, BRRRR, fixer, wholesale) first with the exact edges that make
// each one elite.

import { useState } from "react"
import { bestDealScore, type BestDeal } from "@/lib/best-deals"
import { fmtMoney } from "@/lib/deal-analysis"
import { openDealSheet } from "@/lib/deal-sheet"
import { enrichLeadClient, enrichMany } from "@/lib/enrich-client"
import type { ForeclosureLead } from "@/lib/agents/foreclosure-agent"

type Mode = "city" | "county" | "zip"
const MODES: { id: Mode; label: string }[] = [
  { id: "city", label: "🏙 City" }, { id: "county", label: "🗺 County" }, { id: "zip", label: "📮 ZIP" },
]
const TIER: Record<string, { label: string; cls: string }> = {
  elite:  { label: "💎 ELITE",  cls: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/40" },
  strong: { label: "🔥 STRONG", cls: "bg-amber-500/15 text-amber-300 border-amber-500/40" },
  solid:  { label: "SOLID",     cls: "bg-slate-500/15 text-slate-300 border-slate-500/40" },
}
const VERDICT_CLR: Record<string, string> = { Pursue: "text-emerald-300", Negotiate: "text-amber-300", Underwrite: "text-indigo-300", Pass: "text-red-300" }
const m = (n: number | null | undefined) => (typeof n === "number" && Number.isFinite(n) ? fmtMoney(n) : "—")

export default function BestDeals({ password }: { password: string }) {
  const [mode, setMode]   = useState<Mode>("city")
  const [city, setCity]   = useState("")
  const [county, setCounty] = useState("")
  const [state, setState] = useState("")
  const [zip, setZip]     = useState("")
  const [depth, setDepth] = useState(300)
  const [eliteOnly, setEliteOnly] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deals, setDeals] = useState<BestDeal[] | null>(null)
  const [meta, setMeta]   = useState<{ scanned: number; eliteCount: number; area: string; exactCount: number; fellBack: boolean; searchType: Mode; medianValue: number | null } | null>(null)
  const [effDepth, setEffDepth] = useState(300)
  const [effLimit, setEffLimit] = useState(60)
  const [enriching, setEnriching] = useState<Set<string>>(new Set())
  const [enrichedKeys, setEnrichedKeys] = useState<Set<string>>(new Set())
  const [autoEnriching, setAutoEnriching] = useState(false)

  // Merge an enrichment patch into a deal's lead and re-score it live.
  const applyPatch = (medianValue: number | null) => (lead: ForeclosureLead, patch: Partial<ForeclosureLead>) => {
    const merged = { ...lead, ...patch }
    const rescored = bestDealScore(merged, { fallbackValue: medianValue ?? undefined })
    setDeals((prev) => prev ? prev.map((x) => x.lead.address === lead.address ? (rescored ?? { ...x, lead: merged }) : x) : prev)
    setEnrichedKeys((prev) => new Set(prev).add(lead.address))
  }

  // Manually (re-)enrich one deal.
  const enrichOne = async (lead: ForeclosureLead) => {
    setEnriching((p) => new Set(p).add(lead.address))
    const r = await enrichLeadClient(lead, password)
    if (r) applyPatch(meta?.medianValue ?? null)(lead, r.patch)
    setEnriching((p) => { const n = new Set(p); n.delete(lead.address); return n })
  }

  // Enrich all currently-shown deals (with bounded concurrency).
  const enrichAll = async (list: BestDeal[], medianValue: number | null) => {
    setAutoEnriching(true)
    const leads = list.map((d) => d.lead)
    setEnriching(new Set(leads.map((l) => l.address)))
    await enrichMany(leads, password, applyPatch(medianValue), 3)
    setEnriching(new Set())
    setAutoEnriching(false)
  }

  const search = async (opts?: { depth?: number; limit?: number; more?: boolean }) => {
    if (mode === "city" && !city.trim())   { setError("Enter a city."); return }
    if (mode === "county" && !county.trim()) { setError("Enter a county."); return }
    if (mode === "zip" && !zip.trim())     { setError("Enter a ZIP code."); return }
    const dp = opts?.depth ?? depth
    const l = opts?.limit ?? 60
    if (opts?.more) setLoadingMore(true); else setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/leads/best-deals", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify({ searchType: mode, city: city.trim(), county: county.trim(), state: state.trim(), zip: zip.trim(), depth: dp, limit: l, minScore: eliteOnly ? 75 : 0 }),
      })
      const data = await res.json()
      if (data?.error) { setError(data.error); if (!opts?.more) setDeals(null) }
      else {
        const list = (data.deals ?? []) as BestDeal[]
        const mv = (data.medianValue ?? null) as number | null
        setDeals(list)
        setMeta({ scanned: data.scanned ?? 0, eliteCount: data.eliteCount ?? 0, area: data.area ?? "", exactCount: data.exactCount ?? 0, fellBack: !!data.fellBack, searchType: data.searchType ?? mode, medianValue: mv })
        setEffDepth(dp); setEffLimit(l); setEnrichedKeys(new Set())
        // Auto-enrich the top finds in the background so the numbers fill in live.
        void enrichAll(list.slice(0, 12), mv)
      }
    } catch { setError("Search failed — try again."); if (!opts?.more) setDeals(null) }
    setLoading(false); setLoadingMore(false)
  }
  const loadMore = () => search({ depth: Math.min(effDepth * 2, 1000), limit: Math.min(effLimit + 60, 200), more: true })

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-bold text-white">💎 Best Deals on the Market</h3>
        <p className="text-sm text-gray-400 mt-0.5">One elite ranking that fuses every signal — profit margin, BRRRR capital recovery, equity, seller motivation, hidden-gem corroboration, and predictive pre-foreclosure — so the very best deals rise to the top.</p>
      </div>

      <div className="bg-gray-900/60 border border-gray-700/40 rounded-2xl p-4 space-y-3">
        <div className="flex gap-1.5">
          {MODES.map((md) => (
            <button key={md.id} onClick={() => setMode(md.id)} className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${mode === md.id ? "bg-indigo-600 border-indigo-400 text-white" : "bg-gray-800/40 border-gray-700/50 text-gray-400 hover:text-white"}`}>{md.label}</button>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {mode === "city" && <input value={city} onChange={(e) => setCity(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} placeholder="City (e.g. Kansas City)" className="bg-gray-800/60 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 sm:col-span-2" />}
          {mode === "county" && <input value={county} onChange={(e) => setCounty(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} placeholder="County (e.g. Marion)" className="bg-gray-800/60 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 sm:col-span-2" />}
          {mode === "zip" && <input value={zip} onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 5))} onKeyDown={(e) => e.key === "Enter" && search()} placeholder="ZIP (e.g. 64050)" className="bg-gray-800/60 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 sm:col-span-2" />}
          <input value={state} onChange={(e) => setState(e.target.value.toUpperCase().slice(0, 2))} onKeyDown={(e) => e.key === "Enter" && search()} placeholder="State (e.g. MO)" className="bg-gray-800/60 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500" />
        </div>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <select value={depth} onChange={(e) => setDepth(Number(e.target.value))} className="bg-gray-800/60 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-white">
              <option value={200}>Scan 200</option>
              <option value={300}>Scan 300</option>
              <option value={500}>Scan 500 (deep)</option>
              <option value={1000}>Scan 1000 (max)</option>
            </select>
            <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
              <input type="checkbox" checked={eliteOnly} onChange={(e) => setEliteOnly(e.target.checked)} className="accent-fuchsia-500" /> 💎 Elite only (75+)
            </label>
          </div>
          <button onClick={() => search()} disabled={loading} className="text-sm font-semibold px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white">
            {loading ? "Scanning…" : "💎 Find best deals"}
          </button>
        </div>
        {error && <p className="text-xs text-red-300">{error}</p>}
      </div>

      {meta && deals && (
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-xs text-gray-500">
            {deals.length} ranked in <span className="text-gray-300 font-semibold">{meta.area}</span> · {meta.eliteCount} elite · {meta.scanned} scanned
            {meta.searchType !== "zip" && !meta.fellBack && <span className="text-emerald-400"> · {meta.exactCount} confirmed in-area</span>}
            {meta.fellBack && <span className="text-amber-400"> · none confirmed in-area this scan — showing nearest</span>}
            {autoEnriching && <span className="text-indigo-300"> · ✨ enriching top deals…</span>}
          </p>
          {deals.length > 0 && (
            <button onClick={() => enrichAll(deals, meta.medianValue)} disabled={autoEnriching} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-emerald-500/40 bg-emerald-600/15 hover:bg-emerald-600/30 text-emerald-200 disabled:opacity-50">
              {autoEnriching ? "Enriching…" : "✨ Enrich all shown"}
            </button>
          )}
        </div>
      )}

      {deals && deals.length === 0 && !loading && <p className="text-sm text-gray-400">No deals cleared the bar here — try a larger scan, County mode, or turn off Elite-only.</p>}

      <div className="space-y-3">
        {(deals ?? []).map((d, i) => {
          const dl = d.deal, t = TIER[d.tier] ?? TIER.solid
          return (
            <div key={`${d.lead.address}-${i}`} className="bg-gray-900/60 border border-gray-700/40 rounded-2xl p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white truncate">{d.lead.address || "Address pending"}</p>
                  <p className="text-xs text-gray-500">{[d.lead.city, d.lead.state, d.lead.zip].filter(Boolean).join(", ")}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] font-bold text-indigo-300">Score {d.score}/100</span>
                  <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded border ${t.cls}`}>{t.label}</span>
                </div>
              </div>

              <p className={`text-xs font-semibold mt-1.5 ${VERDICT_CLR[dl.verdict.call] ?? "text-gray-300"}`}>{dl.verdict.call} — <span className="font-normal text-gray-400">{dl.verdict.reason}</span></p>
              {d.sell && d.sell.score >= 30 && (
                <p className="text-[11px] mt-1 text-rose-300">🎯 Likely to sell: <b>{d.sell.score}%</b> ({d.sell.band}, {d.sell.timeframe})</p>
              )}

              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mt-3">
                {[
                  ["ARV", m(dl.arv)],
                  ["Max Offer", dl.maoDetail ? m(dl.maoDetail.mao) : m(dl.mao)],
                  ["Profit", m(dl.flipProfit)],
                  ["Equity", dl.equityPercent ? `${dl.equityPercent}%` : "—"],
                  ["BRRRR cash left", dl.brrrr ? m(dl.brrrr.cashLeftInDeal) : "—"],
                ].map(([k, v]) => (
                  <div key={k} className="bg-gray-800/50 border border-gray-700/40 rounded-lg px-2.5 py-1.5">
                    <p className="text-[9px] text-gray-500 uppercase tracking-wide">{k}</p>
                    <p className="text-sm font-bold text-white mt-0.5">{v}</p>
                  </div>
                ))}
              </div>

              {d.reasons.length > 0 && (
                <ul className="mt-2.5 space-y-0.5">
                  {d.reasons.map((r, j) => <li key={j} className="text-[11px] text-gray-300">✓ {r}</li>)}
                </ul>
              )}

              <div className="flex items-center gap-3 mt-3">
                <button onClick={() => openDealSheet(d.lead)} className="text-xs font-semibold text-emerald-400 hover:text-emerald-300">📄 Deal Sheet (BRRRR + outreach)</button>
                <button onClick={() => enrichOne(d.lead)} disabled={enriching.has(d.lead.address)} className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 disabled:opacity-50">
                  {enriching.has(d.lead.address) ? "✨ Enriching…" : enrichedKeys.has(d.lead.address) ? "↻ Re-enrich" : "✨ Enrich"}
                </button>
                {d.lead.ownerName && <span className="text-[11px] text-gray-500">👤 {d.lead.ownerName}{d.lead.phone ? ` · 📞 ${d.lead.phone}` : ""}</span>}
              </div>
            </div>
          )
        })}
      </div>

      {deals && deals.length > 0 && deals.length >= effLimit && effLimit < 200 && (
        <button onClick={loadMore} disabled={loadingMore} className="w-full text-sm font-semibold py-2.5 rounded-xl border border-indigo-500/40 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-200 disabled:opacity-50">
          {loadingMore ? "Searching deeper…" : `↓ Load more — search deeper (${effLimit} → ${Math.min(effLimit + 60, 200)})`}
        </button>
      )}
    </div>
  )
}
