"use client"

// Discovery feed — companies surfaced by EVENT rather than by hand.
//
// This is the stocks answer to the real-estate lead feed. Instead of screening
// a watchlist someone typed in, it scans every SEC registrant for filings that
// carry signal, then pulls those companies in for analysis.
import { useState, useEffect, useCallback } from "react"
import { actionSignalStyle } from "@/lib/action-signal"

interface DiscoveryRow {
  id: string
  symbol: string | null
  companyName: string
  eventType: string
  eventDate: string
  formType: string
  sourceUrl: string | null
  priority: number
  rationale: string | null
  processed: boolean
  analysis: {
    qualityScore: number | null
    riskScore: number | null
    actionSignal: string | null
    piotroskiScore: number | null
    forwardScore: number | null
  } | null
}

const EVENT_META: Record<string, { label: string; icon: string; blurb: string; tone: string }> = {
  late_filing: {
    label: "Late Filing",
    icon: "🚩",
    blurb: "Told the SEC it could not file a periodic report on time. Rare across the whole market and a known precursor to accounting or solvency trouble — the closest equity analog to a notice of default.",
    tone: "border-red-500/40 bg-red-500/8 text-red-300",
  },
  insider_cluster_buy: {
    label: "Insider Cluster Buy",
    icon: "💰",
    blurb: "Multiple insiders independently bought stock on the open market with their own money. Buying carries signal in a way selling does not.",
    tone: "border-emerald-500/40 bg-emerald-500/8 text-emerald-300",
  },
  ipo_pipeline: {
    label: "IPO Pipeline",
    icon: "🆕",
    blurb: "Filed a registration statement — approaching a public listing.",
    tone: "border-blue-500/40 bg-blue-500/8 text-blue-300",
  },
  material_agreement: {
    label: "Material Agreement",
    icon: "📝",
    blurb: "Disclosed a material definitive agreement — a significant contract, partnership, or financing.",
    tone: "border-indigo-500/40 bg-indigo-500/8 text-indigo-300",
  },
}

const FILTERS = [
  { id: "", label: "All events" },
  { id: "late_filing", label: "🚩 Late Filing" },
  { id: "insider_cluster_buy", label: "💰 Insider Buys" },
  { id: "ipo_pipeline", label: "🆕 IPO Pipeline" },
  { id: "material_agreement", label: "📝 Material Agreements" },
]

export default function DiscoveryFeed({ password }: { password?: string } = {}) {
  const [rows, setRows] = useState<DiscoveryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState("")

  const fetchFeed = useCallback(async () => {
    setLoading(true)
    try {
      const qs = filter ? `?eventType=${filter}&limit=40` : "?limit=40"
      const res = await fetch(`/api/markets/discovery${qs}`, {
        headers: password ? { "x-admin-password": password } : {},
      })
      const data = await res.json()
      setRows(data.events ?? [])
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [filter, password])

  useEffect(() => { fetchFeed() }, [fetchFeed])

  const activeMeta = filter ? EVENT_META[filter] : null

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-white">Discovery Feed</h3>
          <p className="text-[11px] text-gray-500 mt-0.5 max-w-2xl">
            Companies surfaced by filing event across all ~10,400 SEC registrants — not from a
            hand-picked watchlist. This is where a find comes from: the market&apos;s 80 most-covered
            companies have nothing left to discover.
          </p>
        </div>
        <button onClick={fetchFeed} className="px-3 py-1.5 bg-gray-800/60 border border-gray-700/40 rounded-xl text-xs text-gray-400 hover:text-white transition-all shrink-0">
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
              filter === f.id
                ? "bg-indigo-600 text-white border-indigo-500/50"
                : "bg-gray-800/60 text-gray-400 border-gray-700/40 hover:text-white"
            }`}>
            {f.label}
          </button>
        ))}
      </div>

      {activeMeta && (
        <div className={`rounded-xl border px-4 py-2.5 ${activeMeta.tone}`}>
          <p className="text-[11px]">{activeMeta.blurb}</p>
        </div>
      )}

      {loading ? (
        <div className="grid gap-2">
          {[1, 2, 3].map(i => <div key={i} className="h-16 bg-gray-800/40 rounded-xl animate-pulse" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-700/50 px-6 py-10 text-center space-y-1">
          <p className="text-sm font-semibold text-gray-300">No discovery events yet</p>
          <p className="text-xs text-gray-500 max-w-md mx-auto">
            The discovery scan runs every 6 hours across all SEC registrants. Events appear here as
            they&apos;re filed, then get analyzed automatically.
          </p>
        </div>
      ) : (
        <div className="grid gap-2">
          {rows.map(r => {
            const meta = EVENT_META[r.eventType] ?? {
              label: r.eventType, icon: "•", blurb: "", tone: "border-gray-600/40 bg-gray-600/8 text-gray-300",
            }
            return (
              <div key={r.id} className="rounded-xl border border-gray-700/40 bg-gray-900/60 px-4 py-3">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${meta.tone}`}>
                        {meta.icon} {meta.label}
                      </span>
                      {r.symbol && <p className="text-sm font-semibold text-white">{r.symbol}</p>}
                      <p className="text-xs text-gray-500 truncate">{r.companyName}</p>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-500 flex-wrap">
                      <span>{new Date(r.eventDate).toLocaleDateString()}</span>
                      <span>Form {r.formType}</span>
                      {!r.processed && <span className="text-amber-400">analysis queued</span>}
                      {r.sourceUrl && (
                        <a href={r.sourceUrl} target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline">
                          View filing →
                        </a>
                      )}
                    </div>
                    {r.rationale && <p className="text-[11px] text-gray-400 mt-1.5">{r.rationale}</p>}
                  </div>

                  {r.analysis?.actionSignal && (
                    <span className={`shrink-0 text-[10px] font-black px-2 py-1 rounded-lg border ${actionSignalStyle(r.analysis.actionSignal)}`}>
                      {r.analysis.actionSignal.toUpperCase()}
                    </span>
                  )}
                  {r.analysis?.qualityScore !== null && r.analysis?.qualityScore !== undefined && (
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-white">{r.analysis.qualityScore}/100</p>
                      {r.analysis.riskScore !== null && (
                        <p className={`text-[10px] ${r.analysis.riskScore >= 70 ? "text-red-400" : r.analysis.riskScore >= 45 ? "text-orange-400" : "text-gray-500"}`}>
                          Risk {r.analysis.riskScore}
                        </p>
                      )}
                    </div>
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
