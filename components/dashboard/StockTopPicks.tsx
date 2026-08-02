"use client"

import { useState, useEffect, useCallback } from "react"
import { actionSignalStyle } from "@/lib/action-signal"

interface TickerRow {
  id: string
  symbol: string
  name: string
  sector: string | null
  qualityScore: number | null
  riskScore: number | null
  strengthTier: string | null
  actionSignal: string | null
  dataConfidence: "insufficient" | "low" | "medium" | "high"
  revenueGrowthYoyPct: number | null
  netMarginPct: number | null
  roePct: number | null
  piotroskiScore: number | null
  momentum12m1Pct: number | null
  dividendYieldPct: number | null
  priceUsd: number | null
}

const GRADE_COLORS: Record<string, string> = {
  A: "text-emerald-400 border-emerald-500/40 bg-emerald-500/10",
  B: "text-blue-300 border-blue-500/40 bg-blue-500/10",
  C: "text-yellow-300 border-yellow-500/40 bg-yellow-500/10",
  D: "text-orange-300 border-orange-500/40 bg-orange-500/10",
  F: "text-red-400 border-red-500/40 bg-red-500/10",
}

function gradeFromScore(score: number): string {
  if (score >= 80) return "A"
  if (score >= 65) return "B"
  if (score >= 50) return "C"
  if (score >= 35) return "D"
  return "F"
}

function fmt(n: number | null, suffix = "") {
  if (n === null || !isFinite(n)) return "—"
  return `${n.toFixed(1)}${suffix}`
}

export default function StockTopPicks({ password }: { password?: string } = {}) {
  const [tickers, setTickers] = useState<TickerRow[]>([])
  const [loading, setLoading] = useState(true)

  const fetchTopPicks = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/stocks/top-picks?limit=25", {
        headers: password ? { "x-admin-password": password } : {},
      })
      const data = await res.json()
      setTickers(data.tickers ?? [])
    } catch {
      setTickers([])
    } finally {
      setLoading(false)
    }
  }, [password])

  useEffect(() => { fetchTopPicks() }, [fetchTopPicks])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-white">Highest-Scoring Companies</h3>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Ranked by fundamental strength among tracked companies that met the data-confidence bar.
            Risk is shown separately — a high score is not a recommendation.
          </p>
        </div>
        <button onClick={fetchTopPicks} className="px-3 py-1.5 bg-gray-800/60 border border-gray-700/40 rounded-xl text-xs text-gray-400 hover:text-white transition-all">
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="grid gap-2">
          {[1, 2, 3].map(i => <div key={i} className="h-16 bg-gray-800/40 rounded-xl animate-pulse" />)}
        </div>
      ) : tickers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-700/50 px-6 py-10 text-center space-y-2">
          <p className="text-3xl">📈</p>
          <p className="text-sm font-semibold text-gray-300">Building the screener…</p>
          <p className="text-xs text-gray-500 max-w-sm mx-auto">
            The starter watchlist is being scored in the background — check back shortly, or look up a company directly above.
          </p>
        </div>
      ) : (
        <div className="grid gap-2">
          {tickers.map((t, idx) => {
            const grade = t.qualityScore !== null ? gradeFromScore(t.qualityScore) : null
            return (
              <div key={t.id} className="flex items-center gap-3 rounded-xl border border-gray-700/40 bg-gray-900/60 px-4 py-3">
                <span className="text-[10px] font-black text-gray-500 w-5 shrink-0">#{idx + 1}</span>
                {grade && (
                  <div className={`w-9 h-9 rounded-full border-2 flex items-center justify-center text-xs font-black shrink-0 ${GRADE_COLORS[grade]}`}>
                    {grade}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-white">{t.symbol}</p>
                    <p className="text-xs text-gray-500 truncate">{t.name}</p>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-500 flex-wrap">
                    {t.piotroskiScore !== null && <span>F-Score {t.piotroskiScore}/9</span>}
                    {t.momentum12m1Pct !== null && <span>12mo {fmt(t.momentum12m1Pct, "%")}</span>}
                    <span>Margin {fmt(t.netMarginPct, "%")}</span>
                    <span>ROE {fmt(t.roePct, "%")}</span>
                    {t.dividendYieldPct !== null && <span>Yield {fmt(t.dividendYieldPct, "%")}</span>}
                  </div>
                </div>
                {t.actionSignal && (
                  <span className={`shrink-0 text-[10px] font-black px-2 py-1 rounded-lg border ${actionSignalStyle(t.actionSignal)}`}>
                    {t.actionSignal.toUpperCase()}
                  </span>
                )}
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-white">{t.qualityScore}/100</p>
                  {t.riskScore !== null && (
                    <p className={`text-[10px] ${t.riskScore >= 70 ? "text-red-400" : t.riskScore >= 45 ? "text-orange-400" : "text-gray-500"}`}>
                      Risk {t.riskScore}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
