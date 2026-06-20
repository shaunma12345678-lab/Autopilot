"use client"

// Market Analysis section — analyzes a city/market for investor fit: will it
// perform, and WHY, for flips, long-term rentals, short-term rentals, and
// buy & hold. Computed from our own deep-search data (no external API). The
// tuned markets are one click; any city can be analyzed on demand.

import { useState } from "react"
import { analyzeMarket, scoreStrategies, type MarketReport, type MarketStrategies, type StrategyScore } from "@/lib/market-analysis"
import type { ForeclosureLead } from "@/lib/agents/foreclosure-agent"

const MARKETS = [
  { city: "Los Angeles",   state: "CA" },
  { city: "San Diego",     state: "CA" },
  { city: "San Francisco", state: "CA" },
  { city: "New York",      state: "NY" },
  { city: "Chicago",       state: "IL" },
  { city: "Phoenix",       state: "AZ" },
]

const GRADE_CLR: Record<string, string> = {
  A: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  B: "bg-lime-500/20 text-lime-300 border-lime-500/40",
  C: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40",
  D: "bg-orange-500/20 text-orange-300 border-orange-500/40",
  F: "bg-red-500/20 text-red-300 border-red-500/40",
}

function StrategyCard({ title, emoji, s }: { title: string; emoji: string; s: StrategyScore }) {
  return (
    <div className="bg-gray-900/60 border border-gray-700/40 rounded-xl p-3.5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-white">{emoji} {title}</p>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-lg border ${GRADE_CLR[s.grade] ?? GRADE_CLR.C}`}>{s.grade} · {s.score}</span>
      </div>
      <p className="text-[11px] text-gray-300 mt-1">{s.verdict}{s.estimated ? " (estimate)" : ""}</p>
      <ul className="mt-1.5 space-y-0.5">
        {s.reasons.map((r, i) => <li key={i} className="text-[11px] text-gray-500 flex gap-1.5"><span className="text-indigo-400 shrink-0">·</span>{r}</li>)}
      </ul>
    </div>
  )
}

export default function MarketAnalysis({ password }: { password: string }) {
  const [city, setCity]       = useState("")
  const [state, setState]     = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [report, setReport]   = useState<{ area: string; market: MarketReport; strat: MarketStrategies } | null>(null)

  const analyze = async (c = city, s = state) => {
    if (!c.trim()) { setError("Enter a city."); return }
    setLoading(true); setError(null)
    try {
      const res = await fetch("/api/leads/deep-search", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify({ searchType: "city", city: c.trim(), state: s.trim(), maxLeads: 200 }),
      })
      const data = await res.json()
      const leads: ForeclosureLead[] = data.leads ?? []
      if (!leads.length) { setReport(null); setError("No data for this market yet — try a larger city or run it again (the cache fills over time).") }
      else { const market = analyzeMarket(leads); setReport({ area: `${c.trim()}${s.trim() ? ", " + s.trim() : ""}`, market, strat: scoreStrategies(market) }) }
    } catch { setError("Analysis failed — try again.") }
    setLoading(false)
  }

  const r = report

  return (
    <div className="space-y-5">
      <div className="bg-gray-900/60 border border-gray-700/40 rounded-2xl p-5 space-y-4">
        <div>
          <h3 className="text-base font-semibold text-white">📈 Market Analysis</h3>
          <p className="text-xs text-gray-500 mt-0.5">Will a market perform — and why — for flips, rentals, short-term rentals, and buy &amp; hold. Computed from our own deal data.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input value={city} onChange={e => setCity(e.target.value)} onKeyDown={e => { if (e.key === "Enter") analyze() }} placeholder="City (e.g. Los Angeles)" className="flex-1 min-w-[180px] bg-gray-800/60 border border-gray-700/50 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500/70" />
          <input value={state} onChange={e => setState(e.target.value.toUpperCase().slice(0, 2))} placeholder="ST" maxLength={2} className="w-20 bg-gray-800/60 border border-gray-700/50 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500/70" />
          <button onClick={() => analyze()} disabled={loading} className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold rounded-xl">
            {loading ? "Analyzing…" : "Analyze"}
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span className="text-[11px] text-gray-500 mr-1 self-center">Hot markets:</span>
          {MARKETS.map(m => (
            <button key={m.city} onClick={() => { setCity(m.city); setState(m.state); analyze(m.city, m.state) }} disabled={loading}
              className="text-[11px] font-semibold bg-indigo-700/30 text-indigo-200 border border-indigo-500/40 px-2.5 py-1 rounded-lg hover:bg-indigo-700/50 disabled:opacity-50">
              {m.city}, {m.state}
            </button>
          ))}
        </div>
        {error && <p className="text-xs text-amber-300">{error}</p>}
      </div>

      {loading && !r && (
        <div className="flex items-center justify-center gap-2 py-10 text-gray-400 text-sm">
          <span className="w-4 h-4 border-2 border-gray-600 border-t-indigo-400 rounded-full animate-spin" />
          Deep-searching &amp; analyzing the market…
        </div>
      )}

      {r && (
        <div className="space-y-4">
          <div className="bg-gradient-to-r from-indigo-950/50 to-violet-950/40 border border-indigo-500/25 rounded-2xl p-5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h4 className="text-lg font-bold text-white">{r.area}</h4>
              <span className="text-sm font-semibold text-indigo-200">🏆 Best for: {r.strat.bestFor}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
              {[
                ["Median value", r.market.medianValue ? `$${Math.round(r.market.medianValue / 1000)}k` : "—"],
                ["$/sqft", r.market.psf ? `$${r.market.psf}` : "—"],
                ["Distress density", `${r.market.distressRate}%`],
                ["Rent yield", r.market.rentYield != null ? `${r.market.rentYield}%` : "~est"],
                ["Avg equity", r.market.avgEquity != null ? `${r.market.avgEquity}%` : "—"],
                ["At-risk (pred.)", `${r.market.predictedRate}%`],
                ["🔥 Gems", String(r.market.gemCount)],
                ["Properties", String(r.market.n)],
              ].map(([k, v]) => (
                <div key={k} className="bg-gray-900/50 border border-gray-700/40 rounded-lg px-2.5 py-2">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide">{k}</p>
                  <p className="text-sm font-bold text-white mt-0.5">{v}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <StrategyCard title="Flips"               emoji="🔨" s={r.strat.flip} />
            <StrategyCard title="Long-term rentals"   emoji="🏘" s={r.strat.longRental} />
            <StrategyCard title="Short-term rentals"  emoji="🏖" s={r.strat.shortRental} />
            <StrategyCard title="Buy &amp; hold"      emoji="📈" s={r.strat.buyHold} />
          </div>

          {r.market.insights.length > 0 && (
            <div className="bg-gray-900/60 border border-gray-700/40 rounded-2xl p-4">
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Why</p>
              <ul className="space-y-0.5">
                {r.market.insights.map((s, i) => <li key={i} className="text-[11px] text-gray-300 flex gap-2"><span className="text-indigo-400 shrink-0">▸</span>{s}</li>)}
              </ul>
            </div>
          )}
          <p className="text-[10px] text-gray-600">Flip &amp; rental scores use live deal data; short-term-rental &amp; appreciation are estimates until an STR/market-trend data key is added.</p>
        </div>
      )}
    </div>
  )
}
