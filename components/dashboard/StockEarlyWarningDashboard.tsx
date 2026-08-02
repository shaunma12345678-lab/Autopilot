"use client"

import { useState, useEffect, useCallback } from "react"

interface TickerRow {
  id: string
  symbol: string
  name: string
  qualityScore: number | null
  qualityReasons: string[] | null
  dataConfidence: string
  lastScoredAt: string | null
}

export default function StockEarlyWarningDashboard({ password }: { password?: string } = {}) {
  const [tickers, setTickers] = useState<TickerRow[]>([])
  const [loading, setLoading] = useState(true)

  const fetchFlagged = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/stocks/top-picks?earlyWarningOnly=true&limit=25", {
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

  useEffect(() => { fetchFlagged() }, [fetchFlagged])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-white">Red Flags</h3>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Tracked companies with going-concern language, thin interest coverage, or earnings-quality warnings.
          </p>
        </div>
        <button onClick={fetchFlagged} className="px-3 py-1.5 bg-gray-800/60 border border-gray-700/40 rounded-xl text-xs text-gray-400 hover:text-white transition-all">
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="grid gap-2">
          {[1, 2].map(i => <div key={i} className="h-20 bg-gray-800/40 rounded-xl animate-pulse" />)}
        </div>
      ) : tickers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-700/50 px-6 py-8 text-center">
          <p className="text-sm text-gray-500">No red flags among tracked companies right now.</p>
        </div>
      ) : (
        <div className="grid gap-2">
          {tickers.map(t => (
            <div key={t.id} className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-white">{t.symbol} — {t.name}</p>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/15 text-red-300 border border-red-500/30">
                  Score {t.qualityScore ?? "—"}/100
                </span>
              </div>
              {t.qualityReasons && (
                <div className="mt-1.5 space-y-0.5">
                  {t.qualityReasons.filter(r => r.startsWith("⚠")).map((r, i) => (
                    <p key={i} className="text-[11px] text-red-300/80">{r}</p>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
