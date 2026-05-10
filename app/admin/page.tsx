"use client"

import { useState } from "react"
import Link from "next/link"

interface Stats {
  totalUsers: number
  totalBusinesses: number
  totalContent: number
  totalReviews: number
  totalLeads: number
  approvedContent: number
  pendingContent: number
  avgRating: string
}

interface PlanCount { plan: string; _count: number }
interface User { id: string; email: string; name: string | null; plan: string; createdAt: string }
interface Business {
  id: string; name: string; type: string; createdAt: string
  user: { email: string }
  _count: { content: number; reviews: number; leads: number }
}

interface AdminData {
  stats: Stats
  planDistribution: PlanCount[]
  recentUsers: User[]
  recentBusinesses: Business[]
}

const PLAN_COLORS: Record<string, string> = {
  FREE: "text-gray-400 bg-gray-900 border-gray-700",
  STARTER: "text-blue-400 bg-blue-950/40 border-blue-800/50",
  GROWTH: "text-indigo-400 bg-indigo-950/40 border-indigo-800/50",
  PRO: "text-violet-400 bg-violet-950/40 border-violet-800/50",
  AGENCY_STARTER: "text-emerald-400 bg-emerald-950/40 border-emerald-800/50",
  AGENCY_GROWTH: "text-cyan-400 bg-cyan-950/40 border-cyan-800/50",
  AGENCY_PREMIUM: "text-amber-400 bg-amber-950/40 border-amber-800/50",
}

export default function AdminPage() {
  const [password, setPassword] = useState("")
  const [data, setData] = useState<AdminData | null>(null)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<"overview" | "users" | "businesses">("overview")

  async function login() {
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      })
      const json = await res.json()
      if (!res.ok) { setError("Wrong password"); return }
      setData(json)
    } catch {
      setError("Failed to connect")
    } finally {
      setLoading(false)
    }
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-3 mb-8 justify-center">
            <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center">
              <span className="text-white font-bold text-sm">AP</span>
            </div>
            <span className="font-bold text-xl text-white">AutoPilot Admin</span>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8">
            <h1 className="text-lg font-bold text-white mb-1">Admin Access</h1>
            <p className="text-sm text-gray-500 mb-6">Enter your admin password to continue.</p>
            <input
              type="password"
              placeholder="Admin password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === "Enter" && login()}
              className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-600 text-sm focus:outline-none focus:border-indigo-500 mb-3"
            />
            {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
            <button
              onClick={login}
              disabled={loading}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold rounded-xl text-sm transition-colors"
            >
              {loading ? "Verifying…" : "Enter"}
            </button>
          </div>
          <Link href="/" className="block text-center text-xs text-gray-700 hover:text-gray-500 mt-4 transition-colors">
            ← Back to site
          </Link>
        </div>
      </div>
    )
  }

  const { stats, planDistribution, recentUsers, recentBusinesses } = data
  const totalMRR = planDistribution.reduce((sum, p) => {
    const prices: Record<string, number> = { STARTER: 49, GROWTH: 99, PRO: 199, AGENCY_STARTER: 399, AGENCY_GROWTH: 799, AGENCY_PREMIUM: 1599 }
    return sum + (prices[p.plan] ?? 0) * p._count
  }, 0)

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-gray-900 bg-gray-950/95 backdrop-blur px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-xs">AP</span>
            </div>
            <span className="font-bold text-white">Admin Dashboard</span>
            <span className="text-xs bg-red-950/60 border border-red-800/50 text-red-400 px-2 py-0.5 rounded-full">Internal</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="text-sm text-gray-500 hover:text-white transition-colors">App →</Link>
            <button onClick={() => setData(null)} className="text-sm text-gray-600 hover:text-gray-400 transition-colors">Sign out</button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* KPI bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 mb-8">
          {[
            { label: "Total Users", value: stats.totalUsers, sub: "registered accounts", color: "indigo" },
            { label: "Businesses", value: stats.totalBusinesses, sub: "active setups", color: "violet" },
            { label: "MRR (est.)", value: `$${totalMRR.toLocaleString()}`, sub: "monthly recurring", color: "emerald" },
            { label: "Content Generated", value: stats.totalContent, sub: `${stats.approvedContent} approved`, color: "cyan" },
            { label: "Reviews Handled", value: stats.totalReviews, sub: `avg ${stats.avgRating}★`, color: "amber" },
          ].map(k => (
            <div key={k.label} className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <p className="text-2xl font-extrabold text-white mb-0.5">{k.value}</p>
              <p className="text-xs font-semibold text-gray-400">{k.label}</p>
              <p className="text-xs text-gray-700 mt-0.5">{k.sub}</p>
            </div>
          ))}
        </div>

        {/* Plan distribution */}
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          <div className="md:col-span-2 bg-gray-900 border border-gray-800 rounded-2xl p-6">
            <h2 className="font-bold text-white mb-4">Plan Distribution</h2>
            <div className="space-y-3">
              {planDistribution.sort((a,b) => b._count - a._count).map(p => {
                const pct = stats.totalUsers > 0 ? Math.round((p._count / stats.totalUsers) * 100) : 0
                const prices: Record<string, number> = { STARTER: 49, GROWTH: 99, PRO: 199, AGENCY_STARTER: 399, AGENCY_GROWTH: 799, AGENCY_PREMIUM: 1599 }
                const mrr = (prices[p.plan] ?? 0) * p._count
                return (
                  <div key={p.plan} className="flex items-center gap-3">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded border w-32 text-center shrink-0 ${PLAN_COLORS[p.plan] ?? "text-gray-400 bg-gray-900 border-gray-700"}`}>
                      {p.plan.replace("_", " ")}
                    </span>
                    <div className="flex-1 bg-gray-800 rounded-full h-2">
                      <div
                        className="h-2 rounded-full bg-indigo-600 transition-all duration-700"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-sm text-white font-semibold w-8 text-right">{p._count}</span>
                    {mrr > 0 && <span className="text-xs text-emerald-400 w-16 text-right">${mrr}/mo</span>}
                  </div>
                )
              })}
            </div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
            <h2 className="font-bold text-white mb-4">Activity</h2>
            <div className="space-y-4">
              {[
                { label: "Total Leads", value: stats.totalLeads },
                { label: "Pending Content", value: stats.pendingContent },
                { label: "Approved Content", value: stats.approvedContent },
                { label: "Avg Review Rating", value: `${stats.avgRating} ★` },
              ].map(item => (
                <div key={item.label} className="flex justify-between items-center py-2 border-b border-gray-800 last:border-0">
                  <span className="text-sm text-gray-400">{item.label}</span>
                  <span className="text-sm font-bold text-white">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit">
          {(["overview", "users", "businesses"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold capitalize transition-colors ${tab === t ? "bg-indigo-600 text-white" : "text-gray-500 hover:text-white"}`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Users table */}
        {tab === "users" && (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-800">
              <h2 className="font-bold text-white">Recent Sign-ups ({recentUsers.length} shown)</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    {["Email", "Name", "Plan", "Joined"].map(h => (
                      <th key={h} className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recentUsers.map(u => (
                    <tr key={u.id} className="border-b border-gray-900 hover:bg-gray-800/40 transition-colors">
                      <td className="px-6 py-3 text-gray-300">{u.email}</td>
                      <td className="px-6 py-3 text-gray-400">{u.name ?? "—"}</td>
                      <td className="px-6 py-3">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded border ${PLAN_COLORS[u.plan] ?? "text-gray-400 border-gray-700"}`}>
                          {u.plan}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-gray-600 text-xs">{new Date(u.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Businesses table */}
        {tab === "businesses" && (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-800">
              <h2 className="font-bold text-white">Recent Businesses ({recentBusinesses.length} shown)</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    {["Business", "Type", "Owner", "Content", "Reviews", "Leads", "Created"].map(h => (
                      <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recentBusinesses.map(b => (
                    <tr key={b.id} className="border-b border-gray-900 hover:bg-gray-800/40 transition-colors">
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

        {tab === "overview" && (
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
              <h2 className="font-bold text-white mb-4">Recent Sign-ups</h2>
              <div className="space-y-3">
                {recentUsers.slice(0, 8).map(u => (
                  <div key={u.id} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-white">{u.email}</p>
                      <p className="text-xs text-gray-600">{new Date(u.createdAt).toLocaleDateString()}</p>
                    </div>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded border ${PLAN_COLORS[u.plan] ?? "text-gray-400 border-gray-700"}`}>
                      {u.plan}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
              <h2 className="font-bold text-white mb-4">Most Active Businesses</h2>
              <div className="space-y-3">
                {recentBusinesses.slice(0, 8).map(b => (
                  <div key={b.id} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-white">{b.name}</p>
                      <p className="text-xs text-gray-600">{b.type} · {b.user.email}</p>
                    </div>
                    <div className="flex gap-3 text-xs">
                      <span className="text-indigo-400">{b._count.content} posts</span>
                      <span className="text-emerald-400">{b._count.reviews} reviews</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
