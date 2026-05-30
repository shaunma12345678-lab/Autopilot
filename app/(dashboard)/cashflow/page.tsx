"use client"
import { useState } from "react"

type ForecastRow = {
  month: string
  openingBalance: number
  revenue: number
  expenses: number
  netFlow: number
  closingBalance: number
  flag: string
  scenario: string
}

type ScenarioSummary = {
  month3Balance: number
  month6Balance: number
  summary: string
}

export default function CashFlowPage() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<unknown>(null)
  const [error, setError] = useState("")

  const [form, setForm] = useState({
    currentCashBalance: "",
    monthlyRevenue: "",
    monthlyFixedExpenses: "",
    monthlyVariableExpenses: "",
    accountsReceivable: "",
    accountsPayable: "",
    revenueGrowthRate: "5",
    upcomingLargeExpenses: "",
    seasonalNotes: "",
  })

  function set(field: keyof typeof form, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function forecast() {
    setLoading(true); setError(""); setResult(null)
    try {
      const res = await fetch("/api/agents/cashflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "forecast",
          currentCashBalance: Number(form.currentCashBalance),
          monthlyRevenue: Number(form.monthlyRevenue),
          monthlyFixedExpenses: Number(form.monthlyFixedExpenses),
          monthlyVariableExpenses: Number(form.monthlyVariableExpenses),
          accountsReceivable: Number(form.accountsReceivable),
          accountsPayable: Number(form.accountsPayable),
          revenueGrowthRate: Number(form.revenueGrowthRate),
          upcomingLargeExpenses: form.upcomingLargeExpenses,
          seasonalNotes: form.seasonalNotes,
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      setResult(await res.json())
    } catch (e) { setError(e instanceof Error ? e.message : "Failed") }
    finally { setLoading(false) }
  }

  const inputCls = "w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-600 text-sm focus:outline-none focus:border-teal-500"
  const labelCls = "block text-xs font-medium text-gray-400 mb-1.5"

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-teal-500/20 border border-teal-500/30 flex items-center justify-center text-lg">💰</div>
          <h1 className="text-2xl font-bold">Cash Flow Forecaster</h1>
        </div>
        <p className="text-gray-400">Get a 6-month cash flow forecast with base, optimistic, and conservative scenarios.</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Cash on hand ($)</label>
              <input type="number" value={form.currentCashBalance} onChange={e => set("currentCashBalance", e.target.value)} placeholder="25000" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Monthly revenue ($)</label>
              <input type="number" value={form.monthlyRevenue} onChange={e => set("monthlyRevenue", e.target.value)} placeholder="20000" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Monthly fixed expenses ($)</label>
              <input type="number" value={form.monthlyFixedExpenses} onChange={e => set("monthlyFixedExpenses", e.target.value)} placeholder="8000" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Monthly variable expenses ($)</label>
              <input type="number" value={form.monthlyVariableExpenses} onChange={e => set("monthlyVariableExpenses", e.target.value)} placeholder="4000" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Accounts receivable ($)</label>
              <input type="number" value={form.accountsReceivable} onChange={e => set("accountsReceivable", e.target.value)} placeholder="12000" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Accounts payable ($)</label>
              <input type="number" value={form.accountsPayable} onChange={e => set("accountsPayable", e.target.value)} placeholder="5000" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Monthly revenue growth (%)</label>
              <input type="number" value={form.revenueGrowthRate} onChange={e => set("revenueGrowthRate", e.target.value)} placeholder="5" className={inputCls} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Upcoming large expenses</label>
            <input value={form.upcomingLargeExpenses} onChange={e => set("upcomingLargeExpenses", e.target.value)} placeholder="e.g. New equipment $8,000 in Month 2" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Seasonal notes</label>
            <input value={form.seasonalNotes} onChange={e => set("seasonalNotes", e.target.value)} placeholder="e.g. Q4 is 40% of annual revenue" className={inputCls} />
          </div>
          {error ? <p className="text-red-400 text-sm">{error}</p> : null}
          <button onClick={forecast} disabled={loading} className="w-full py-3 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white font-semibold rounded-xl transition">
            {loading ? "Forecasting…" : "Forecast My Cash Flow"}
          </button>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 overflow-auto max-h-[700px]">
          {!result && !loading ? (
            <div className="h-full flex items-center justify-center">
              <p className="text-gray-600 text-sm text-center">Your cash flow forecast will appear here.</p>
            </div>
          ) : null}
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <div className="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-gray-400 text-sm">Building your 6-month forecast…</p>
              </div>
            </div>
          ) : null}
          {result ? <CashFlowResult data={result} /> : null}
        </div>
      </div>
    </div>
  )
}

function CashFlowResult({ data }: { data: unknown }) {
  const d = data as Record<string, unknown>
  const score = Number(d.healthScore ?? 0)
  const scoreBadge = score >= 70 ? "bg-emerald-900/50 text-emerald-400 border-emerald-700/50" : score >= 40 ? "bg-amber-900/50 text-amber-400 border-amber-700/50" : "bg-red-900/50 text-red-400 border-red-700/50"

  const scenarios = d.scenarios as Record<string, ScenarioSummary> | undefined
  const forecast = Array.isArray(d.forecast) ? (d.forecast as ForecastRow[]) : []
  const baseRows = forecast.filter(r => r.scenario === "base")
  const risks = Array.isArray(d.cashFlowRisks) ? (d.cashFlowRisks as string[]) : []
  const actions = Array.isArray(d.topActions) ? (d.topActions as string[]) : []
  const warnings = Array.isArray(d.warningFlags) ? (d.warningFlags as string[]) : []

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-lg font-bold text-white">{String(d.headline ?? "")}</p>
          <p className="text-sm text-gray-400 mt-1">Runway: {String(d.currentRunway ?? "")} · Break-even: {String(d.breakEvenDate ?? "")}</p>
        </div>
        <span className={`px-3 py-1 rounded-full text-sm font-bold border ${scoreBadge} shrink-0`}>Health: {score}/100</span>
      </div>

      {warnings.length > 0 ? (
        <div className="bg-red-950/20 border border-red-800/40 rounded-lg p-3">
          <p className="text-xs font-bold text-red-400 mb-1">WARNING FLAGS</p>
          {warnings.map((w, i) => <p key={i} className="text-xs text-red-300">{w}</p>)}
        </div>
      ) : null}

      {scenarios ? (
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">6-Month Scenarios</p>
          <div className="grid grid-cols-3 gap-2">
            {(["base", "optimistic", "conservative"] as const).map(key => {
              const s = scenarios[key]
              if (!s) return null
              const isOpt = key === "optimistic"
              const isCons = key === "conservative"
              const color = isOpt ? "border-emerald-700/50 bg-emerald-950/20" : isCons ? "border-red-700/50 bg-red-950/20" : "border-teal-700/50 bg-teal-950/20"
              const label = key.charAt(0).toUpperCase() + key.slice(1)
              return (
                <div key={key} className={`border rounded-lg p-3 ${color}`}>
                  <p className="text-xs font-bold text-gray-400 mb-2">{label}</p>
                  <p className="text-xs text-gray-500">Mo. 3</p>
                  <p className="text-sm font-bold text-white">${Number(s.month3Balance).toLocaleString()}</p>
                  <p className="text-xs text-gray-500 mt-1">Mo. 6</p>
                  <p className="text-sm font-bold text-white">${Number(s.month6Balance).toLocaleString()}</p>
                  <p className="text-xs text-gray-400 mt-2">{s.summary}</p>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      {baseRows.length > 0 ? (
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Base Case Forecast</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b border-gray-800">
                  <th className="text-left py-2 pr-3">Month</th>
                  <th className="text-right py-2 pr-3">Revenue</th>
                  <th className="text-right py-2 pr-3">Expenses</th>
                  <th className="text-right py-2 pr-3">Net</th>
                  <th className="text-right py-2">Closing</th>
                </tr>
              </thead>
              <tbody>
                {baseRows.map((row, i) => {
                  const rowColor = row.flag === "green" ? "text-emerald-400" : row.flag === "red" ? "text-red-400" : "text-amber-400"
                  return (
                    <tr key={i} className="border-b border-gray-800/50">
                      <td className="py-1.5 pr-3 text-gray-300">{row.month}</td>
                      <td className="text-right pr-3 text-gray-300">${Number(row.revenue).toLocaleString()}</td>
                      <td className="text-right pr-3 text-gray-300">${Number(row.expenses).toLocaleString()}</td>
                      <td className={`text-right pr-3 font-semibold ${rowColor}`}>${Number(row.netFlow).toLocaleString()}</td>
                      <td className="text-right font-bold text-white">${Number(row.closingBalance).toLocaleString()}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {risks.length > 0 ? (
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Cash Flow Risks</p>
          <div className="flex flex-wrap gap-2">
            {risks.map((r, i) => (
              <span key={i} className="px-2 py-1 bg-amber-900/30 border border-amber-700/40 text-amber-300 text-xs rounded-full">{r}</span>
            ))}
          </div>
        </div>
      ) : null}

      {actions.length > 0 ? (
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Top Actions</p>
          <ol className="space-y-1.5">
            {actions.map((a, i) => (
              <li key={i} className="flex gap-2 text-sm text-gray-300">
                <span className="text-teal-400 font-bold shrink-0">{i + 1}.</span>
                {a}
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <details className="mt-4">
        <summary className="text-xs text-gray-600 cursor-pointer hover:text-gray-400">Raw JSON</summary>
        <pre className="text-xs text-gray-500 whitespace-pre-wrap mt-2">{JSON.stringify(data, null, 2)}</pre>
      </details>
    </div>
  )
}
