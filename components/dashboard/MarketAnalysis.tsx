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

interface Fund {
  population: number | null; popGrowth5yr: number | null; medianIncome: number | null; povertyRate: number | null; unemploymentRate: number | null
  medianHomeValue?: number | null; medianRent?: number | null; vacancyRate?: number | null; priceToIncome?: number | null; grossYield?: number | null
  occupancyPct?: number | null; rentalVacancyPct?: number | null; renterSharePct?: number | null; inboundMigrationPct?: number | null
  rent1br?: number | null; rent2br?: number | null; rent3br?: number | null
  jobGrowthPct?: number | null; jobsNote?: string
  growthFrom?: string; source?: string
}
interface Factor { key: string; label: string; value: string; rating: number | null; meaning: string; drives: string[] }
interface JobMove { company: string; jobs: number | null; note: string }
interface JobMovesData { inbound: JobMove[]; outbound: JobMove[]; at: string; sources: number }
interface TrendVerdict { metric: string; from: string; to: string; direction: "improving" | "declining" | "flat"; note: string }
interface MarketHistoryData {
  price: { y1: number | null; y3: number | null; y5: number | null; y10: number | null }
  rent: { y1: number | null; y3: number | null; y5: number | null }
  population: Array<{ year: number; pop: number }>
  trackedSince: string | null
  snapshots: number
  verdicts: TrendVerdict[]
  trajectory: "improving" | "mixed" | "declining" | "too-early"
}
interface IdealRow { key: string; label: string; ideal: string; actual: string; status: "meets" | "close" | "miss" | "unknown"; gap: string }
interface IdealData { rows: IdealRow[]; laws: IdealRow[]; fitScore: number; metCount: number; totalKnown: number; summary: string }
const IDEAL_ICON: Record<string, string> = { meets: "✅", close: "🟡", miss: "❌", unknown: "▫️" }
const DIR_ICON: Record<string, string> = { improving: "📈", declining: "📉", flat: "➖" }
const TRAJ_CLS: Record<string, string> = { improving: "bg-emerald-700/60 border-emerald-500/50 text-emerald-100", declining: "bg-rose-800/60 border-rose-600/50 text-rose-100", mixed: "bg-amber-700/50 border-amber-500/50 text-amber-100", "too-early": "bg-gray-800 border-gray-700 text-gray-300" }
interface ChecklistRow { label: string; value: string; ok: "good" | "ok" | "bad"; why: string }
interface RentalStrategy { score: number; grade: string; roi: string; checklist: ChecklistRow[]; dealbreakers: string[]; estimated: boolean }
interface RentalIntelData {
  metro: string | null; rentYoY: number | null; rent3yrAnnual: number | null; zoriRent: number | null
  priceYoY: number | null; priceMomentum: number | null; zhviValue: number | null; drawdown10y: number | null
  mortgageRate: number | null; monthlyPayment: number | null; cashflowGap: number | null
  landlord: { grade: string; evictionDays: number; rentControl: boolean; state: string } | null
  strRule: { status: string; note: string } | null
  ltr: RentalStrategy; mtr: RentalStrategy; str: RentalStrategy
  bestRental: string; verdict: string
}

const OK_ICON: Record<ChecklistRow["ok"], string> = { good: "✅", ok: "▫️", bad: "❌" }

function RentalPanel({ title, emoji, s }: { title: string; emoji: string; s: RentalStrategy }) {
  return (
    <div className="bg-gray-900/60 border border-gray-700/40 rounded-xl p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-white">{emoji} {title}</p>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-lg border ${GRADE_CLR[s.grade] ?? GRADE_CLR.C}`}>{s.grade} · {s.score}</span>
      </div>
      <p className="text-[12px] font-semibold text-emerald-300 mt-1">{s.roi}{s.estimated ? " (est.)" : ""}</p>
      {s.dealbreakers.map((d) => (
        <p key={d} className="text-[11px] font-semibold text-rose-300 bg-rose-950/40 border border-rose-800/40 rounded-lg px-2 py-1 mt-1.5">🚫 {d}</p>
      ))}
      <div className="mt-2 space-y-1">
        {s.checklist.map((r) => (
          <div key={r.label} className="flex items-start gap-1.5 text-[11px]" title={r.why}>
            <span className="shrink-0">{OK_ICON[r.ok]}</span>
            <span className="text-gray-400 shrink-0">{r.label}:</span>
            <span className="text-gray-200 font-semibold">{r.value}</span>
          </div>
        ))}
      </div>
      <details className="mt-2">
        <summary className="text-[10px] text-gray-600 cursor-pointer">Why each rating</summary>
        <ul className="mt-1 space-y-0.5">
          {s.checklist.map((r) => <li key={r.label} className="text-[10px] text-gray-500">• <b>{r.label}</b> — {r.why}</li>)}
        </ul>
      </details>
    </div>
  )
}
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

// ── Rank the markets by any strategy, not just the overall composite ─────────
type RankBy = "overall" | "ltr" | "str" | "mtr" | "flip" | "upside"
const RANK_TABS: Array<{ id: RankBy; label: string; hint: string }> = [
  { id: "overall", label: "🏆 Overall",          hint: "health + upside + deal economics" },
  { id: "ltr",     label: "🏘 Long-term rentals", hint: "cap rate, rental vacancy, job growth, tenant depth" },
  { id: "str",     label: "🏖 Short-term rentals", hint: "rent multiple, migration pull, occupancy" },
  { id: "mtr",     label: "🛏 Mid-term rentals",  hint: "furnished 2-bed economics + employment demand" },
  { id: "flip",    label: "🔨 Flips",             hint: "distressed supply, equity spread, resale demand" },
  { id: "upside",  label: "📈 Upside",            hint: "appreciation potential — growth, jobs, migration, affordability headroom" },
]

function dimScore(e: CachedEntry | undefined, by: RankBy): number {
  if (!e) return -1
  switch (by) {
    case "ltr":    return e.strat.longRental.score
    case "str":    return e.strat.shortRental.score
    case "mtr":    return e.strat.midRental.score
    case "flip":   return e.strat.flip.score
    case "upside": return typeof e.upside === "number" ? e.upside : -1
    default:       return composite(e)
  }
}

function dimDetail(e: CachedEntry, by: RankBy): string {
  switch (by) {
    case "ltr":    return e.strat.longRental.roi
    case "str":    return e.strat.shortRental.roi
    case "mtr":    return e.strat.midRental.roi
    case "flip":   return e.strat.flip.roi
    case "upside": return (e.upsideReasons ?? []).slice(0, 2).join(" · ")
    default:       return `🏆 ${e.strat.bestFor}`
  }
}

function MarketCard({ m, rank, onClick, busy, entry, rankBy }: { m: Market; rank?: number; onClick: () => void; busy: boolean; entry?: CachedEntry; rankBy: RankBy }) {
  const c = dimScore(entry, rankBy)
  return (
    <button onClick={onClick} disabled={busy} className="text-left bg-gray-900/60 border border-gray-700/40 rounded-xl p-3 hover:border-indigo-500/50 hover:bg-gray-800/40 transition-all disabled:opacity-50">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-white truncate">{rank != null && <span className="text-gray-600 mr-1">#{rank}</span>}{m.city}, {m.state}</p>
        {c >= 0 ? <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${GRADE_CLR[c >= 65 ? "A" : c >= 50 ? "C" : "D"]}`}>{c}</span> : <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${TAG_CLR[m.tag]}`}>{m.tag}</span>}
      </div>
      <p className="text-[11px] text-gray-500 mt-1 line-clamp-2">{m.why}</p>
      {entry
        ? <p className="text-[10px] text-emerald-400 font-semibold mt-1.5 truncate">{dimDetail(entry, rankBy)} · {ago(entry.at)} →</p>
        : <p className="text-[10px] text-indigo-400 font-semibold mt-1.5">Analyze →</p>}
    </button>
  )
}

export default function MarketAnalysis({ password }: { password: string }) {
  const [loading, setLoading] = useState<string | null>(null)   // city being analyzed
  const [error, setError]     = useState<string | null>(null)
  const [report, setReport]   = useState<{ m: Market | { city: string; state: string }; market: MarketReport; strat: MarketStrategies; leads: ForeclosureLead[]; depth: number; fund: Fund | null; fundScore: number | null; fundReasons: string[]; upside: number | null; upsideReasons: string[]; factors: Factor[]; jobMoves: JobMovesData | null; rental: RentalIntelData | null; history: MarketHistoryData | null; ideal: IdealData | null; fundConfigured: boolean } | null>(null)
  const [manual, setManual]   = useState("")
  const [cached, setCached]   = useState<Record<string, CachedEntry>>({})
  const [rankBy, setRankBy]   = useState<RankBy>("overall")

  // Load the 24/7-analyzed reports so the lists rank by LIVE data.
  useEffect(() => {
    fetch("/api/cron/markets?read=1", { headers: { "x-admin-password": password } })
      .then(r => r.json()).then(d => { if (d?.reports) setCached(d.reports) }).catch(() => {})
  }, [password])

  const sortByLive = (list: Market[]) => [...list].sort((a, b) => dimScore(cached[mKey(b.city, b.state)], rankBy) - dimScore(cached[mKey(a.city, a.state)], rankBy))
  const topSorted = useMemo(() => sortByLive(TOP_MARKETS), [cached, rankBy])        // eslint-disable-line react-hooks/exhaustive-deps
  const upSorted  = useMemo(() => sortByLive(UPCOMING_MARKETS), [cached, rankBy])   // eslint-disable-line react-hooks/exhaustive-deps
  const cachedCount = Object.keys(cached).length

  // The single best market per strategy across everything we've analyzed.
  const leaders = useMemo(() => {
    const all = [...TOP_MARKETS, ...UPCOMING_MARKETS]
    return RANK_TABS.filter((t) => t.id !== "overall").map((t) => {
      let best: Market | null = null, bestScore = -1
      for (const m of all) {
        const s = dimScore(cached[mKey(m.city, m.state)], t.id)
        if (s > bestScore) { bestScore = s; best = m }
      }
      return { tab: t, m: best, score: bestScore }
    }).filter((l) => l.m && l.score >= 0)
  }, [cached])

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
      else { setReport({ m, market: data.report, strat: data.strat, leads: data.leads ?? [], depth, fund: data.fundamentals ?? null, fundScore: data.fundScore ?? null, fundReasons: data.fundReasons ?? [], upside: data.upside ?? null, upsideReasons: data.upsideReasons ?? [], factors: Array.isArray(data.factors) ? data.factors : [], jobMoves: data.jobMoves ?? null, rental: data.rental ?? null, history: data.history ?? null, ideal: data.ideal ?? null, fundConfigured: !!data.fundConfigured }) }
    } catch { setError("Analysis failed — try again.") }
    setLoading(null)
  }

  // Top leads in the market, ranked by hidden-gem opportunity.
  const topLeads = (leads: ForeclosureLead[]) =>
    [...leads].sort((a, b) => opportunityScore(b).score - opportunityScore(a).score).slice(0, 20)

  // ── Detail view ──────────────────────────────────────────────────────────
  if (report) {
    const { m, market, strat, leads, depth, fund, fundScore, upside, upsideReasons, factors, jobMoves, rental, history, ideal } = report
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
                ["Jobs YoY", fund.jobGrowthPct != null ? `${fund.jobGrowthPct > 0 ? "+" : ""}${fund.jobGrowthPct}%` : "—"],
                ["Moved in (1yr)", fund.inboundMigrationPct != null ? `${fund.inboundMigrationPct}%` : "—"],
                ["Median income", fund.medianIncome != null ? `$${Math.round(fund.medianIncome / 1000)}k` : "—"],
                ["Poverty", fund.povertyRate != null ? `${fund.povertyRate}%` : "—"],
                ["Unemployment", fund.unemploymentRate != null ? `${fund.unemploymentRate}%` : "—"],
                ["Median home value", fund.medianHomeValue != null ? `$${Math.round(fund.medianHomeValue / 1000)}k` : "—"],
                ["Median rent", fund.medianRent != null ? `$${fund.medianRent.toLocaleString()}` : "—"],
                ["Rent 1bd/2bd/3bd", fund.rent1br || fund.rent2br || fund.rent3br ? [fund.rent1br, fund.rent2br, fund.rent3br].map((r) => (r ? `$${r}` : "—")).join(" / ") : "—"],
                ["Occupancy", fund.occupancyPct != null ? `${fund.occupancyPct}%` : "—"],
                ["Rental vacancy", fund.rentalVacancyPct != null ? `${fund.rentalVacancyPct}%` : "—"],
                ["Renter share", fund.renterSharePct != null ? `${fund.renterSharePct}%` : "—"],
                ["Price-to-income", fund.priceToIncome != null ? `${fund.priceToIncome}×` : "—"],
                ["Gross yield", fund.grossYield != null ? `${fund.grossYield}%` : "—"],
              ].map(([k, v]) => (
                <div key={k} className="bg-gray-900/50 border border-gray-700/40 rounded-lg px-2.5 py-2">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide">{k}</p>
                  <p className="text-sm font-bold text-white mt-0.5">{v}</p>
                </div>
              ))}
            </div>
            {fund.jobsNote && <p className="text-[10px] text-gray-600 mt-1.5">Jobs YoY = {fund.jobsNote} (BLS — city-level employment isn&apos;t published keyless)</p>}
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

        {/* 🎯 vs the Ideal Market — targets, gaps, and the law layer */}
        {ideal && (
          <div className="bg-gray-900/60 border border-amber-500/25 rounded-2xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-amber-200">🎯 vs the Ideal Market <span className="text-[10px] font-normal text-gray-500">· the numbers you&apos;d aim for, and where this market stands</span></p>
              <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${ideal.fitScore >= 75 ? "bg-emerald-700/60 border-emerald-500/50 text-emerald-100" : ideal.fitScore >= 50 ? "bg-amber-700/50 border-amber-500/50 text-amber-100" : "bg-rose-800/60 border-rose-600/50 text-rose-100"}`}>
                Ideal fit {ideal.fitScore}/100 · {ideal.metCount}/{ideal.totalKnown} met
              </span>
            </div>
            <p className="text-[12px] text-gray-300">{ideal.summary}</p>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead><tr className="text-gray-600 text-left"><th className="pr-3 pb-1">Criterion</th><th className="pr-3 pb-1">This market</th><th className="pr-3 pb-1">The ideal</th><th className="pb-1">Read</th></tr></thead>
                <tbody>
                  {ideal.rows.map((r) => (
                    <tr key={r.key} className="border-t border-gray-800/60">
                      <td className="pr-3 py-1 text-gray-300">{r.label}</td>
                      <td className={`pr-3 py-1 font-bold ${r.status === "meets" ? "text-emerald-300" : r.status === "close" ? "text-amber-300" : r.status === "miss" ? "text-rose-300" : "text-gray-600"}`}>{r.actual}</td>
                      <td className="pr-3 py-1 text-gray-500">{r.ideal}</td>
                      <td className="py-1 text-gray-500">{IDEAL_ICON[r.status]} {r.gap}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="bg-gray-950/50 border border-gray-800 rounded-lg p-2.5">
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">⚖️ The law layer — friendliness of this state & city</p>
              {ideal.laws.map((l) => (
                <p key={l.key} className="text-[11px] text-gray-300">
                  {IDEAL_ICON[l.status]} <b>{l.label}</b>: <span className={l.status === "meets" ? "text-emerald-300" : l.status === "miss" ? "text-rose-300" : "text-amber-300"}>{l.actual}</span>
                  <span className="text-gray-500"> (ideal: {l.ideal}) — {l.gap}</span>
                </p>
              ))}
            </div>
          </div>
        )}

        {/* 📈 Over the Years — measured series + our own longitudinal tracker */}
        {history && (
          <div className="bg-gray-900/60 border border-cyan-500/25 rounded-2xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-cyan-200">📈 Over the Years <span className="text-[10px] font-normal text-gray-500">· Zillow series · Census population history · our weekly tracker</span></p>
              <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${TRAJ_CLS[history.trajectory]}`}>
                {history.trajectory === "too-early" ? "Building the record…" : `Trajectory: ${history.trajectory}`}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="text-[11px] w-full max-w-md">
                <thead><tr className="text-gray-600 text-left"><th className="pr-3 pb-1"></th><th className="pr-3 pb-1">1yr</th><th className="pr-3 pb-1">3yr/yr</th><th className="pr-3 pb-1">5yr/yr</th><th className="pb-1">10yr/yr</th></tr></thead>
                <tbody>
                  <tr className="text-gray-300 border-t border-gray-800/60">
                    <td className="pr-3 py-1 font-semibold">Prices</td>
                    {[history.price.y1, history.price.y3, history.price.y5, history.price.y10].map((v, i) => (
                      <td key={i} className={`pr-3 py-1 font-bold ${v == null ? "text-gray-600" : v >= 3 ? "text-emerald-300" : v >= 0 ? "text-gray-200" : "text-rose-300"}`}>{v != null ? `${v > 0 ? "+" : ""}${v}%` : "—"}</td>
                    ))}
                  </tr>
                  <tr className="text-gray-300 border-t border-gray-800/60">
                    <td className="pr-3 py-1 font-semibold">Rents</td>
                    {[history.rent.y1, history.rent.y3, history.rent.y5, null].map((v, i) => (
                      <td key={i} className={`pr-3 py-1 font-bold ${v == null ? "text-gray-600" : v >= 2.5 ? "text-emerald-300" : v >= 0 ? "text-gray-200" : "text-rose-300"}`}>{v != null ? `${v > 0 ? "+" : ""}${v}%` : "—"}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>

            {history.population.length >= 2 && (
              <p className="text-[11px] text-gray-400">👥 Population: {history.population.map((pt) => `${pt.year}: ${(pt.pop / 1000).toFixed(0)}k`).join(" → ")}</p>
            )}

            <div className="space-y-1">
              {history.verdicts.map((v, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px]">
                  <span>{DIR_ICON[v.direction]}</span>
                  <span className="text-gray-300 font-semibold w-36 shrink-0">{v.metric === "price5" ? "5-yr prices" : v.metric === "rent3" ? "3-yr rents" : v.metric === "pop" ? "Population" : v.metric}</span>
                  <span className="text-gray-400">{v.from && v.to ? `${v.from} → ${v.to}` : v.to}</span>
                  <span className="text-gray-600">· {v.note}</span>
                </div>
              ))}
            </div>

            <p className="text-[10px] text-gray-600">
              {history.snapshots >= 2
                ? `Our tracker: ${history.snapshots} snapshots since ${history.trackedSince?.slice(0, 10)} — vacancy/migration/jobs deltas above come from OUR longitudinal record (no public source keeps these over time).`
                : `Vacancy, migration & jobs have no public historical source — so we snapshot them on every analysis. Tracking ${history.trackedSince ? `since ${history.trackedSince.slice(0, 10)}` : "starts now"}; deltas appear as the record accumulates.`}
            </p>
          </div>
        )}

        {/* 🏠 Rental Deep Dive — the full LTR/MTR/STR criteria, every box checked */}
        {rental && (
          <div className="bg-gradient-to-b from-emerald-950/30 to-gray-900/60 border border-emerald-500/30 rounded-2xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-emerald-200">🏠 Rental Deep Dive <span className="text-[10px] font-normal text-gray-500">· Zillow trend data{rental.metro ? ` (${rental.metro} metro)` : ""} · Freddie Mac rate · ACS · curated law</span></p>
              <span className="text-xs font-bold text-white bg-emerald-700/60 border border-emerald-500/50 rounded-lg px-2.5 py-1">🏆 {rental.bestRental}</span>
            </div>
            <p className="text-[12px] text-gray-300">{rental.verdict}</p>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
              {[
                ["Metro rent (ZORI)", rental.zoriRent != null ? `$${rental.zoriRent.toLocaleString()}` : "—"],
                ["Rent growth 12mo", rental.rentYoY != null ? `${rental.rentYoY > 0 ? "+" : ""}${rental.rentYoY}%` : "—"],
                ["Rent 3yr/yr", rental.rent3yrAnnual != null ? `${rental.rent3yrAnnual > 0 ? "+" : ""}${rental.rent3yrAnnual}%` : "—"],
                ["Price 12mo (ZHVI)", rental.priceYoY != null ? `${rental.priceYoY > 0 ? "+" : ""}${rental.priceYoY}%` : "—"],
                ["Momentum (3mo ann.)", rental.priceMomentum != null ? `${rental.priceMomentum > 0 ? "+" : ""}${rental.priceMomentum}%` : "—"],
                ["30-yr rate today", rental.mortgageRate != null ? `${rental.mortgageRate}%` : "—"],
                ["Median-door cash flow", rental.cashflowGap != null ? `${rental.cashflowGap >= 0 ? "+" : ""}$${rental.cashflowGap}/mo` : "—"],
              ].map(([k, v]) => (
                <div key={k} className="bg-gray-900/50 border border-gray-700/40 rounded-lg px-2.5 py-2">
                  <p className="text-[9px] text-gray-500 uppercase tracking-wide">{k}</p>
                  <p className="text-sm font-bold text-white mt-0.5">{v}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <RentalPanel title="Long-term" emoji="🏘" s={rental.ltr} />
              <RentalPanel title="Mid-term (furnished)" emoji="🛏" s={rental.mtr} />
              <RentalPanel title="Short-term" emoji="🏖" s={rental.str} />
            </div>
            <p className="text-[10px] text-gray-600">Trend data: Zillow Research (metro-level). Landlord/STR law is a curated rating — always verify the current local ordinance. STR revenue is modeled without nightly-rate data; underwrite with real comps before buying.</p>
          </div>
        )}

        {/* 🏢 Which employers are coming and going (web+AI, cached weekly) */}
        {jobMoves && (jobMoves.inbound.length > 0 || jobMoves.outbound.length > 0) && (
          <div className="bg-gray-900/60 border border-sky-500/25 rounded-2xl p-4">
            <p className="text-sm font-semibold text-sky-200 mb-2">🏢 Jobs moving in / out <span className="text-[10px] font-normal text-gray-500">· from recent local news ({jobMoves.sources} sources) · updated {ago(jobMoves.at)}</span></p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] font-bold text-emerald-300 uppercase tracking-wider mb-1">→ Coming in</p>
                {jobMoves.inbound.length === 0 && <p className="text-[11px] text-gray-600">No expansions found in recent news.</p>}
                <ul className="space-y-1">
                  {jobMoves.inbound.map((j, i) => (
                    <li key={i} className="text-[11px] text-gray-300 bg-emerald-950/25 border border-emerald-800/30 rounded-lg px-2 py-1.5">
                      <b className="text-white">{j.company}</b>{j.jobs ? <span className="text-emerald-300"> · ~{j.jobs.toLocaleString()} jobs</span> : null}{j.note ? <span className="text-gray-400"> — {j.note}</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-[10px] font-bold text-rose-300 uppercase tracking-wider mb-1">← Leaving / cutting</p>
                {jobMoves.outbound.length === 0 && <p className="text-[11px] text-gray-600">No closures or layoffs found in recent news.</p>}
                <ul className="space-y-1">
                  {jobMoves.outbound.map((j, i) => (
                    <li key={i} className="text-[11px] text-gray-300 bg-rose-950/20 border border-rose-800/30 rounded-lg px-2 py-1.5">
                      <b className="text-white">{j.company}</b>{j.jobs ? <span className="text-rose-300"> · ~{j.jobs.toLocaleString()} jobs</span> : null}{j.note ? <span className="text-gray-400"> — {j.note}</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <p className="text-[10px] text-gray-600 mt-2">Extracted from news snippets — only employers named in sources are shown. Verify before underwriting around a single employer.</p>
          </div>
        )}

        {/* 🧮 Every factor we weigh — the full transparent screen */}
        {factors.length > 0 && (
          <div className="bg-gray-900/60 border border-violet-500/25 rounded-2xl p-4">
            <p className="text-sm font-semibold text-violet-200 mb-2">🧮 Every factor we weigh <span className="text-[10px] font-normal text-gray-500">· real public data, rated for investors</span></p>
            <div className="space-y-1.5">
              {factors.map((fa) => (
                <div key={fa.key} className="flex items-center gap-3 bg-gray-950/50 border border-gray-800/70 rounded-lg px-3 py-2">
                  <div className="w-40 shrink-0">
                    <p className="text-[11px] font-semibold text-gray-200">{fa.label}</p>
                    <p className="text-sm font-bold text-white">{fa.value}</p>
                  </div>
                  <div className="w-20 shrink-0">
                    {fa.rating != null ? (
                      <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${fa.rating >= 65 ? "bg-emerald-500" : fa.rating >= 40 ? "bg-amber-500" : "bg-rose-500"}`} style={{ width: `${fa.rating}%` }} />
                      </div>
                    ) : <span className="text-[10px] text-gray-600">no data</span>}
                  </div>
                  <p className="flex-1 text-[11px] text-gray-400 min-w-0">{fa.meaning}</p>
                  <div className="hidden md:flex gap-1 shrink-0">
                    {fa.drives.slice(0, 2).map((d) => <span key={d} className="text-[9px] bg-violet-950/50 border border-violet-800/40 text-violet-200 px-1.5 py-0.5 rounded">{d}</span>)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
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

      {/* 🏅 Strategy leaders — the single best market for each play, at a glance */}
      {leaders.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-white mb-2">🏅 Best market per strategy <span className="text-[11px] font-normal text-gray-500">— from every city the 24/7 analyzer has scored</span></h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {leaders.map((l) => (
              <button key={l.tab.id} onClick={() => analyze(l.m!)} disabled={!!loading}
                className="text-left bg-gradient-to-b from-indigo-950/40 to-gray-900/60 border border-indigo-500/25 rounded-xl p-3 hover:border-indigo-400/60 transition-all disabled:opacity-50">
                <p className="text-[10px] text-gray-500">{l.tab.label}</p>
                <p className="text-sm font-bold text-white mt-0.5">{l.m!.city}, {l.m!.state}</p>
                <p className="text-[10px] text-emerald-400 font-semibold mt-0.5">score {l.score} →</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Rank every list by the strategy YOU run */}
      <div className="flex flex-wrap gap-1.5">
        {RANK_TABS.map((t) => (
          <button key={t.id} onClick={() => setRankBy(t.id)} title={t.hint}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${rankBy === t.id ? "bg-indigo-600 border-indigo-400 text-white" : "bg-gray-900/60 border-gray-700/50 text-gray-400 hover:text-gray-200"}`}>
            {t.label}
          </button>
        ))}
      </div>
      {rankBy !== "overall" && <p className="text-[11px] text-gray-500 -mt-3">Ranking every market by <b className="text-gray-300">{RANK_TABS.find((t) => t.id === rankBy)?.label.replace(/^\S+\s/, "")}</b> — {RANK_TABS.find((t) => t.id === rankBy)?.hint}. Cards show that strategy&apos;s numbers.</p>}

      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold text-white">🏆 Top 20 Markets</h4>
          <span className="text-[10px] text-gray-500">{cachedCount > 0 ? `🔄 analyzed 24/7 · ${cachedCount} cached · ranked by live score` : "ranked by live data once the 24/7 analyzer runs"}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {topSorted.map((m, i) => <MarketCard key={m.city} m={m} rank={i + 1} onClick={() => analyze(m)} busy={!!loading} entry={cached[mKey(m.city, m.state)]} rankBy={rankBy} />)}
        </div>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-white mb-2">🌱 Upcoming Cities <span className="text-[11px] font-normal text-gray-500">— lower cost, high potential</span></h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {upSorted.map((m, i) => <MarketCard key={m.city} m={m} rank={i + 1} onClick={() => analyze(m)} busy={!!loading} entry={cached[mKey(m.city, m.state)]} rankBy={rankBy} />)}
        </div>
      </div>
    </div>
  )
}
