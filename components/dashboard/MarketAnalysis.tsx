"use client"

// Market Analysis section — a ranked Top-20 markets list + an Upcoming Cities
// list. Click any city for an in-depth, live deep-search analysis: ROI for
// flips and short / mid / long-term rentals, the "best for" verdict, and the
// market stats — all computed from our own data.

import { useState } from "react"
import { analyzeMarket, scoreStrategies, type MarketReport, type MarketStrategies, type StrategyScore } from "@/lib/market-analysis"
import { TOP_MARKETS, UPCOMING_MARKETS, type Market } from "@/lib/markets-data"
import type { ForeclosureLead } from "@/lib/agents/foreclosure-agent"

const GRADE_CLR: Record<string, string> = {
  A: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  B: "bg-lime-500/20 text-lime-300 border-lime-500/40",
  C: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40",
  D: "bg-orange-500/20 text-orange-300 border-orange-500/40",
  F: "bg-red-500/20 text-red-300 border-red-500/40",
}
const TAG_CLR: Record<string, string> = {
  "cash flow":    "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  "appreciation": "bg-sky-500/15 text-sky-300 border-sky-500/30",
  "balanced":     "bg-violet-500/15 text-violet-300 border-violet-500/30",
}

function StrategyCard({ title, emoji, s }: { title: string; emoji: string; s: StrategyScore }) {
  return (
    <div className="bg-gray-900/60 border border-gray-700/40 rounded-xl p-3.5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-white">{emoji} {title}</p>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-lg border ${GRADE_CLR[s.grade] ?? GRADE_CLR.C}`}>{s.grade} · {s.score}</span>
      </div>
      <p className="text-[12px] font-semibold text-emerald-300 mt-1.5">{s.roi}</p>
      <p className="text-[11px] text-gray-400 mt-0.5">{s.verdict}{s.estimated ? " (est.)" : ""}</p>
      <ul className="mt-1 space-y-0.5">
        {s.reasons.map((r, i) => <li key={i} className="text-[11px] text-gray-500 flex gap-1.5"><span className="text-indigo-400 shrink-0">·</span>{r}</li>)}
      </ul>
    </div>
  )
}

function MarketCard({ m, rank, onClick, busy }: { m: Market; rank?: number; onClick: () => void; busy: boolean }) {
  return (
    <button onClick={onClick} disabled={busy} className="text-left bg-gray-900/60 border border-gray-700/40 rounded-xl p-3 hover:border-indigo-500/50 hover:bg-gray-800/40 transition-all disabled:opacity-50">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-white truncate">{rank != null && <span className="text-gray-600 mr-1">#{rank}</span>}{m.city}, {m.state}</p>
        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${TAG_CLR[m.tag]}`}>{m.tag}</span>
      </div>
      <p className="text-[11px] text-gray-500 mt-1 line-clamp-2">{m.why}</p>
      <p className="text-[10px] text-indigo-400 font-semibold mt-1.5">Analyze →</p>
    </button>
  )
}

export default function MarketAnalysis({ password }: { password: string }) {
  const [loading, setLoading] = useState<string | null>(null)   // city being analyzed
  const [error, setError]     = useState<string | null>(null)
  const [report, setReport]   = useState<{ m: Market | { city: string; state: string }; market: MarketReport; strat: MarketStrategies } | null>(null)
  const [manual, setManual]   = useState("")

  const analyze = async (m: Market | { city: string; state: string }) => {
    if (!m.city.trim()) return
    setLoading(m.city); setError(null)
    try {
      const res = await fetch("/api/leads/deep-search", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify({ searchType: "city", city: m.city.trim(), state: (m.state || "").trim(), maxLeads: 200 }),
      })
      const data = await res.json()
      const leads: ForeclosureLead[] = data.leads ?? []
      if (!leads.length) { setError(`No data for ${m.city} yet — run it again; the cache fills over time.`); }
      else { const market = analyzeMarket(leads); setReport({ m, market, strat: scoreStrategies(market) }) }
    } catch { setError("Analysis failed — try again.") }
    setLoading(null)
  }

  // ── Detail view ──────────────────────────────────────────────────────────
  if (report) {
    const { m, market, strat } = report
    return (
      <div className="space-y-4">
        <button onClick={() => setReport(null)} className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold">← Back to markets</button>
        <div className="bg-gradient-to-r from-indigo-950/50 to-violet-950/40 border border-indigo-500/25 rounded-2xl p-5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h4 className="text-xl font-bold text-white">{m.city}{m.state ? `, ${m.state}` : ""}</h4>
            <span className="text-sm font-semibold text-indigo-200">🏆 Best for: {strat.bestFor}</span>
          </div>
          {"why" in m && <p className="text-[12px] text-gray-400 mt-1">{(m as Market).why}</p>}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
            {[
              ["Median value", market.medianValue ? `$${Math.round(market.medianValue / 1000)}k` : "—"],
              ["Rent (LTR)", market.medianRent ? `$${market.medianRent}/mo` : "—"],
              ["Cap rate", market.capRate != null ? `${market.capRate}%` : "—"],
              ["Distress", `${market.distressRate}%`],
              ["Avg equity", market.avgEquity != null ? `${market.avgEquity}%` : "—"],
              ["At-risk", `${market.predictedRate}%`],
              ["🔥 Gems", String(market.gemCount)],
              ["Analyzed", String(market.n)],
            ].map(([kk, v]) => (
              <div key={kk} className="bg-gray-900/50 border border-gray-700/40 rounded-lg px-2.5 py-2">
                <p className="text-[10px] text-gray-500 uppercase tracking-wide">{kk}</p>
                <p className="text-sm font-bold text-white mt-0.5">{v}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <StrategyCard title="Buy & Flip"          emoji="🔨" s={strat.flip} />
          <StrategyCard title="Short-term rental"   emoji="🏖" s={strat.shortRental} />
          <StrategyCard title="Mid-term rental"     emoji="🛏" s={strat.midRental} />
          <StrategyCard title="Long-term rental"    emoji="🏘" s={strat.longRental} />
        </div>
        {market.insights.length > 0 && (
          <div className="bg-gray-900/60 border border-gray-700/40 rounded-2xl p-4">
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Why this market scores this way</p>
            <ul className="space-y-0.5">{market.insights.map((s, i) => <li key={i} className="text-[11px] text-gray-300 flex gap-2"><span className="text-indigo-400 shrink-0">▸</span>{s}</li>)}</ul>
          </div>
        )}
        <p className="text-[10px] text-gray-600">Flip &amp; long-term-rental use live deal data; short/mid-term are modeled estimates (add an STR-data key for real Airbnb demand).</p>
      </div>
    )
  }

  // ── List view ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <div className="bg-gray-900/60 border border-gray-700/40 rounded-2xl p-5 space-y-3">
        <div>
          <h3 className="text-base font-semibold text-white">📈 Market Analysis</h3>
          <p className="text-xs text-gray-500 mt-0.5">Click a market for an in-depth, live ROI breakdown — flips and short / mid / long-term rentals — with the reasons why.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input value={manual} onChange={e => setManual(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && manual.trim()) { const [c, s] = manual.split(","); analyze({ city: (c ?? "").trim(), state: (s ?? "").trim() }) } }} placeholder="Analyze any city — e.g. Austin, TX" className="flex-1 min-w-[200px] bg-gray-800/60 border border-gray-700/50 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500/70" />
          <button onClick={() => { const [c, s] = manual.split(","); if (c?.trim()) analyze({ city: c.trim(), state: (s ?? "").trim() }) }} disabled={!!loading} className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold rounded-xl">Analyze</button>
        </div>
        {error && <p className="text-xs text-amber-300">{error}</p>}
        {loading && <p className="text-xs text-indigo-300 flex items-center gap-2"><span className="w-3.5 h-3.5 border-2 border-gray-600 border-t-indigo-400 rounded-full animate-spin" />Deep-searching &amp; analyzing {loading}…</p>}
      </div>

      <div>
        <h4 className="text-sm font-semibold text-white mb-2">🏆 Top 20 Markets</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {TOP_MARKETS.map((m, i) => <MarketCard key={m.city} m={m} rank={i + 1} onClick={() => analyze(m)} busy={!!loading} />)}
        </div>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-white mb-2">🌱 Upcoming Cities <span className="text-[11px] font-normal text-gray-500">— lower cost, high potential</span></h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {UPCOMING_MARKETS.map((m) => <MarketCard key={m.city} m={m} onClick={() => analyze(m)} busy={!!loading} />)}
        </div>
      </div>
    </div>
  )
}
