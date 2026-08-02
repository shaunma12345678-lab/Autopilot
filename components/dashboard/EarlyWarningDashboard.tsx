"use client"

import { useState, useEffect, useCallback } from "react"
import SignalTimeline from "./SignalTimeline"
import DealCalculator from "./DealCalculator"
import FloodRiskCard from "./FloodRiskCard"

interface RawSignalRow {
  id: string
  signalType: string
  signalDate: string
  source: string
  rawData: Record<string, unknown>
  apn?: string
}

interface EarlyWarningLead {
  id: string
  name: string
  source: string
  score: number
  distressLayer: number
  earlyWarning: boolean
  confidenceScore: number | null
  timeToDistressMonths: number | null
  notes: string | null
  status: string
  createdAt: string
  signals: RawSignalRow[]
}

interface BulkResult {
  success: boolean
  target: number
  counties: string[]
  signalsFound: number
  leadsCreated: number
  leadsUpdated: number
  countyBreakdown: Record<string, number>
  leads?: EarlyWarningLead[]
  error?: string
}

const LAYER_CONFIG = {
  1: { label: "Active Filing",  badge: "bg-red-500/15 text-red-300 border-red-500/30",       glow: "shadow-red-500/10" },
  2: { label: "Early Warning",  badge: "bg-orange-500/15 text-orange-300 border-orange-500/30", glow: "shadow-orange-500/10" },
  3: { label: "Life Event",     badge: "bg-blue-500/15 text-blue-300 border-blue-500/30",     glow: "shadow-blue-500/10" },
}

const COUNTY_LABELS: Record<string, string> = {
  "san-diego":      "San Diego",
  "riverside":      "Riverside",
  "san-bernardino": "San Bernardino",
  "orange":         "Orange",
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

const TARGET_OPTIONS = [100, 200, 300] as const
type Target = typeof TARGET_OPTIONS[number]

interface Props {
  businessId: string
}

export default function EarlyWarningDashboard({ businessId }: Props) {
  const [leads, setLeads] = useState<EarlyWarningLead[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<EarlyWarningLead | null>(null)
  const [layerFilter, setLayerFilter] = useState<number | null>(null)
  const [showCalc, setShowCalc] = useState(false)
  const [earlyOnly, setEarlyOnly] = useState(false)

  // Crawl state
  const [crawling, setCrawling] = useState(false)
  const [crawlStatus, setCrawlStatus] = useState<string | null>(null)
  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null)

  // Bulk scan controls
  const [target, setTarget] = useState<Target>(100)
  const [adminPass, setAdminPass] = useState("")
  const [showPassModal, setShowPassModal] = useState(false)
  const [pendingAction, setPendingAction] = useState<"bulk" | "layer1" | "layer2" | null>(null)
  const [scanProgress, setScanProgress] = useState(0)

  const fetchLeads = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ businessId, earlyOnly: earlyOnly ? "true" : "false" })
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

  // Animated progress bar while scanning
  useEffect(() => {
    if (!crawling) { setScanProgress(0); return }
    const start = Date.now()
    const interval = setInterval(() => {
      const elapsed = Date.now() - start
      // Simulate progress: fast at first, slows near 90%, never hits 100 until done
      const pct = Math.min(90, Math.round((elapsed / 55000) * 90))
      setScanProgress(pct)
    }, 500)
    return () => clearInterval(interval)
  }, [crawling])

  async function runBulkScan(password: string) {
    setCrawling(true)
    setCrawlStatus(null)
    setBulkResult(null)
    try {
      const res  = await fetch("/api/leads/bulk-scan", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ password, target, businessId }),
      })
      const data: BulkResult = await res.json()
      setBulkResult(data)
      if (data.success) {
        setCrawlStatus(
          `✓ ${data.leadsCreated + data.leadsUpdated} leads found (${data.leadsCreated} new · ${data.leadsUpdated} updated) — ${data.signalsFound} signals across ${data.counties.map(c => COUNTY_LABELS[c] ?? c).join(", ")}`
        )
        await fetchLeads()
      } else {
        setCrawlStatus(`Error: ${data.error ?? "Unknown error"}`)
      }
    } catch (e) {
      setCrawlStatus(`Network error: ${e instanceof Error ? e.message : "unknown"}`)
    } finally {
      setCrawling(false)
      setScanProgress(100)
    }
  }

  async function runLayerScan(layer: 1 | 2, password: string) {
    setCrawling(true)
    setCrawlStatus(null)
    setBulkResult(null)
    try {
      const res  = await fetch("/api/admin/crawl", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ password, countyId: "san-diego", layer, businessId }),
      })
      const data = await res.json()
      if (data.success) {
        setCrawlStatus(`✓ Layer ${layer}: ${data.signalsFound} signals — ${data.leadsCreated} new, ${data.leadsUpdated} updated`)
        await fetchLeads()
      } else {
        setCrawlStatus(`Error: ${data.error}`)
      }
    } catch (e) {
      setCrawlStatus(`Network error: ${e instanceof Error ? e.message : "unknown"}`)
    } finally {
      setCrawling(false)
      setScanProgress(100)
    }
  }

  function requirePass(action: "bulk" | "layer1" | "layer2") {
    if (adminPass) {
      if (action === "bulk")   runBulkScan(adminPass)
      if (action === "layer1") runLayerScan(1, adminPass)
      if (action === "layer2") runLayerScan(2, adminPass)
    } else {
      setPendingAction(action)
      setShowPassModal(true)
    }
  }

  function submitPass() {
    setShowPassModal(false)
    if (pendingAction === "bulk")   runBulkScan(adminPass)
    if (pendingAction === "layer1") runLayerScan(1, adminPass)
    if (pendingAction === "layer2") runLayerScan(2, adminPass)
    setPendingAction(null)
  }

  const layer1Count = leads.filter(l => l.distressLayer === 1).length
  const layer2Count = leads.filter(l => l.distressLayer === 2).length
  const layer3Count = leads.filter(l => l.distressLayer === 3).length
  const highConf    = leads.filter(l => (l.confidenceScore ?? 0) >= 75).length

  return (
    <div className="space-y-5">

      {/* Admin password modal */}
      {showPassModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700/60 rounded-2xl p-6 w-80 space-y-4 shadow-2xl">
            <p className="text-sm font-bold text-white">Admin Password Required</p>
            <input
              type="password"
              value={adminPass}
              onChange={e => setAdminPass(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") submitPass() }}
              placeholder="Enter admin password"
              autoFocus
              className="w-full bg-gray-800 border border-gray-700/50 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500/70"
            />
            <div className="flex gap-2">
              <button onClick={submitPass} className="flex-1 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-500 transition-all">
                Start Scan
              </button>
              <button onClick={() => { setShowPassModal(false); setPendingAction(null) }}
                className="px-4 py-2 bg-gray-800 text-gray-400 text-sm rounded-xl hover:text-white transition-all">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hero banner */}
      <div className="relative rounded-2xl overflow-hidden border border-indigo-500/20 bg-gradient-to-br from-indigo-950/60 via-purple-950/40 to-gray-900/60 p-5">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-indigo-500/8 via-transparent to-transparent pointer-events-none" />
        <div className="relative space-y-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-indigo-500" />
                </span>
                Get Ahead of the Market
              </h2>
              <p className="text-sm text-gray-400 mt-1 max-w-lg">
                Leads caught <span className="text-indigo-400 font-semibold">weeks to months before</span> the official NOD hits public records.
                Set your target and bulk-scan up to 300 leads ranked best to worst.
              </p>
            </div>

            {/* Quick layer scan buttons */}
            <div className="flex gap-2 shrink-0">
              <button onClick={() => requirePass("layer1")} disabled={crawling}
                className="px-3 py-1.5 bg-indigo-600/70 hover:bg-indigo-600 text-white text-xs font-semibold rounded-xl border border-indigo-500/40 transition-all disabled:opacity-40">
                {crawling ? "Scanning…" : "Quick L1"}
              </button>
              <button onClick={() => requirePass("layer2")} disabled={crawling}
                className="px-3 py-1.5 bg-orange-600/70 hover:bg-orange-600 text-white text-xs font-semibold rounded-xl border border-orange-500/40 transition-all disabled:opacity-40">
                {crawling ? "Scanning…" : "Quick L2"}
              </button>
            </div>
          </div>

          {/* Bulk scan controls */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1 bg-gray-800/80 border border-gray-700/40 rounded-xl p-1">
              {TARGET_OPTIONS.map(t => (
                <button key={t} onClick={() => setTarget(t)} disabled={crawling}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-40 ${target === t ? "bg-indigo-600 text-white shadow" : "text-gray-400 hover:text-white"}`}>
                  {t} Leads
                </button>
              ))}
            </div>
            <button onClick={() => requirePass("bulk")} disabled={crawling}
              className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-sm font-bold rounded-xl border border-indigo-500/40 shadow-lg shadow-indigo-500/20 transition-all disabled:opacity-40 flex items-center gap-2">
              {crawling
                ? <><span className="animate-spin text-base">⟳</span> Scanning {target} leads…</>
                : `⚡ Bulk Scan ${target} Leads`}
            </button>
          </div>

          {/* Progress bar */}
          {crawling && (
            <div className="space-y-1">
              <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full transition-all duration-500"
                  style={{ width: `${scanProgress}%` }}
                />
              </div>
              <p className="text-[10px] text-gray-500">
                Scanning {target === 100 ? "San Diego" : target === 200 ? "San Diego + Riverside" : "San Diego + Riverside + San Bernardino"} county ZIPs in parallel…
              </p>
            </div>
          )}

          {/* Status message */}
          {crawlStatus && (
            <p className={`text-xs px-3 py-2 rounded-xl border ${crawlStatus.startsWith("✓") ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-red-500/10 border-red-500/20 text-red-400"}`}>
              {crawlStatus}
            </p>
          )}

          {/* County breakdown from bulk scan */}
          {bulkResult?.success && Object.keys(bulkResult.countyBreakdown).length > 0 && (
            <div className="flex gap-3 flex-wrap">
              {Object.entries(bulkResult.countyBreakdown).map(([county, count]) => (
                <div key={county} className="bg-white/4 rounded-xl px-3 py-1.5 border border-white/8 text-center">
                  <p className="text-[10px] text-gray-500">{COUNTY_LABELS[county] ?? county}</p>
                  <p className="text-sm font-bold text-white">{count} leads</p>
                </div>
              ))}
            </div>
          )}

          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Active Filings", value: layer1Count, color: "text-red-400" },
              { label: "Early Warning",  value: layer2Count, color: "text-orange-400" },
              { label: "Life Events",    value: layer3Count, color: "text-blue-400" },
              { label: "High Confidence",value: highConf,   color: "text-emerald-400" },
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
          {([null, 1, 2, 3] as const).map(l => (
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
          <p className="text-4xl">🏚</p>
          <p className="text-sm font-semibold text-gray-300">No leads yet</p>
          <p className="text-xs text-gray-500 max-w-sm mx-auto">
            Select a target (100 / 200 / 300 leads) and click <strong className="text-white">Bulk Scan</strong> to crawl public pre-foreclosure records across {'"'}100+{'"'} ZIP codes and populate this dashboard with ranked leads.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {leads.map((lead, idx) => {
            const cfg        = LAYER_CONFIG[lead.distressLayer as 1 | 2 | 3] ?? LAYER_CONFIG[2]
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
                          <span className="text-[10px] text-amber-400 shrink-0">~{lead.timeToDistressMonths}mo to NOD</span>
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
                        {showCalc ? "Hide Calculator" : "Deal Calculator"}
                      </button>
                      <FloodRiskCard leadId={lead.id} />
                    </div>

                    {showCalc && <DealCalculator prefillAddress={lead.name} />}
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
