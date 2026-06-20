"use client"

// Market Analysis section — a ranked Top-20 markets list + an Upcoming Cities
// list. Click any city for an in-depth, live deep-search analysis: ROI for
// flips and short / mid / long-term rentals, the "best for" verdict, and the
// market stats — all computed from our own data.

import { useState, useEffect, useMemo } from "react"
import type { MarketReport, MarketStrategies, StrategyScore } from "@/lib/market-analysis"
import { TOP_MARKETS, UPCOMING_MARKETS, type Market } from "@/lib/markets-data"
import { opportunityScore } from "@/lib/opportunity"
import { openDealSheet } from "@/lib/deal-sheet"
import { fmtMoney } from "@/lib/deal-analysis"
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

interface Fund { population: number | null; popGrowth5yr: number | null; medianIncome: number | null; povertyRate: number | null; unemploymentRate: number | null; medianHomeValue?: number | null; medianRent?: number | null; vacancyRate?: number | null; priceToIncome?: number | null; grossYield?: number | null; growthFrom?: string; source?: string }
interface CachedEntry { city: string; state: string; report: MarketReport; strat: MarketStrategies; fundamentals?: Fund | null; fundScore?: number | null; fundReasons?: string[]; upside?: number | null; upsideReasons?: string[]; at: string }
const mKey = (c: string, s: string) => `${c.toLowerCase().trim()}:${(s || "").toUpperCase().trim()}`
// Composite rank = current health (fundamentals) 40% + upside/appreciation
// potential 35% + live deal economics 25%, so markets rank by both how good
// they are now AND how much they can still go up. Falls back to deal economics
// when fundamentals haven't been fetched yet.
const composite = (e?: CachedEntry) => {
  if (!e) return -1
  const deal = (e.strat.flip.score + e.strat.longRental.score) / 2
  const hasFund = typeof e.fundScore === "number"
  const hasUp = typeof e.upside === "number"
  if (!hasFund && !hasUp) return Math.round(deal)
  const fund = hasFund ? e.fundScore! : deal
  const up = hasUp ? e.upside! : fund
  return Math.round(fund * 0.4 + up * 0.35 + deal * 0.25)
}
const ago = (iso: string) => { const h = (Date.now() - new Date(iso).getTime()) / 3.6e6; return h < 1 ? "just now" : h < 24 ? `${Math.round(h)}h ago` : `${Math.round(h / 24)}d ago` }

function MarketCard({ m, rank, onClick, busy, entry }: { m: Market; rank?: number; onClick: () => void; busy: boolean; entry?: CachedEntry }) {
  const c = composite(entry)
  return (
    <button onClick={onClick} disabled={busy} className="text-left bg-gray-900/60 border border-gray-700/40 rounded-xl p-3 hover:border-indigo-500/50 hover:bg-gray-800/40 transition-all disabled:opacity-50">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-white truncate">{rank != null && <span className="text-gray-600 mr-1">#{rank}</span>}{m.city}, {m.state}</p>
        {c >= 0 ? <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${GRADE_CLR[c >= 65 ? "A" : c >= 50 ? "C" : "D"]}`}>{c}</span> : <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${TAG_CLR[m.tag]}`}>{m.tag}</span>}
      </div>
      <p className="text-[11px] text-gray-500 mt-1 line-clamp-2">{m.why}</p>
      {entry ? <p className="text-[10px] text-emerald-400 font-semibold mt-1.5">🏆 {entry.strat.bestFor} · updated {ago(entry.at)} →</p> : <p className="text-[10px] text-indigo-400 font-semibold mt-1.5">Analyze →</p>}
    </button>
  )
}

export default function MarketAnalysis({ password }: { password: string }) {
  const [loading, setLoading] = useState<string | null>(null)   // city being analyzed
  const [error, setError]     = useState<string | null>(null)
  const [report, setReport]   = useState<{ m: Market | { city: string; state: string }; market: MarketReport; strat: MarketStrategies; leads: ForeclosureLead[]; depth: number; fund: Fund | null; fundScore: number | null; fundReasons: string[]; upside: number | null; upsideReasons: string[]; fundConfigured: boolean } | null>(null)
  const [manual, setManual]   = useState("")
  const [cached, setCached]   = useState<Record<string, CachedEntry>>({})

  // Load the 24/7-analyzed reports so the lists rank by LIVE data.
  useEffect(() => {
    fetch("/api/cron/markets?read=1", { headers: { "x-admin-password": password } })
      .then(r => r.json()).then(d => { if (d?.reports) setCached(d.reports) }).catch(() => {})
  }, [password])

  const sortByLive = (list: Market[]) => [...list].sort((a, b) => composite(cached[mKey(b.city, b.state)]) - composite(cached[mKey(a.city, a.state)]))
  const topSorted = useMemo(() => sortByLive(TOP_MARKETS), [cached])        // eslint-disable-line react-hooks/exhaustive-deps
  const upSorted  = useMemo(() => sortByLive(UPCOMING_MARKETS), [cached])   // eslint-disable-line react-hooks/exhaustive-deps
  const cachedCount = Object.keys(cached).length

  const analyze = async (m: Market | { city: string; state: string }, depth = 500) => {
    if (!m.city.trim()) return
    setLoading(m.city); setError(null)
    try {
      const res = await fetch("/api/leads/market", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify({ city: m.city.trim(), state: (m.state || "").trim(), depth }),
      })
      const data = await res.json()
      if (data?.error || !data?.report) { setError(data?.error ?? `No data for ${m.city} yet — run it again; the cache fills over time.`) }
      else { setReport({ m, market: data.report, strat: data.strat, leads: data.leads ?? [], depth, fund: data.fundamentals ?? null, fundScore: data.fundScore ?? null, fundReasons: data.fundReasons ?? [], upside: data.upside ?? null, upsideReasons: data.upsideReasons ?? [], fundConfigured: !!data.fundConfigured }) }
    } catch { setError("Analysis failed — try again.") }
    setLoading(null)
  }

  // Top leads in the market, ranked by hidden-gem opportunity.
  const topLeads = (leads: ForeclosureLead[]) =>
    [...leads].sort((a, b) => opportunityScore(b).score - opportunityScore(a).score).slice(0, 20)

  // ── Detail view ──────────────────────────────────────────────────────────
  if (report) {
    const { m, market, strat, leads, depth, fund, fundScore, upside, upsideReasons } = report
    const tl = topLeads(leads)
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <button onClick={() => setReport(null)} className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold">← Back to markets</button>
          <button onClick={() => analyze(m, depth >= 500 ? 1000 : 500)} disabled={!!loading} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-600/80 hover:bg-indigo-500 disabled:opacity-50 text-white border border-indigo-400/40">{loading ? "Searching…" : `🔍 Deeper search (${depth >= 500 ? 1000 : 500})`}</button>
        </div>
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
        {/* Real market fundamentals — our own keyless engine (Census ACS + Wikidata) */}
        {fund && (
          <div className="bg-emerald-950/20 border border-emerald-500/25 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-emerald-200">📊 Market Fundamentals <span className="text-[10px] font-normal text-gray-500">· real public data ({fund.source ?? "Census ACS · Wikidata"})</span></p>
              <div className="flex items-center gap-2">
                {fundScore != null && <span className="text-xs font-bold text-emerald-300">Health {fundScore}/100</span>}
                {upside != null && <span className="text-xs font-bold text-amber-300" title={upsideReasons.join(" · ")}>↑ Upside {upside}/100</span>}
              </div>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {[
                ["Population", fund.population != null ? fund.population.toLocaleString() : "—"],
                ["Pop growth", fund.popGrowth5yr != null ? `${fund.popGrowth5yr > 0 ? "+" : ""}${fund.popGrowth5yr}%` : "—"],
                ["Median income", fund.medianIncome != null ? `$${Math.round(fund.medianIncome / 1000)}k` : "—"],
                ["Poverty", fund.povertyRate != null ? `${fund.povertyRate}%` : "—"],
                ["Unemployment", fund.unemploymentRate != null ? `${fund.unemploymentRate}%` : "—"],
                ["Median home value", fund.medianHomeValue != null ? `$${Math.round(fund.medianHomeValue / 1000)}k` : "—"],
                ["Median rent", fund.medianRent != null ? `$${fund.medianRent.toLocaleString()}` : "—"],
                ["Vacancy", fund.vacancyRate != null ? `${fund.vacancyRate}%` : "—"],
                ["Price-to-income", fund.priceToIncome != null ? `${fund.priceToIncome}×` : "—"],
                ["Gross yield", fund.grossYield != null ? `${fund.grossYield}%` : "—"],
              ].map(([k, v]) => (
                <div key={k} className="bg-gray-900/50 border border-gray-700/40 rounded-lg px-2.5 py-2">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide">{k}</p>
                  <p className="text-sm font-bold text-white mt-0.5">{v}</p>
                </div>
              ))}
            </div>
            {upside != null && upsideReasons.length > 0 && (
              <p className="text-[11px] text-amber-200/80 mt-2">↑ <b>Appreciation potential {upside}/100</b> — {upsideReasons.join(" · ")}</p>
            )}
          </div>
        )}

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
        {/* 🔍 Find leads in this market */}
        <div className="bg-gray-900/60 border border-gray-700/40 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-700/40 flex items-center justify-between">
            <p className="text-sm font-semibold text-white">🔍 Top leads in {m.city} <span className="text-[11px] font-normal text-gray-500">· {leads.length} found, best {tl.length}</span></p>
            <span className="text-[10px] text-gray-500">ranked by hidden-gem opportunity</span>
          </div>
          <div className="divide-y divide-gray-800/50 max-h-[420px] overflow-y-auto">
            {tl.map((l) => {
              const opp = opportunityScore(l)
              return (
                <div key={l.attomId} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-800/20">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${opp.tier === "gem" ? "bg-orange-500/20 text-orange-300 border-orange-500/40" : opp.tier === "strong" ? "bg-amber-500/15 text-amber-300 border-amber-500/30" : "bg-gray-700/40 text-gray-400 border-gray-700"}`}>{opp.score}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-white truncate">{l.address}</p>
                    <p className="text-[11px] text-gray-500 truncate">{l.city}, {l.state} {l.zip}{l.ownerName && !/unknown/i.test(l.ownerName) ? ` · ${l.ownerName}` : ""}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-white">{fmtMoney(l.estimatedValue ?? l.avmValue ?? 0)}</p>
                    <p className="text-[10px] text-gray-500">score {l.score ?? 0}</p>
                  </div>
                  <button onClick={() => openDealSheet(l)} title="Open deal sheet" className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-indigo-600/80 hover:bg-indigo-500 text-white border border-indigo-400/40 shrink-0">📄</button>
                </div>
              )
            })}
          </div>
          <div className="px-4 py-2.5 border-t border-gray-700/40">
            <p className="text-[11px] text-gray-500">Open the <span className="text-indigo-300 font-semibold">🏚 Real Estate</span> tab and search “{m.city}{m.state ? `, ${m.state}` : ""}” to skip-trace, save, and run outreach on these.</p>
          </div>
        </div>

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
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold text-white">🏆 Top 20 Markets</h4>
          <span className="text-[10px] text-gray-500">{cachedCount > 0 ? `🔄 analyzed 24/7 · ${cachedCount} cached · ranked by live score` : "ranked by live data once the 24/7 analyzer runs"}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {topSorted.map((m, i) => <MarketCard key={m.city} m={m} rank={i + 1} onClick={() => analyze(m)} busy={!!loading} entry={cached[mKey(m.city, m.state)]} />)}
        </div>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-white mb-2">🌱 Upcoming Cities <span className="text-[11px] font-normal text-gray-500">— lower cost, high potential</span></h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {upSorted.map((m) => <MarketCard key={m.city} m={m} onClick={() => analyze(m)} busy={!!loading} entry={cached[mKey(m.city, m.state)]} />)}
        </div>
      </div>
    </div>
  )
}
