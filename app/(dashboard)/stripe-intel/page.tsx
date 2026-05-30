"use client"

import { useState } from "react"

type Analysis = {
  headline: string
  mrr: number
  arr: number
  churnRate: number
  failedPaymentRate: number
  avgRevenuePerCustomer: number
  healthScore: number
  topInsights: string[]
  urgentActions: string[]
  growthOpportunities: string[]
}

type Stats = {
  totalRevenue: string
  totalCharges: number
  failedCharges: number
  activeSubscriptions: number
  cancelledSubscriptions: number
}

type Result = { analysis: Analysis; stats: Stats }

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-xl font-bold text-white">{value}</p>
      {sub ? <p className="text-xs text-gray-500 mt-0.5">{sub}</p> : null}
    </div>
  )
}

function ListCard({ title, items, color }: { title: string; items: string[]; color: "violet" | "red" | "green" }) {
  const colors = {
    violet: "text-violet-400 border-violet-800/40 bg-violet-900/10",
    red: "text-red-400 border-red-800/40 bg-red-900/10",
    green: "text-green-400 border-green-800/40 bg-green-900/10",
  }
  const dotColors = {
    violet: "bg-violet-400",
    red: "bg-red-400",
    green: "bg-green-400",
  }
  return (
    <div className={`border rounded-xl p-4 ${colors[color]}`}>
      <h3 className="font-semibold text-sm mb-3">{title}</h3>
      {Array.isArray(items) && items.length > 0 ? (
        <ul className="space-y-2">
          {items.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
              <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${dotColors[color]}`} />
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-500">None identified.</p>
      )}
    </div>
  )
}

function HealthScore({ score }: { score: number }) {
  const color = score >= 70 ? "text-green-400" : score >= 40 ? "text-amber-400" : "text-red-400"
  const barColor = score >= 70 ? "bg-green-500" : score >= 40 ? "bg-amber-500" : "bg-red-500"
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
      <p className="text-xs text-gray-500 mb-2">Business Health Score</p>
      <div className="flex items-end gap-3 mb-2">
        <p className={`text-3xl font-bold ${color}`}>{score}</p>
        <p className="text-gray-500 text-sm mb-1">/ 100</p>
      </div>
      <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${Math.min(100, score)}%` }} />
      </div>
    </div>
  )
}

export default function StripeIntelPage() {
  const [stripeKey, setStripeKey] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [result, setResult] = useState<Result | null>(null)

  async function handleAnalyze() {
    setLoading(true)
    setError("")
    setResult(null)
    try {
      const res = await fetch("/api/agents/stripe-intel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "analyze", stripeKey }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? "Analysis failed")
      }
      setResult(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center text-lg">💳</div>
          <h1 className="text-2xl font-bold">Stripe Intelligence Agent</h1>
        </div>
        <p className="text-gray-400">Instant AI analysis of your Stripe revenue, churn, and growth opportunities.</p>
      </div>

      {/* Info banner */}
      <div className="mb-6 flex items-start gap-3 bg-violet-900/20 border border-violet-700/40 rounded-xl p-4">
        <span className="text-violet-400 mt-0.5 shrink-0">ℹ</span>
        <p className="text-sm text-violet-300">
          Your key is <strong>never stored</strong> — it is used for one request and discarded. Only use a <strong>read-only restricted key</strong> in production. Create one in <strong>Stripe Dashboard → Developers → API keys → Restricted keys</strong>.
        </p>
      </div>

      {/* Input */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Stripe Secret Key</label>
            <input
              type="password"
              value={stripeKey}
              onChange={e => setStripeKey(e.target.value)}
              placeholder="sk_live_... or sk_test_..."
              className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-600 text-sm focus:outline-none focus:border-violet-500"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={handleAnalyze}
              disabled={loading || !stripeKey}
              className="px-6 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-semibold rounded-xl transition"
            >
              {loading ? "Analyzing…" : "Analyze My Stripe Data"}
            </button>
          </div>
        </div>
      </div>

      {error ? (
        <div className="mb-6 flex items-center gap-2 bg-red-900/20 border border-red-700/40 rounded-xl p-4">
          <span className="text-red-400 shrink-0">✕</span>
          <p className="text-sm text-red-300">{error}</p>
        </div>
      ) : null}

      {loading ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 flex items-center justify-center">
          <div className="text-center">
            <div className="w-10 h-10 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-400 text-sm">Fetching your Stripe data and running AI analysis…</p>
            <p className="text-gray-600 text-xs mt-1">This may take 10–15 seconds</p>
          </div>
        </div>
      ) : null}

      {result ? (
        <div className="space-y-6">
          {/* Headline */}
          <div className="bg-violet-900/20 border border-violet-700/40 rounded-xl p-4">
            <p className="text-sm text-violet-300 font-medium">{result.analysis.headline}</p>
          </div>

          {/* Raw stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="30-Day Revenue" value={`$${result.stats.totalRevenue}`} sub={`${result.stats.totalCharges} charges`} />
            <StatCard label="Active Subscriptions" value={String(result.stats.activeSubscriptions)} sub={`${result.stats.cancelledSubscriptions} cancelled (all time)`} />
            <StatCard label="Failed Charges" value={String(result.stats.failedCharges)} sub={result.stats.totalCharges > 0 ? `${((result.stats.failedCharges / result.stats.totalCharges) * 100).toFixed(1)}% rate` : undefined} />
            <HealthScore score={result.analysis.healthScore} />
          </div>

          {/* AI metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Est. MRR" value={`$${Number(result.analysis.mrr).toLocaleString()}`} />
            <StatCard label="Est. ARR" value={`$${Number(result.analysis.arr).toLocaleString()}`} />
            <StatCard label="Churn Rate" value={`${result.analysis.churnRate}%`} />
            <StatCard label="Avg Revenue / Customer" value={`$${Number(result.analysis.avgRevenuePerCustomer).toLocaleString()}`} />
          </div>

          {/* Insights, actions, opportunities */}
          <div className="grid md:grid-cols-3 gap-4">
            <ListCard title="Top Insights" items={result.analysis.topInsights} color="violet" />
            <ListCard title="Urgent Actions" items={result.analysis.urgentActions} color="red" />
            <ListCard title="Growth Opportunities" items={result.analysis.growthOpportunities} color="green" />
          </div>

          {/* Raw JSON */}
          <details className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <summary className="px-4 py-3 text-xs text-gray-500 cursor-pointer hover:text-gray-300 transition select-none">
              Raw JSON response
            </summary>
            <pre className="px-4 pb-4 text-xs text-gray-400 whitespace-pre-wrap overflow-auto max-h-64">
              {JSON.stringify(result, null, 2)}
            </pre>
          </details>
        </div>
      ) : null}
    </div>
  )
}
