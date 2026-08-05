"use client"

// Market screens — named views that answer genuinely different investor
// questions, rather than re-sorting one score.
//
// Every screen shows its own criteria AND its own caveat. Showing the caveat is
// deliberate: a screen that only advertises what it's good for is marketing,
// not analysis. "Turnaround Watch" surfacing that it's the highest-failure-rate
// screen is the difference between a tool and a pitch.
import { useState, useEffect, useCallback } from "react"
import { actionSignalStyle } from "@/lib/action-signal"

interface ScreenDef {
  id: string
  label: string
  icon: string
  thesis: string
  criteria: string[]
  caveat: string
}

interface Row {
  id: string
  symbol: string
  name: string
  qualityScore: number | null
  riskScore: number | null
  actionSignal: string | null
  // stock
  forwardScore?: number | null
  piotroskiScore?: number | null
  roePct?: number | null
  dividendYieldPct?: number | null
  payoutRatioFcfPct?: number | null
  pricePercentile1y?: number | null
  trendState?: string | null
  rpoToRevenueYears?: number | null
  revenueAccelerationPct?: number | null
  // crypto
  marketCapRank?: number | null
  securityScore?: number | null
  protocolRevenue30dUsd?: number | null
  devActivityScore?: number | null
  fdvToMcapRatio?: number | null
  nextUnlockDate?: string | null
  nextUnlockPctSupply?: number | null
}

function num(n: number | null | undefined, suffix = "", digits = 1): string {
  if (n === null || n === undefined || !isFinite(n)) return "—"
  return `${n.toFixed(digits)}${suffix}`
}

function usd(n: number | null | undefined): string {
  if (n === null || n === undefined || !isFinite(n)) return "—"
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  return `$${Math.round(n).toLocaleString()}`
}

// Each screen highlights the metrics that screen actually selects on, so the
// row explains why it qualified rather than showing the same generic columns.
function rowFacts(screenId: string, r: Row): string[] {
  switch (screenId) {
    case "future-growth":
      return [
        r.forwardScore !== null && r.forwardScore !== undefined ? `Forward ${r.forwardScore}/100` : "",
        r.rpoToRevenueYears ? `${r.rpoToRevenueYears.toFixed(1)}yr backlog` : "",
        r.revenueAccelerationPct !== null && r.revenueAccelerationPct !== undefined ? `Accel ${num(r.revenueAccelerationPct, "pts")}` : "",
      ].filter(Boolean)
    case "steady-holdings":
      return [
        r.dividendYieldPct ? `Yield ${num(r.dividendYieldPct, "%")}` : "No dividend",
        r.payoutRatioFcfPct ? `Payout ${num(r.payoutRatioFcfPct, "% of FCF")}` : "",
        r.trendState ? `Trend ${r.trendState}` : "",
      ].filter(Boolean)
    case "quality-compounders":
      return [
        r.roePct ? `ROE ${num(r.roePct, "%")}` : "",
        r.piotroskiScore !== null && r.piotroskiScore !== undefined ? `F-Score ${r.piotroskiScore}/9` : "",
      ].filter(Boolean)
    case "turnaround-watch":
      return [
        r.pricePercentile1y !== null && r.pricePercentile1y !== undefined ? `${r.pricePercentile1y}th pct of 1y range` : "",
        r.piotroskiScore !== null && r.piotroskiScore !== undefined ? `F-Score ${r.piotroskiScore}/9` : "",
      ].filter(Boolean)
    case "real-yield":
      return [r.protocolRevenue30dUsd ? `Revenue 30d ${usd(r.protocolRevenue30dUsd)}` : "", r.securityScore !== null && r.securityScore !== undefined ? `Security ${r.securityScore}/100` : ""].filter(Boolean)
    case "blue-chip":
      return [r.marketCapRank ? `Rank #${r.marketCapRank}` : "", r.fdvToMcapRatio ? `FDV ${num(r.fdvToMcapRatio, "x", 2)}` : "", r.securityScore !== null && r.securityScore !== undefined ? `Security ${r.securityScore}` : ""].filter(Boolean)
    case "unlock-watch": {
      const days = r.nextUnlockDate ? Math.round((new Date(r.nextUnlockDate).getTime() - Date.now()) / 86400000) : null
      return [days !== null ? `Unlock in ${days}d` : "", r.nextUnlockPctSupply ? `${num(r.nextUnlockPctSupply, "% of supply")}` : ""].filter(Boolean)
    }
    case "emerging-builders":
      return [r.devActivityScore !== null && r.devActivityScore !== undefined ? `Dev ${r.devActivityScore}/100` : "", r.protocolRevenue30dUsd ? `Revenue ${usd(r.protocolRevenue30dUsd)}` : "", r.marketCapRank ? `Rank #${r.marketCapRank}` : ""].filter(Boolean)
    default:
      return []
  }
}

export default function MarketScreens({ kind, password }: { kind: "stock" | "crypto"; password?: string }) {
  const [screens, setScreens] = useState<ScreenDef[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)

  const headers = useCallback(
    (): HeadersInit => (password ? { "x-admin-password": password } : {}),
    [password]
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/markets/screens?kind=${kind}`, { headers: headers() })
        const data = await res.json()
        if (!cancelled) {
          setScreens(data.screens ?? [])
          setActive(data.screens?.[0]?.id ?? null)
        }
      } catch { if (!cancelled) setScreens([]) }
    })()
    return () => { cancelled = true }
  }, [kind, headers])

  useEffect(() => {
    if (!active) return
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const res = await fetch(`/api/markets/screens?kind=${kind}&id=${active}&limit=25`, { headers: headers() })
        const data = await res.json()
        if (!cancelled) setRows(data.rows ?? [])
      } catch { if (!cancelled) setRows([]) }
      finally { if (!cancelled) setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [kind, active, headers])

  const current = screens.find(s => s.id === active) ?? null

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-bold text-white">Markets</h3>
        <p className="text-[11px] text-gray-500 mt-0.5">
          Different screens answer different questions. The same asset can be a strong fit for one and a poor fit for another.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {screens.map(s => (
          <button key={s.id} onClick={() => setActive(s.id)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
              active === s.id
                ? "bg-indigo-600 text-white border-indigo-500/50"
                : "bg-gray-800/60 text-gray-400 border-gray-700/40 hover:text-white"
            }`}>
            {s.icon} {s.label}
          </button>
        ))}
      </div>

      {current && (
        <div className="rounded-2xl border border-gray-700/40 bg-gray-900/50 px-4 py-3 space-y-2">
          <p className="text-xs text-gray-300">{current.thesis}</p>
          <div>
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Criteria</p>
            <ul className="space-y-0.5">
              {current.criteria.map((c, i) => (
                <li key={i} className="text-[11px] text-gray-400">• {c}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl bg-amber-500/8 border border-amber-500/20 px-3 py-2">
            <p className="text-[11px] text-amber-300"><strong>What this screen is bad for:</strong> {current.caveat}</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="grid gap-2">
          {[1, 2, 3].map(i => <div key={i} className="h-14 bg-gray-800/40 rounded-xl animate-pulse" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-700/50 px-6 py-10 text-center space-y-1">
          <p className="text-sm font-semibold text-gray-300">Nothing matches this screen yet</p>
          <p className="text-xs text-gray-500 max-w-md mx-auto">
            Screens run against assets already analyzed. As the tracked universe grows — through the
            background refresh or your own lookups — matches will appear. An empty screen means nothing
            currently meets the criteria, which is itself information.
          </p>
        </div>
      ) : (
        <div className="grid gap-2">
          {rows.map((r, idx) => (
            <div key={r.id} className="flex items-center gap-3 rounded-xl border border-gray-700/40 bg-gray-900/60 px-4 py-3">
              <span className="text-[10px] font-black text-gray-500 w-5 shrink-0">#{idx + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-white">{r.symbol}</p>
                  <p className="text-xs text-gray-500 truncate">{r.name}</p>
                </div>
                <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-500 flex-wrap">
                  {rowFacts(active ?? "", r).map((f, i) => <span key={i}>{f}</span>)}
                </div>
              </div>
              {r.actionSignal && (
                <span className={`shrink-0 text-[10px] font-black px-2 py-1 rounded-lg border ${actionSignalStyle(r.actionSignal)}`}>
                  {r.actionSignal.toUpperCase()}
                </span>
              )}
              <div className="text-right shrink-0">
                <p className="text-sm font-bold text-white">{r.qualityScore ?? "—"}/100</p>
                {r.riskScore !== null && r.riskScore !== undefined && (
                  <p className={`text-[10px] ${r.riskScore >= 70 ? "text-red-400" : r.riskScore >= 45 ? "text-orange-400" : "text-gray-500"}`}>
                    Risk {r.riskScore}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
