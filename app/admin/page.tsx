"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"

/* ── Types ── */
interface Stats { totalUsers: number; totalBusinesses: number; totalContent: number; totalReviews: number; totalLeads: number; approvedContent: number; pendingContent: number; avgRating: string }
interface PlanCount { plan: string; _count: number }
interface User { id: string; email: string; name: string | null; plan: string; createdAt: string }
interface Business { id: string; name: string; type: string; createdAt: string; user: { email: string }; _count: { content: number; reviews: number; leads: number } }
interface AdminData { stats: Stats; planDistribution: PlanCount[]; recentUsers: User[]; recentBusinesses: Business[] }

interface Agent {
  id: string; name: string; color: string; status: "active" | "idle" | "error"
  last24h: number; lastHour: number; queueSize: number; successRate: number; description: string
}
interface FeedItem { agentId: string; agentName: string; color: string; msg: string; status: string; ts: string }
interface AgentData { agents: Agent[]; activityFeed: FeedItem[] }

/* ── Color maps ── */
const PLAN_COLORS: Record<string, string> = {
  FREE: "text-gray-400 bg-gray-900 border-gray-700",
  STARTER: "text-blue-400 bg-blue-950/40 border-blue-800/50",
  GROWTH: "text-indigo-400 bg-indigo-950/40 border-indigo-800/50",
  PRO: "text-violet-400 bg-violet-950/40 border-violet-800/50",
  AGENCY_STARTER: "text-emerald-400 bg-emerald-950/40 border-emerald-800/50",
  AGENCY_GROWTH: "text-cyan-400 bg-cyan-950/40 border-cyan-800/50",
  AGENCY_PREMIUM: "text-amber-400 bg-amber-950/40 border-amber-800/50",
}

const AGENT_COLORS: Record<string, { text: string; bg: string; border: string; bar: string; dot: string }> = {
  indigo:  { text: "text-indigo-400",  bg: "bg-indigo-950/30",  border: "border-indigo-800/40",  bar: "bg-indigo-500",  dot: "bg-indigo-400" },
  emerald: { text: "text-emerald-400", bg: "bg-emerald-950/30", border: "border-emerald-800/40", bar: "bg-emerald-500", dot: "bg-emerald-400" },
  violet:  { text: "text-violet-400",  bg: "bg-violet-950/30",  border: "border-violet-800/40",  bar: "bg-violet-500",  dot: "bg-violet-400" },
  cyan:    { text: "text-cyan-400",    bg: "bg-cyan-950/30",    border: "border-cyan-800/40",    bar: "bg-cyan-500",    dot: "bg-cyan-400" },
  orange:  { text: "text-orange-400",  bg: "bg-orange-950/30",  border: "border-orange-800/40",  bar: "bg-orange-500",  dot: "bg-orange-400" },
  pink:    { text: "text-pink-400",    bg: "bg-pink-950/30",    border: "border-pink-800/40",    bar: "bg-pink-500",    dot: "bg-pink-400" },
  amber:   { text: "text-amber-400",   bg: "bg-amber-950/30",   border: "border-amber-800/40",   bar: "bg-amber-500",   dot: "bg-amber-400" },
  teal:    { text: "text-teal-400",    bg: "bg-teal-950/30",    border: "border-teal-800/40",    bar: "bg-teal-500",    dot: "bg-teal-400" },
}

function timeAgo(ts: string) {
  const ms = Date.now() - new Date(ts).getTime()
  if (ms < 60000)   return `${Math.floor(ms / 1000)}s ago`
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ago`
  if (ms < 86400000)return `${Math.floor(ms / 3600000)}h ago`
  return `${Math.floor(ms / 86400000)}d ago`
}

/* ═══════════════════════════════════════════════════════
   AGENT CARD
═══════════════════════════════════════════════════════ */
function AgentCard({ agent }: { agent: Agent }) {
  const c = AGENT_COLORS[agent.color] ?? AGENT_COLORS.indigo
  const isActive = agent.status === "active"

  return (
    <div className={`rounded-2xl border p-5 flex flex-col gap-4 ${c.bg} ${c.border}`}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          {/* Status ring + dot */}
          <div className="relative">
            <div className={`w-3 h-3 rounded-full ${c.dot} ${isActive ? "animate-pulse" : "opacity-40"}`} />
            {isActive && (
              <div className={`absolute inset-0 rounded-full ${c.dot} opacity-30 animate-ping`} style={{ animationDuration: "2s" }} />
            )}
          </div>
          <div>
            <p className="font-bold text-white text-sm">{agent.name}</p>
            <p className="text-xs text-gray-600 mt-0.5">{agent.description}</p>
          </div>
        </div>
        <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${isActive ? `${c.bg} ${c.border} ${c.text}` : "bg-gray-900 border-gray-800 text-gray-600"}`}>
          {isActive ? "● Active" : "○ Idle"}
        </span>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Last 24h",     value: agent.last24h },
          { label: "Last hour",    value: agent.lastHour },
          { label: "Queue",        value: agent.queueSize },
        ].map(s => (
          <div key={s.label} className="bg-black/20 rounded-xl p-2.5 text-center">
            <p className={`text-xl font-extrabold ${c.text}`}>{s.value}</p>
            <p className="text-xs text-gray-700 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Success rate bar */}
      <div>
        <div className="flex justify-between text-xs mb-1.5">
          <span className="text-gray-600">Success rate</span>
          <span className={`font-bold ${c.text}`}>{agent.successRate}%</span>
        </div>
        <div className="h-1.5 bg-black/30 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${c.bar} transition-all duration-700`} style={{ width: `${agent.successRate}%` }} />
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════════════ */
export default function AdminPage() {
  const [password, setPassword]     = useState("")
  const [data, setData]             = useState<AdminData | null>(null)
  const [agentData, setAgentData]   = useState<AgentData | null>(null)
  const [error, setError]           = useState("")
  const [loading, setLoading]       = useState(false)
  const [tab, setTab]               = useState<"overview" | "agents" | "users" | "businesses">("overview")
  const [agentRefresh, setAgentRefresh] = useState(0)
  const [lastUpdated, setLastUpdated]   = useState<Date | null>(null)

  const authedPassword = typeof window !== "undefined" ? sessionStorage.getItem("ap_admin_pw") ?? "" : ""

  const loadAgents = useCallback(async (pw: string) => {
    const res = await fetch("/api/admin/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pw }),
    })
    if (res.ok) {
      const json = await res.json()
      setAgentData(json)
      setLastUpdated(new Date())
    }
  }, [])

  async function login() {
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      })
      if (!res.ok) { setError("Wrong password"); return }
      const json = await res.json()
      setData(json)
      sessionStorage.setItem("ap_admin_pw", password)
      await loadAgents(password)
    } catch { setError("Failed to connect") }
    finally { setLoading(false) }
  }

  useEffect(() => {
    if (!data) return
    const pw = sessionStorage.getItem("ap_admin_pw") ?? ""
    const id = setInterval(() => { loadAgents(pw); setAgentRefresh(n => n + 1) }, 15000)
    return () => clearInterval(id)
  }, [data, loadAgents])

  /* ── Login screen ── */
  if (!data) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-3 mb-8 justify-center">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg" style={{ background: "linear-gradient(135deg,#4f46e5,#7c3aed)" }}>
              <span className="text-white font-bold">AP</span>
            </div>
            <span className="font-bold text-xl text-white">AutoPilot Admin</span>
          </div>
          <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-8 backdrop-blur">
            <h1 className="text-lg font-bold text-white mb-1">Admin Access</h1>
            <p className="text-sm text-gray-500 mb-6">Enter your admin password to continue.</p>
            <input
              type="password" placeholder="Admin password"
              value={password} onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === "Enter" && login()}
              className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-600 text-sm focus:outline-none focus:border-indigo-500 mb-3"
            />
            {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
            <button onClick={login} disabled={loading} className="w-full py-3 disabled:opacity-50 text-white font-semibold rounded-xl text-sm transition" style={{ background: "linear-gradient(135deg,#4f46e5,#7c3aed)" }}>
              {loading ? "Verifying…" : "Enter"}
            </button>
          </div>
          <Link href="/" className="block text-center text-xs text-gray-700 hover:text-gray-500 mt-4 transition-colors">← Back to site</Link>
        </div>
      </div>
    )
  }

  const { stats, planDistribution, recentUsers, recentBusinesses } = data
  const totalMRR = planDistribution.reduce((sum, p) => {
    const prices: Record<string, number> = { STARTER: 49, GROWTH: 99, PRO: 199, AGENCY_STARTER: 399, AGENCY_GROWTH: 799, AGENCY_PREMIUM: 1599 }
    return sum + (prices[p.plan] ?? 0) * p._count
  }, 0)
  const activeAgents = agentData?.agents.filter(a => a.status === "active").length ?? 0

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-gray-900 bg-gray-950/95 backdrop-blur px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg,#4f46e5,#7c3aed)" }}>
              <span className="text-white font-bold text-xs">AP</span>
            </div>
            <span className="font-bold text-white">Admin Dashboard</span>
            <span className="text-xs bg-red-950/60 border border-red-800/50 text-red-400 px-2 py-0.5 rounded-full">Internal</span>
          </div>
          <div className="flex items-center gap-4">
            {lastUpdated && <span className="text-xs text-gray-700 hidden md:block">Updated {lastUpdated.toLocaleTimeString()}</span>}
            <Link href="/dashboard" className="text-sm text-gray-500 hover:text-white transition-colors">App →</Link>
            <button onClick={() => { setData(null); setAgentData(null); sessionStorage.removeItem("ap_admin_pw") }} className="text-sm text-gray-600 hover:text-gray-400 transition-colors">Sign out</button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* KPI bar */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
          {[
            { label: "Users",      value: stats.totalUsers,      sub: "registered",        color: "indigo" },
            { label: "Businesses", value: stats.totalBusinesses,  sub: "active setups",     color: "violet" },
            { label: "MRR",        value: `$${totalMRR.toLocaleString()}`, sub: "est. monthly", color: "emerald" },
            { label: "Content",    value: stats.totalContent,     sub: `${stats.pendingContent} pending`, color: "cyan" },
            { label: "Reviews",    value: stats.totalReviews,     sub: `${stats.avgRating}★ avg`, color: "amber" },
            { label: "Agents Live",value: activeAgents,           sub: "of 8 active",       color: "pink" },
          ].map(k => (
            <div key={k.label} className="bg-gray-900/80 border border-gray-800 rounded-2xl p-4">
              <p className="text-xl font-extrabold text-white mb-0.5">{k.value}</p>
              <p className="text-xs font-semibold text-gray-400">{k.label}</p>
              <p className="text-xs text-gray-700 mt-0.5">{k.sub}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-gray-900/60 border border-gray-800 rounded-xl p-1 w-fit">
          {(["overview", "agents", "users", "businesses"] as const).map(t => (
            <button
              key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold capitalize transition-colors ${tab === t ? "text-white" : "text-gray-500 hover:text-white"}`}
              style={tab === t ? { background: "linear-gradient(135deg,#4f46e5,#7c3aed)" } : {}}
            >
              {t === "agents" ? `Agents ${agentData ? `(${activeAgents} live)` : ""}` : t}
            </button>
          ))}
        </div>

        {/* ════ AGENTS TAB ════ */}
        {tab === "agents" && (
          <div>
            {!agentData ? (
              <div className="text-center py-16 text-gray-600">Loading agent data…</div>
            ) : (
              <>
                {/* Agent grid */}
                <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
                  {agentData.agents.map(a => <AgentCard key={a.id} agent={a} />)}
                </div>

                {/* Live activity feed */}
                <div className="bg-gray-900/80 border border-gray-800 rounded-2xl overflow-hidden">
                  <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
                    <div className="flex items-center gap-3">
                      <h2 className="font-bold text-white">Live Activity Feed</h2>
                      <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-semibold">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Real-time · refreshes every 15s
                      </span>
                    </div>
                    <button
                      onClick={() => loadAgents(sessionStorage.getItem("ap_admin_pw") ?? "")}
                      className="text-xs text-gray-500 hover:text-white border border-gray-800 hover:border-gray-700 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Refresh now
                    </button>
                  </div>

                  {agentData.activityFeed.length === 0 ? (
                    <div className="text-center py-12 text-gray-600 text-sm">
                      No activity in the last 24 hours.<br />
                      <span className="text-gray-700">Agents are idle — run them from the dashboard to see activity here.</span>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-900">
                      {agentData.activityFeed.map((item, i) => {
                        const c = AGENT_COLORS[item.color] ?? AGENT_COLORS.indigo
                        return (
                          <div key={i} className="flex items-center gap-4 px-6 py-3 hover:bg-gray-900/40 transition-colors">
                            <div className={`w-2 h-2 rounded-full ${c.dot} shrink-0`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-gray-300 truncate">{item.msg}</p>
                              <p className={`text-xs font-medium ${c.text} mt-0.5`}>{item.agentName}</p>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
                                item.status === "APPROVED" || item.status === "CONTACTED" ? "bg-emerald-950/40 border-emerald-800/40 text-emerald-400" :
                                item.status === "PENDING"  ? "bg-amber-950/40 border-amber-800/40 text-amber-400" :
                                "bg-gray-900 border-gray-800 text-gray-500"
                              }`}>{item.status}</span>
                              <span className="text-xs text-gray-700">{timeAgo(item.ts)}</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ════ OVERVIEW TAB ════ */}
        {tab === "overview" && (
          <div>
            <div className="grid md:grid-cols-3 gap-6 mb-6">
              <div className="md:col-span-2 bg-gray-900/80 border border-gray-800 rounded-2xl p-6">
                <h2 className="font-bold text-white mb-4">Plan Distribution</h2>
                <div className="space-y-3">
                  {planDistribution.sort((a,b) => b._count - a._count).map(p => {
                    const pct = stats.totalUsers > 0 ? Math.round((p._count / stats.totalUsers) * 100) : 0
                    const prices: Record<string, number> = { STARTER: 49, GROWTH: 99, PRO: 199, AGENCY_STARTER: 399, AGENCY_GROWTH: 799, AGENCY_PREMIUM: 1599 }
                    const mrr = (prices[p.plan] ?? 0) * p._count
                    return (
                      <div key={p.plan} className="flex items-center gap-3">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded border w-36 text-center shrink-0 ${PLAN_COLORS[p.plan] ?? "text-gray-400 bg-gray-900 border-gray-700"}`}>
                          {p.plan.replace("_", " ")}
                        </span>
                        <div className="flex-1 bg-gray-800/60 rounded-full h-2">
                          <div className="h-2 rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: "linear-gradient(90deg,#4f46e5,#7c3aed)" }} />
                        </div>
                        <span className="text-sm text-white font-semibold w-8 text-right">{p._count}</span>
                        {mrr > 0 && <span className="text-xs text-emerald-400 w-16 text-right">${mrr}/mo</span>}
                      </div>
                    )
                  })}
                </div>
              </div>
              <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-6">
                <h2 className="font-bold text-white mb-4">Activity</h2>
                <div className="space-y-4">
                  {[
                    { label: "Total Leads",       value: stats.totalLeads },
                    { label: "Pending Content",   value: stats.pendingContent },
                    { label: "Approved Content",  value: stats.approvedContent },
                    { label: "Avg Review Rating", value: `${stats.avgRating} ★` },
                  ].map(item => (
                    <div key={item.label} className="flex justify-between items-center py-2 border-b border-gray-800/60 last:border-0">
                      <span className="text-sm text-gray-400">{item.label}</span>
                      <span className="text-sm font-bold text-white">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-6">
                <h2 className="font-bold text-white mb-4">Recent Sign-ups</h2>
                <div className="space-y-3">
                  {recentUsers.slice(0,8).map(u => (
                    <div key={u.id} className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-white">{u.email}</p>
                        <p className="text-xs text-gray-600">{new Date(u.createdAt).toLocaleDateString()}</p>
                      </div>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded border ${PLAN_COLORS[u.plan] ?? "text-gray-400 border-gray-700"}`}>{u.plan}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-6">
                <h2 className="font-bold text-white mb-4">Most Active Businesses</h2>
                <div className="space-y-3">
                  {recentBusinesses.slice(0,8).map(b => (
                    <div key={b.id} className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-white">{b.name}</p>
                        <p className="text-xs text-gray-600">{b.type} · {b.user.email}</p>
                      </div>
                      <div className="flex gap-3 text-xs">
                        <span className="text-indigo-400">{b._count.content}</span>
                        <span className="text-emerald-400">{b._count.reviews}</span>
                        <span className="text-violet-400">{b._count.leads}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ════ USERS TAB ════ */}
        {tab === "users" && (
          <div className="bg-gray-900/80 border border-gray-800 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-800">
              <h2 className="font-bold text-white">Recent Sign-ups ({recentUsers.length} shown)</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    {["Email","Name","Plan","Joined"].map(h => (
                      <th key={h} className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recentUsers.map(u => (
                    <tr key={u.id} className="border-b border-gray-900 hover:bg-gray-800/30 transition-colors">
                      <td className="px-6 py-3 text-gray-300">{u.email}</td>
                      <td className="px-6 py-3 text-gray-400">{u.name ?? "—"}</td>
                      <td className="px-6 py-3">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded border ${PLAN_COLORS[u.plan] ?? "text-gray-400 border-gray-700"}`}>{u.plan}</span>
                      </td>
                      <td className="px-6 py-3 text-gray-600 text-xs">{new Date(u.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ════ BUSINESSES TAB ════ */}
        {tab === "businesses" && (
          <div className="bg-gray-900/80 border border-gray-800 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-800">
              <h2 className="font-bold text-white">Recent Businesses ({recentBusinesses.length} shown)</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    {["Business","Type","Owner","Content","Reviews","Leads","Created"].map(h => (
                      <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recentBusinesses.map(b => (
                    <tr key={b.id} className="border-b border-gray-900 hover:bg-gray-800/30 transition-colors">
                      <td className="px-5 py-3 font-semibold text-white">{b.name}</td>
                      <td className="px-5 py-3 text-gray-400">{b.type}</td>
                      <td className="px-5 py-3 text-gray-500 text-xs">{b.user.email}</td>
                      <td className="px-5 py-3 text-indigo-400 font-bold">{b._count.content}</td>
                      <td className="px-5 py-3 text-emerald-400 font-bold">{b._count.reviews}</td>
                      <td className="px-5 py-3 text-violet-400 font-bold">{b._count.leads}</td>
                      <td className="px-5 py-3 text-gray-600 text-xs">{new Date(b.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
