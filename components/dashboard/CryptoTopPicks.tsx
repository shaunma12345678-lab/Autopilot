"use client"

import { useState, useEffect, useCallback } from "react"
import { actionSignalStyle } from "@/lib/action-signal"

interface CryptoRow {
  id: string
  symbol: string
  name: string
  qualityScore: number | null
  riskScore: number | null
  securityScore: number | null
  actionSignal: string | null
  priceUsd: number | null
  priceChange7dPct: number | null
  protocolRevenue30dUsd: number | null
  devActivityScore: number | null
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

export default function CryptoTopPicks({ password }: { password?: string } = {}) {
  const [assets, setAssets] = useState<CryptoRow[]>([])
  const [loading, setLoading] = useState(true)

  const fetchTopPicks = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/crypto/top-picks?limit=25", {
        headers: password ? { "x-admin-password": password } : {},
      })
      const data = await res.json()
      setAssets(data.assets ?? [])
    } catch {
      setAssets([])
    } finally {
      setLoading(false)
    }
  }, [password])

  useEffect(() => { fetchTopPicks() }, [fetchTopPicks])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-white">Highest-Scoring Assets</h3>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Ranked by fundamental strength among tracked coins that met the data-confidence bar.
            Risk and contract security are shown separately — a high score is not a recommendation.
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
      ) : assets.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-700/50 px-6 py-10 text-center space-y-2">
          <p className="text-3xl">🪙</p>
          <p className="text-sm font-semibold text-gray-300">Building the screener…</p>
          <p className="text-xs text-gray-500 max-w-sm mx-auto">
            The starter watchlist is being scored in the background — check back shortly, or look up a coin directly above.
          </p>
        </div>
      ) : (
        <div className="grid gap-2">
          {assets.map((a, idx) => {
            const grade = a.qualityScore !== null ? gradeFromScore(a.qualityScore) : null
            return (
              <div key={a.id} className="flex items-center gap-3 rounded-xl border border-gray-700/40 bg-gray-900/60 px-4 py-3">
                <span className="text-[10px] font-black text-gray-500 w-5 shrink-0">#{idx + 1}</span>
                {grade && (
                  <div className={`w-9 h-9 rounded-full border-2 flex items-center justify-center text-xs font-black shrink-0 ${GRADE_COLORS[grade]}`}>
                    {grade}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-white">{a.symbol}</p>
                    <p className="text-xs text-gray-500 truncate">{a.name}</p>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-500 flex-wrap">
                    <span>7d {fmt(a.priceChange7dPct, "%")}</span>
                    {a.securityScore !== null && (
                      <span className={a.securityScore < 60 ? "text-red-400" : ""}>Security {a.securityScore}/100</span>
                    )}
                    {a.protocolRevenue30dUsd !== null && <span>Revenue ${Math.round(a.protocolRevenue30dUsd).toLocaleString()}</span>}
                    {a.devActivityScore !== null && <span>Dev {a.devActivityScore}/100</span>}
                  </div>
                </div>
                {a.actionSignal && (
                  <span className={`shrink-0 text-[10px] font-black px-2 py-1 rounded-lg border ${actionSignalStyle(a.actionSignal)}`}>
                    {a.actionSignal.toUpperCase()}
                  </span>
                )}
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-white">{a.qualityScore}/100</p>
                  {a.riskScore !== null && (
                    <p className={`text-[10px] ${a.riskScore >= 70 ? "text-red-400" : a.riskScore >= 45 ? "text-orange-400" : "text-gray-500"}`}>
                      Risk {a.riskScore}
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
