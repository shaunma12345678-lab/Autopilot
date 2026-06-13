"use client"

import { useState, useEffect } from "react"
import { COUNTIES } from "@/lib/config/counties"

interface SourceRow {
  id: string
  name: string
  county: string
  layer: number
  lastSuccess: string | null
  lastError: string | null
  status: string
  updatedAt: string
}

interface CrawlResult {
  success?: boolean
  signalsFound?: number
  leadsCreated?: number
  leadsUpdated?: number
  error?: string
}

const STATUS_COLORS: Record<string, string> = {
  active:  "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  error:   "bg-red-500/15 text-red-300 border-red-500/30",
  stale:   "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
  active_ready: "bg-blue-500/15 text-blue-300 border-blue-500/30",
}

const LAYER_BADGE: Record<number, string> = {
  1: "bg-red-500/10 text-red-300 border-red-500/20",
  2: "bg-orange-500/10 text-orange-300 border-orange-500/20",
  3: "bg-blue-500/10 text-blue-300 border-blue-500/20",
}

function fmtDate(d: string | null) {
  if (!d) return "Never"
  const diff = Date.now() - new Date(d).getTime()
  const hours = Math.floor(diff / 3600000)
  if (hours < 1) return "< 1 hour ago"
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export default function AgentsPage() {
  const [sources, setSources] = useState<SourceRow[]>([])
  const [counties, setCounties] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [crawling, setCrawling] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, CrawlResult>>({})
  const [adminPass, setAdminPass] = useState("")
  const [showPassInput, setShowPassInput] = useState(false)
  const [pendingCrawl, setPendingCrawl] = useState<{ countyId: string; layer: number } | null>(null)

  async function fetchSources() {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/crawl")
      const data = await res.json()
      setSources(data.sources ?? [])
      setCounties(data.counties ?? [])
    } catch {
      setSources([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchSources() }, [])

  async function runCrawl(countyId: string, layer: number, password: string) {
    const key = `${countyId}-layer${layer}`
    setCrawling(key)
    try {
      const res = await fetch("/api/admin/crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, countyId, layer }),
      })
      const data: CrawlResult = await res.json()
      setResults(prev => ({ ...prev, [key]: data }))
      await fetchSources()
    } catch (e) {
      setResults(prev => ({ ...prev, [key]: { error: String(e) } }))
    } finally {
      setCrawling(null)
    }
  }

  function handleCrawlClick(countyId: string, layer: number) {
    if (!adminPass) {
      setPendingCrawl({ countyId, layer })
      setShowPassInput(true)
      return
    }
    runCrawl(countyId, layer, adminPass)
  }

  function handlePassSubmit() {
    setShowPassInput(false)
    if (pendingCrawl) {
      runCrawl(pendingCrawl.countyId, pendingCrawl.layer, adminPass)
      setPendingCrawl(null)
    }
  }

  // Build a map of existing sources by name+county for quick lookup
  const sourceMap = new Map<string, SourceRow>()
  for (const s of sources) sourceMap.set(`${s.name}|${s.county}`, s)

  // Build full source list from config (show even un-run sources)
  const allSources: Array<{ county: string; countyId: string; sourceName: string; layer: number; status: SourceRow | null }> = []
  for (const county of COUNTIES) {
    for (const src of county.sources) {
      const existing = sourceMap.get(`${src.name}|${county.name}`) ?? null
      allSources.push({ county: county.name, countyId: county.id, sourceName: src.name, layer: src.layer, status: existing })
    }
  }

  const totalSources = allSources.length
  const activeSources = allSources.filter(s => s.status?.status === "active").length
  const errorSources = allSources.filter(s => s.status?.status === "error").length
  const neverRun = allSources.filter(s => !s.status).length

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Agent Health Dashboard</h1>
        <p className="text-sm text-gray-400 mt-1">Monitor all pre-foreclosure data sources across counties. Broken scrapers surface immediately.</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Sources", value: totalSources, color: "text-white" },
          { label: "Active", value: activeSources, color: "text-emerald-400" },
          { label: "Errors", value: errorSources, color: "text-red-400" },
          { label: "Never Run", value: neverRun, color: "text-gray-400" },
        ].map(s => (
          <div key={s.label} className="bg-gray-900/60 border border-gray-700/40 rounded-2xl px-4 py-3">
            <p className="text-[11px] text-gray-500 font-medium">{s.label}</p>
            <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Admin password modal */}
      {showPassInput && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700/60 rounded-2xl p-6 w-80 space-y-4 shadow-2xl">
            <p className="text-sm font-bold text-white">Enter Admin Password</p>
            <input
              type="password"
              value={adminPass}
              onChange={e => setAdminPass(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handlePassSubmit() }}
              placeholder="Admin password"
              autoFocus
              className="w-full bg-gray-800 border border-gray-700/50 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500/70"
            />
            <div className="flex gap-2">
              <button onClick={handlePassSubmit} className="flex-1 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-500 transition-all">
                Run Crawl
              </button>
              <button onClick={() => { setShowPassInput(false); setPendingCrawl(null) }} className="px-4 py-2 bg-gray-800 text-gray-400 text-sm rounded-xl hover:text-white transition-all">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Source table by county */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-16 bg-gray-800/40 rounded-2xl animate-pulse" />)}
        </div>
      ) : (
        <div className="space-y-4">
          {COUNTIES.map(county => {
            const countySources = allSources.filter(s => s.countyId === county.id)
            return (
              <div key={county.id} className="bg-gray-900/60 border border-gray-700/40 rounded-2xl overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-700/40 bg-gray-800/30 flex items-center justify-between">
                  <div>
                    <span className="text-sm font-bold text-white">{county.name} County</span>
                    <span className="text-[11px] text-gray-500 ml-2">{county.state}</span>
                  </div>
                  <div className="flex gap-2">
                    {([1, 2, 3] as const).map(layer => {
                      const key = `${county.id}-layer${layer}`
                      const res = results[key]
                      return (
                        <button
                          key={layer}
                          onClick={() => handleCrawlClick(county.id, layer)}
                          disabled={crawling === key}
                          className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all disabled:opacity-50 ${LAYER_BADGE[layer]}`}
                        >
                          {crawling === key ? "…" : `Crawl L${layer}`}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Crawl results */}
                {([1, 2, 3] as const).map(layer => {
                  const key = `${county.id}-layer${layer}`
                  const res = results[key]
                  if (!res) return null
                  return (
                    <div key={key} className={`px-5 py-2 text-xs border-b border-gray-700/30 ${res.success ? "text-emerald-400 bg-emerald-500/5" : "text-red-400 bg-red-500/5"}`}>
                      {res.success
                        ? `Layer ${layer}: ${res.signalsFound} signals → ${res.leadsCreated} created, ${res.leadsUpdated} updated`
                        : `Layer ${layer} error: ${res.error}`}
                    </div>
                  )
                })}

                <div className="divide-y divide-gray-700/30">
                  {countySources.map((src, i) => {
                    const row = src.status
                    const statusKey = row ? row.status : "never"
                    return (
                      <div key={i} className="px-5 py-3 flex items-center gap-3">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${LAYER_BADGE[src.layer]}`}>
                          L{src.layer}
                        </span>
                        <p className="text-xs text-white flex-1">{src.sourceName}</p>
                        <p className="text-[11px] text-gray-500 shrink-0">
                          {row ? fmtDate(row.lastSuccess) : "Never run"}
                        </p>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${STATUS_COLORS[statusKey] ?? STATUS_COLORS.stale}`}>
                          {row ? row.status : "pending"}
                        </span>
                        {row?.lastError && (
                          <span className="text-[10px] text-red-400 truncate max-w-xs" title={row.lastError}>
                            {row.lastError.slice(0, 60)}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Inngest setup notice */}
      <div className="rounded-2xl bg-indigo-950/30 border border-indigo-500/20 px-5 py-4 space-y-2">
        <p className="text-xs font-bold text-indigo-300">Automated Scheduling (Inngest)</p>
        <p className="text-[11px] text-indigo-400/70">
          Layer 1 crawls run daily at 6am PT. Layer 2/3 crawl runs weekly Sundays at 4am PT.
          Requires <code className="text-indigo-300 bg-indigo-500/10 px-1 rounded">INNGEST_EVENT_KEY</code> and <code className="text-indigo-300 bg-indigo-500/10 px-1 rounded">INNGEST_SIGNING_KEY</code> in Vercel env vars.
          Serve endpoint: <code className="text-indigo-300 bg-indigo-500/10 px-1 rounded">/api/inngest</code>
        </p>
        <p className="text-[11px] text-indigo-400/70">
          Local dev: <code className="text-indigo-300 bg-indigo-500/10 px-1 rounded">npx inngest-cli@latest dev</code> — no account required.
        </p>
      </div>
    </div>
  )
}
