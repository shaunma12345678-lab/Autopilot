"use client"

// Outcome-Verified Predictions panel — shows how our foreclosure forecasts
// actually performed: verified hits (predicted → later confirmed on the record),
// measured lead time, coverage, and calibration by probability band. The data
// compounds automatically with every search and the daily AutoPilot run.

import { useEffect, useState } from "react"

interface Hit { a: string; p: number; predictedAt: string; confirmedAt: string; leadDays: number }
interface Stats {
  since: string
  verified: number
  missed: number
  preexisting: number
  pending: number
  watched: number
  coveragePct: number | null
  avgLeadDays: number | null
  medianLeadDays: number | null
  bands: { high: number; mid: number; low: number }
  recent: Hit[]
  missAddrs: string[]
}

function fmtDay(iso: string): string {
  try { return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }) } catch { return "" }
}

export default function PredictionAccuracy({ apiHeaders, refreshKey }: { apiHeaders: Record<string, string>; refreshKey?: number }) {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    const load = async () => {
      setLoading(true)
      try {
        const res = await fetch("/api/leads/prediction-outcomes", { headers: apiHeaders })
        const data = await res.json()
        if (!alive) return
        setStats(data.stats ?? null)
        setNote(data.note ?? null)
      } catch { if (alive) setNote("Couldn't load the forecast ledger — try again.") }
      if (alive) setLoading(false)
    }
    void load()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey])

  const tiles = stats ? [
    { label: "Verified hits", value: String(stats.verified), sub: "predicted → confirmed", color: "text-emerald-400" },
    { label: "Avg lead time", value: stats.avgLeadDays != null ? `${stats.avgLeadDays}d` : "—", sub: "days ahead of the record", color: "text-cyan-400" },
    { label: "Coverage", value: stats.coveragePct != null ? `${stats.coveragePct}%` : "—", sub: "of tracked foreclosures called early", color: "text-violet-400" },
    { label: "Open forecasts", value: String(stats.pending), sub: "waiting on the outcome", color: "text-amber-400" },
  ] : []

  return (
    <div className="bg-gray-900/60 border border-emerald-500/25 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold text-emerald-300 uppercase tracking-wider">🎯 Verified forecasts — predictions checked against what actually happened</p>
          {stats && <p className="text-[10px] text-gray-600 mt-0.5">Tracking since {fmtDay(stats.since)} · {stats.watched.toLocaleString()} properties watched · every search adds evidence</p>}
        </div>
        {loading && <span className="text-[10px] text-gray-500">loading…</span>}
      </div>

      {note && !stats && <p className="text-xs text-amber-300">{note}</p>}

      {stats && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {tiles.map((t) => (
              <div key={t.label} className="bg-gray-950/60 border border-gray-800 rounded-lg p-2.5">
                <p className={`text-lg font-extrabold ${t.color}`}>{t.value}</p>
                <p className="text-[11px] font-semibold text-gray-300">{t.label}</p>
                <p className="text-[10px] text-gray-600">{t.sub}</p>
              </div>
            ))}
          </div>

          {stats.verified > 0 && (
            <div className="flex flex-wrap gap-2 text-[11px]">
              <span className="px-2 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-700/40 text-emerald-300">High-confidence (≥70%): {stats.bands.high} hits</span>
              <span className="px-2 py-0.5 rounded-full bg-cyan-950/60 border border-cyan-700/40 text-cyan-300">Mid (45–69%): {stats.bands.mid}</span>
              <span className="px-2 py-0.5 rounded-full bg-gray-800/80 border border-gray-700 text-gray-400">Lower (&lt;45%): {stats.bands.low}</span>
              {stats.missed > 0 && <span className="px-2 py-0.5 rounded-full bg-rose-950/50 border border-rose-800/40 text-rose-300">Missed: {stats.missed}</span>}
              {stats.preexisting > 0 && <span className="px-2 py-0.5 rounded-full bg-gray-900 border border-gray-800 text-gray-600" title="First seen already in foreclosure — no chance to predict, not counted against accuracy">Pre-existing: {stats.preexisting}</span>}
            </div>
          )}

          {stats.recent.length > 0 ? (
            <div className="space-y-1">
              <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">Latest verified calls</p>
              {stats.recent.map((h, i) => (
                <div key={i} className="flex items-center justify-between gap-2 bg-gray-950/50 border border-gray-800/70 rounded-lg px-2.5 py-1.5 text-[11px]">
                  <span className="text-gray-300 truncate">{h.a || "Address withheld"}</span>
                  <span className="text-emerald-300 font-semibold shrink-0">called {h.leadDays}d early · {h.p}% at forecast</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-gray-500">
              No verified outcomes yet — that&apos;s expected at the start. Your forecasts are logged now; when a predicted property later shows a scheduled sale, it lands here as a verified hit with the exact lead time. Keep searching your farm areas (and let the daily AutoPilot run) and this becomes your proof: <i>&quot;we flag distress N days before the record.&quot;</i>
            </p>
          )}
        </>
      )}
    </div>
  )
}
