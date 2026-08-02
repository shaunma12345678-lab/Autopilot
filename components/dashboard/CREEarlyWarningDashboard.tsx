"use client"

import { useState, useEffect, useCallback } from "react"
import SignalTimeline from "./SignalTimeline"
import CREDealCalculator from "./CREDealCalculator"
import ZoningUpsideCard from "./ZoningUpsideCard"
import FloodRiskCard from "./FloodRiskCard"

interface RawSignalRow {
  id: string
  signalType: string
  signalDate: string
  source: string
  rawData: Record<string, unknown>
  apn?: string
}

interface CreLead {
  id: string
  name: string
  source: string
  score: number
  distressLayer: number
  earlyWarning: boolean
  confidenceScore: number | null
  timeToDistressMonths: number | null
  propertyType: string | null
  notes: string | null
  status: string
  createdAt: string
  signals: RawSignalRow[]
}

// CRE signals only ever land in layer 1 (active distress) or layer 2 (early
// warning) — see SIGNAL_LAYER_MAP in lib/config/counties.ts.
const LAYER_CONFIG = {
  1: { label: "Active Distress", badge: "bg-red-500/15 text-red-300 border-red-500/30",       glow: "shadow-red-500/10" },
  2: { label: "Early Warning",   badge: "bg-orange-500/15 text-orange-300 border-orange-500/30", glow: "shadow-orange-500/10" },
}

function ConfidenceBar({ pct }: { pct: number }) {
  const color = pct >= 80 ? "bg-emerald-500" : pct >= 55 ? "bg-yellow-500" : "bg-blue-500"
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-gray-400 w-8 text-right">{pct}%</span>
    </div>
  )
}

function ScoreRing({ score }: { score: number }) {
  const color = score >= 70 ? "#22c55e" : score >= 45 ? "#eab308" : "#6366f1"
  const r     = 20
  const circ  = 2 * Math.PI * r
  const dash  = (score / 100) * circ
  return (
    <div className="relative w-14 h-14 shrink-0">
      <svg className="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
        <circle cx="28" cy="28" r={r} fill="none" stroke="#1f2937" strokeWidth="4" />
        <circle cx="28" cy="28" r={r} fill="none" stroke={color} strokeWidth="4"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xs font-bold text-white">{score}</span>
      </div>
    </div>
  )
}

interface Props {
  businessId: string
}

export default function CREEarlyWarningDashboard({ businessId }: Props) {
  const [leads, setLeads] = useState<CreLead[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<CreLead | null>(null)
  const [layerFilter, setLayerFilter] = useState<number | null>(null)
  const [showCalc, setShowCalc] = useState(false)
  const [earlyOnly, setEarlyOnly] = useState(false)

  const fetchLeads = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ businessId, assetClass: "commercial", earlyOnly: earlyOnly ? "true" : "false" })
      if (layerFilter) params.set("layer", String(layerFilter))
      const res  = await fetch(`/api/leads/early-warning?${params}`)
      const data = await res.json()
      setLeads(data.leads ?? [])
    } catch {
      setLeads([])
    } finally {
      setLoading(false)
    }
  }, [businessId, layerFilter, earlyOnly])

  useEffect(() => { fetchLeads() }, [fetchLeads])

  const layer1Count = leads.filter(l => l.distressLayer === 1).length
  const layer2Count = leads.filter(l => l.distressLayer === 2).length
  const highConf    = leads.filter(l => (l.confidenceScore ?? 0) >= 75).length

  return (
    <div className="space-y-5">

      {/* Hero banner */}
      <div className="relative rounded-2xl overflow-hidden border border-indigo-500/20 bg-gradient-to-br from-indigo-950/60 via-purple-950/40 to-gray-900/60 p-5">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-indigo-500/8 via-transparent to-transparent pointer-events-none" />
        <div className="relative space-y-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-indigo-500" />
              </span>
              Commercial Distress Radar
            </h2>
            <p className="text-sm text-gray-400 mt-1 max-w-lg">
              CMBS special servicing, SBA defaults, LLC bankruptcies, UCC-1 liens, code violations, and vacancy
              signals across San Diego, Riverside, San Bernardino, and Orange County commercial parcels —
              discovered automatically every 2 hours.
            </p>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: "Active Distress", value: layer1Count, color: "text-red-400" },
              { label: "Early Warning",   value: layer2Count, color: "text-orange-400" },
              { label: "High Confidence", value: highConf,    color: "text-emerald-400" },
            ].map(s => (
              <div key={s.label} className="bg-white/4 rounded-xl px-3 py-2.5 border border-white/8">
                <p className="text-[10px] text-gray-500 font-medium">{s.label}</p>
                <p className={`text-xl font-black ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex bg-gray-800/80 border border-gray-700/40 rounded-xl p-1 gap-1">
          {([null, 1, 2] as const).map(l => (
            <button key={String(l)} onClick={() => setLayerFilter(l)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${layerFilter === l ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-white"}`}>
              {l === null ? "All Layers" : `Layer ${l}`}
            </button>
          ))}
        </div>
        <button onClick={() => setEarlyOnly(p => !p)}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${earlyOnly ? "bg-indigo-600/20 border-indigo-500/40 text-indigo-300" : "bg-gray-800/60 border-gray-700/40 text-gray-400"}`}>
          {earlyOnly ? "Early Warning Only" : "All Leads"}
        </button>
        <span className="text-[11px] text-gray-500">{leads.length} leads · sorted best → worst</span>
        <button onClick={fetchLeads} className="ml-auto px-3 py-1.5 bg-gray-800/60 border border-gray-700/40 rounded-xl text-xs text-gray-400 hover:text-white transition-all">
          Refresh
        </button>
      </div>

      {/* Lead cards */}
      {loading ? (
        <div className="grid gap-3">
          {[1, 2, 3].map(i => <div key={i} className="h-24 bg-gray-800/40 rounded-2xl animate-pulse" />)}
        </div>
      ) : leads.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-700/50 px-6 py-12 text-center space-y-3">
          <p className="text-4xl">🏢</p>
          <p className="text-sm font-semibold text-gray-300">No commercial leads yet</p>
          <p className="text-xs text-gray-500 max-w-sm mx-auto">
            The CRE discovery cron scans all 4 counties every 2 hours. New distressed commercial parcels
            will appear here automatically — check back shortly, or hit Refresh.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {leads.map((lead, idx) => {
            const cfg        = LAYER_CONFIG[lead.distressLayer as 1 | 2] ?? LAYER_CONFIG[2]
            const isSelected = selected?.id === lead.id
            const signalTypes = [...new Set(lead.signals.map(s => s.signalType))]

            return (
              <div key={lead.id}
                className={`rounded-2xl border transition-all cursor-pointer shadow-lg ${cfg.glow} ${isSelected ? "border-indigo-500/50 bg-gray-800/80" : "border-gray-700/40 bg-gray-900/60 hover:border-gray-600/60 hover:bg-gray-800/60"}`}
                onClick={() => setSelected(isSelected ? null : lead)}>

                <div className="p-4 flex items-start gap-3">
                  {/* Rank badge */}
                  <div className="flex flex-col items-center gap-1 shrink-0">
                    <span className="text-[10px] font-black text-gray-500">#{idx + 1}</span>
                    <ScoreRing score={lead.score} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-white truncate">{lead.name}</p>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {lead.earlyWarning && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">EARLY</span>
                        )}
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cfg.badge}`}>
                          {cfg.label}
                        </span>
                      </div>
                    </div>

                    <p className="text-[11px] text-gray-500 mt-0.5">{lead.source}</p>

                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      {signalTypes.slice(0, 3).map(t => (
                        <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700/60 text-gray-300">
                          {t.replace(/_/g, " ")}
                        </span>
                      ))}
                      {signalTypes.length > 3 && (
                        <span className="text-[10px] text-gray-500">+{signalTypes.length - 3} more</span>
                      )}
                    </div>

                    {lead.confidenceScore !== null && (
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-[10px] text-gray-500 shrink-0">Confidence</span>
                        <ConfidenceBar pct={lead.confidenceScore} />
                        {lead.timeToDistressMonths !== null && lead.timeToDistressMonths > 0 && (
                          <span className="text-[10px] text-amber-400 shrink-0">~{lead.timeToDistressMonths}mo to filing</span>
                        )}
                        {lead.timeToDistressMonths === 0 && (
                          <span className="text-[10px] text-red-400 font-semibold shrink-0">Active NOW</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Expanded detail */}
                {isSelected && (
                  <div className="border-t border-gray-700/40 p-4 space-y-4" onClick={e => e.stopPropagation()}>
                    {lead.notes && (
                      <div className="bg-gray-800/60 rounded-xl px-4 py-3">
                        <p className="text-xs text-gray-400 whitespace-pre-wrap">{lead.notes}</p>
                      </div>
                    )}

                    <SignalTimeline signals={lead.signals} />

                    <div className="flex gap-2 flex-wrap">
                      <button onClick={() => setShowCalc(p => !p)}
                        className="px-4 py-2 bg-indigo-600/80 hover:bg-indigo-600 text-white text-xs font-semibold rounded-xl border border-indigo-500/40 transition-all">
                        {showCalc ? "Hide Calculator" : "CRE Deal Calculator"}
                      </button>
                      <ZoningUpsideCard leadId={lead.id} />
                      <FloodRiskCard leadId={lead.id} />
                    </div>

                    {showCalc && <CREDealCalculator prefillAddress={lead.name} />}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
