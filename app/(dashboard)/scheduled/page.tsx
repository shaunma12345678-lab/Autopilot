"use client"

import { useState, useEffect } from "react"

interface ScheduledRun {
  id:              string
  agentSlug:       string
  agentName:       string
  enabled:         boolean
  cronExpression:  string
  lastRunAt:       string | null
  lastChangePct:   number | null
  changeThreshold: number
  notifyOnChange:  boolean
}

const CRON_PRESETS = [
  { label: "Weekdays 8am",    value: "0 8 * * 1-5" },
  { label: "Weekdays 7am",    value: "0 7 * * 1-5" },
  { label: "Mondays 8am",     value: "0 8 * * 1"   },
  { label: "Daily midnight",  value: "0 0 * * *"   },
  { label: "Every 15 min",    value: "*/15 * * * *" },
  { label: "1st of month",    value: "0 8 1 * *"   },
]

const COMMON_AGENTS = [
  { slug: "financial-command-center",  name: "Financial Command Center",  category: "Finance"   },
  { slug: "cash-flow-forecaster",      name: "Cash Flow Forecaster",      category: "Finance"   },
  { slug: "lead-qualifier",            name: "Lead Qualifier",            category: "Sales"     },
  { slug: "content-factory",           name: "Content Factory",           category: "Marketing" },
  { slug: "seo-monitor",               name: "SEO Monitor",               category: "Marketing" },
  { slug: "churn-prevention",          name: "Churn Prevention",          category: "CS"        },
  { slug: "threat-detector",           name: "Threat Detector",           category: "Tech"      },
  { slug: "competitive-intel",         name: "Competitive Intel",         category: "Executive" },
]

function timeAgo(ts: string | null) {
  if (!ts) return "Never"
  const ms = Date.now() - new Date(ts).getTime()
  if (ms < 60000)   return `${Math.floor(ms / 1000)}s ago`
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ago`
  return `${Math.floor(ms / 3600000)}h ago`
}

export default function ScheduledPage() {
  const [runs,    setRuns]    = useState<ScheduledRun[]>([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState<string | null>(null)
  const [toast,   setToast]   = useState("")

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(""), 4000) }

  async function load() {
    try {
      const res  = await fetch("/api/scheduled-runs")
      const data = await res.json()
      setRuns(data.scheduledRuns ?? [])
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function enableAgent(agent: typeof COMMON_AGENTS[0]) {
    const res = await fetch("/api/scheduled-runs", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentSlug: agent.slug, agentName: agent.name, cronExpression: "0 8 * * 1-5" }),
    })
    if (res.ok) { await load(); showToast(`✓ ${agent.name} scheduled`) }
  }

  async function toggle(id: string, enabled: boolean) {
    await fetch("/api/scheduled-runs", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, enabled }),
    })
    setRuns(prev => prev.map(r => r.id === id ? { ...r, enabled } : r))
    showToast(enabled ? "Agent scheduled" : "Schedule paused")
  }

  async function updateCron(id: string, cronExpression: string) {
    await fetch("/api/scheduled-runs", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, cronExpression }),
    })
    setRuns(prev => prev.map(r => r.id === id ? { ...r, cronExpression } : r))
  }

  async function runNow(run: ScheduledRun) {
    setRunning(run.id)
    try {
      const res  = await fetch("/api/scheduled-runs", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: run.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      await load()
      const msg = data.changed
        ? `✓ ${run.agentName} ran — ${data.changePct}% change from last run. New output ready.`
        : `✓ ${run.agentName} ran — output unchanged (${data.changePct}% change, below threshold).`
      showToast(msg)
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed")
    } finally { setRunning(null) }
  }

  const enabledSlugs = new Set(runs.map(r => r.agentSlug))
  const availableAgents = COMMON_AGENTS.filter(a => !enabledSlugs.has(a.slug))

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-lg">🕐</div>
          <h1 className="text-2xl font-bold">Scheduled Runs</h1>
        </div>
        <p className="text-gray-400 text-sm">
          Agents run automatically on schedule. AutoPilot detects when output changes significantly and alerts you — no noise when nothing changed.
        </p>
      </div>

      {/* Add agents */}
      {availableAgents.length > 0 && (
        <div className="mb-6">
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">Add to schedule</p>
          <div className="flex flex-wrap gap-2">
            {availableAgents.map(a => (
              <button key={a.slug} onClick={() => enableAgent(a)}
                className="text-xs px-3 py-1.5 rounded-lg border border-gray-700 text-gray-400 hover:text-white hover:border-indigo-600 hover:bg-indigo-950/20 transition-colors">
                + {a.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : runs.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-gray-800 rounded-2xl">
          <p className="text-2xl mb-3">🕐</p>
          <p className="text-gray-500 font-medium">No scheduled agents yet</p>
          <p className="text-gray-700 text-sm mt-1">Add agents above to run them automatically on a schedule.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {runs.map(run => (
            <div key={run.id} className={`bg-gray-900/60 border rounded-2xl p-5 transition-colors ${run.enabled ? "border-gray-800" : "border-gray-800/40 opacity-60"}`}>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-semibold text-white">{run.agentName}</p>
                    {run.enabled
                      ? <span className="text-[10px] bg-emerald-950/60 border border-emerald-800/40 text-emerald-400 rounded-full px-1.5 py-0.5 font-semibold">● Scheduled</span>
                      : <span className="text-[10px] bg-gray-900 border border-gray-700 text-gray-600 rounded-full px-1.5 py-0.5">Paused</span>}
                    {run.lastChangePct !== null && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${run.lastChangePct >= run.changeThreshold ? "text-amber-400 border-amber-800/40 bg-amber-950/30" : "text-gray-600 border-gray-700 bg-gray-900"}`}>
                        {run.lastChangePct}% Δ last run
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">Last run: {timeAgo(run.lastRunAt)}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <select
                    value={run.cronExpression}
                    onChange={e => updateCron(run.id, e.target.value)}
                    className="text-xs bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-gray-300 focus:outline-none focus:border-indigo-500"
                  >
                    {CRON_PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                    <option value={run.cronExpression}>Custom: {run.cronExpression}</option>
                  </select>
                  <button
                    onClick={() => runNow(run)}
                    disabled={running === run.id}
                    className="text-xs px-3 py-1.5 rounded-lg border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 disabled:opacity-40 transition-colors"
                  >
                    {running === run.id ? "Running…" : "▶ Run Now"}
                  </button>
                  <button
                    onClick={() => toggle(run.id, !run.enabled)}
                    className={`text-xs px-3 py-1.5 rounded-lg border font-semibold transition-colors ${run.enabled ? "border-gray-700 text-gray-400 hover:border-red-800 hover:text-red-400" : "border-emerald-800/50 text-emerald-400 hover:bg-emerald-950/30"}`}
                  >
                    {run.enabled ? "Pause" : "Resume"}
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-800/60 text-xs text-gray-600">
                <span>Schedule: <span className="text-gray-400 font-mono">{run.cronExpression}</span></span>
                <span>Alert when &gt; <span className="text-gray-400">{run.changeThreshold}%</span> change</span>
                <span>Notifications: <span className="text-gray-400">{run.notifyOnChange ? "On" : "Off"}</span></span>
              </div>
            </div>
          ))}
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-3 rounded-xl text-sm font-semibold shadow-2xl z-50 bg-gray-900 border border-gray-700 text-white max-w-sm text-center">
          {toast}
        </div>
      )}
    </div>
  )
}
