"use client"

// /proof — the public accuracy record. Live aggregates from the forecast
// ledger: how many of our foreclosure predictions were later confirmed on the
// public record, and how many days early we called them. No competitor can
// publish this number because none of them track outcomes.

import { useEffect, useState } from "react"
import Link from "next/link"

interface Stats {
  since: string
  verified: number
  pending: number
  watched: number
  coveragePct: number | null
  avgLeadDays: number | null
  medianLeadDays: number | null
  bands: { high: number; mid: number; low: number }
}

function fmtDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) } catch { return "" }
}

export default function ProofPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let alive = true
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/public/accuracy")
        const d = await res.json()
        if (alive) setStats(d.stats ?? null)
      } catch { /* shown as loading-failed empty state */ }
      if (alive) setLoaded(true)
    }, 0)
    return () => { alive = false; clearTimeout(t) }
  }, [])

  const tiles = stats ? [
    { v: String(stats.verified), l: "Verified predictions", s: "flagged by our AI, later confirmed on the public record" },
    { v: stats.avgLeadDays != null ? `${stats.avgLeadDays} days` : "—", l: "Average head start", s: "how far ahead of the record we called it" },
    { v: stats.coveragePct != null ? `${stats.coveragePct}%` : "—", l: "Coverage", s: "of tracked foreclosures we flagged beforehand" },
    { v: stats.watched.toLocaleString(), l: "Properties tracked", s: "under continuous outcome monitoring" },
  ] : []

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-900 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg,#4f46e5,#7c3aed)" }}>
              <span className="text-white font-bold text-xs">AP</span>
            </div>
            <span className="font-bold">AutoPilot — Prediction Accuracy</span>
          </div>
          <Link href="/analyze" className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">Try it free</Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-14 space-y-10">
        <section className="text-center">
          <h1 className="text-3xl sm:text-4xl font-extrabold leading-tight">We predict foreclosures<br /><span className="text-emerald-400">— then we check our work in public.</span></h1>
          <p className="text-gray-400 mt-4 max-w-xl mx-auto">Every forecast our AI makes is logged the moment it&apos;s made. When a predicted property later shows a scheduled sale on the public record, it becomes a verified hit with a measured head start. These numbers update live — misses included.</p>
        </section>

        {stats && (
          <>
            <div className="grid grid-cols-2 gap-3">
              {tiles.map((t) => (
                <div key={t.l} className="bg-gray-900/70 border border-gray-800 rounded-2xl p-5 text-center">
                  <p className="text-3xl font-extrabold text-emerald-400">{t.v}</p>
                  <p className="text-sm font-semibold text-white mt-1">{t.l}</p>
                  <p className="text-[11px] text-gray-500 mt-1">{t.s}</p>
                </div>
              ))}
            </div>
            <p className="text-center text-xs text-gray-600">Tracking since {fmtDate(stats.since)} · {stats.pending.toLocaleString()} open forecasts awaiting their outcome</p>
            {stats.verified === 0 && (
              <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6 text-center text-sm text-gray-400">
                The ledger is young — forecasts are logged and waiting on their outcomes. Verified hits appear here automatically the moment a predicted property is confirmed on the record. That&apos;s the point: <span className="text-gray-200">we can&apos;t cherry-pick, and neither can the numbers.</span>
              </div>
            )}
          </>
        )}
        {loaded && !stats && (
          <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6 text-center text-sm text-gray-500">Live stats are unavailable right now — check back shortly.</div>
        )}

        <section className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6 space-y-3">
          <h2 className="font-bold text-white">How the numbers are made</h2>
          <p className="text-sm text-gray-400 leading-relaxed">Our engine fuses early-warning signals — recorded defaults, tax delinquency, probate and divorce indicators, vacancy, code enforcement, lien stacking — into a probability that a property will reach a scheduled foreclosure sale. Each forecast is timestamped in an append-only ledger.</p>
          <p className="text-sm text-gray-400 leading-relaxed">When public records later confirm a scheduled sale, the ledger matches it to the earlier forecast and records the lead time. Properties we watched but didn&apos;t flag count against coverage. Properties first seen already in foreclosure are excluded — no credit is taken for predicting the past.</p>
        </section>

        <section className="text-center space-y-3">
          <h2 className="text-xl font-bold">See it work on any address</h2>
          <p className="text-sm text-gray-400">Run a free instant analysis — value estimate, max-offer math, and the deal verdict.</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/analyze" className="inline-block bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-8 py-3 rounded-xl transition-colors">Analyze an address free →</Link>
            <Link href="/pricing" className="inline-block bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white font-bold px-8 py-3 rounded-xl transition-colors">See plans</Link>
          </div>
        </section>
      </main>
    </div>
  )
}
