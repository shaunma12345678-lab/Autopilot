"use client"

import { useState, useEffect } from "react"

type AgentRun = {
  id:          string
  agentSlug:   string
  agentName:   string
  status:      "RUNNING" | "COMPLETED" | "FAILED"
  durationMs:  number | null
  errorMsg:    string | null
  createdAt:   string
  completedAt: string | null
}

type Stats = { total: number; completed: number; failed: number }

const STATUS_STYLE = {
  RUNNING:   "bg-blue-900/40 text-blue-400 border-blue-800/40",
  COMPLETED: "bg-emerald-900/40 text-emerald-400 border-emerald-800/40",
  FAILED:    "bg-red-900/40 text-red-400 border-red-800/40",
}

const STATUS_DOT = {
  RUNNING:   "bg-blue-400 animate-pulse",
  COMPLETED: "bg-emerald-400",
  FAILED:    "bg-red-400",
}

function fmt(ms: number | null) {
  if (!ms) return "—"
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export default function ActivityPage() {
  const [runs,    setRuns]    = useState<AgentRun[]>([])
  const [stats,   setStats]   = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter,  setFilter]  = useState<"all" | "COMPLETED" | "FAILED" | "RUNNING">("all")

  useEffect(() => {
    async function load() {
      setLoading(true)
      const res  = await fetch("/api/activity?limit=100")
      const data = await res.json()
      if (data.runs)  setRuns(data.runs)
      if (data.stats) setStats(data.stats)
      setLoading(false)
    }
    load()
    // Poll every 15s to catch new runs
    const id = setInterval(load, 15000)
    return () => clearInterval(id)
  }, [])

  const filtered = filter === "all" ? runs : runs.filter(r => r.status === filter)
  const successRate = stats && stats.total > 0
    ? Math.round((stats.completed / stats.total) * 100)
    : 0

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-lg">⚡</div>
            <h1 className="text-2xl font-bold">Agent Activity</h1>
          </div>
          <p className="text-gray-400 text-sm">Live log of every agent run — what ran, how long it took, and whether it succeeded.</p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-500 bg-gray-900 border border-gray-800 rounded-full px-3 py-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
          Auto-refreshing
        </div>
      </div>

      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: "Total Runs",    value: stats.total,     color: "indigo" },
            { label: "Completed",     value: stats.completed, color: "emerald" },
            { label: "Failed",        value: stats.failed,    color: "red" },
            { label: "Success Rate",  value: `${successRate}%`, color: "blue" },
          ].map(s => (
            <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <p className="text-2xl font-bold text-white">{s.value}</p>
              <p className="text-xs text-gray-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit mb-4">
        {(["all", "RUNNING", "COMPLETED", "FAILED"] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              filter === f ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-white"
            }`}
          >
            {f === "all" ? "All" : f.charAt(0) + f.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {/* Runs table */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-gray-500 text-sm">Loading activity…</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-4xl mb-3">⚡</p>
            <p className="text-gray-400 font-medium">No agent runs yet</p>
            <p className="text-gray-600 text-sm mt-1">Run any agent from the dashboard to see activity here.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left text-xs text-gray-500 font-semibold px-4 py-3 uppercase tracking-wide">Agent</th>
                <th className="text-left text-xs text-gray-500 font-semibold px-4 py-3 uppercase tracking-wide">Status</th>
                <th className="text-left text-xs text-gray-500 font-semibold px-4 py-3 uppercase tracking-wide">Duration</th>
                <th className="text-left text-xs text-gray-500 font-semibold px-4 py-3 uppercase tracking-wide">When</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((run, i) => (
                <tr key={run.id} className={`border-b border-gray-800/50 hover:bg-gray-800/30 transition ${i === filtered.length - 1 ? "border-0" : ""}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOT[run.status]}`} />
                      <span className="font-medium text-white">{run.agentName}</span>
                    </div>
                    {run.errorMsg && (
                      <p className="text-xs text-red-400 mt-0.5 ml-3.5 truncate max-w-xs">{run.errorMsg}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold border rounded-full px-2 py-0.5 ${STATUS_STYLE[run.status]}`}>
                      {run.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 font-mono text-xs">
                    {fmt(run.durationMs)}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {timeAgo(run.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
