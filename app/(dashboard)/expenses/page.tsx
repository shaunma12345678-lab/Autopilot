"use client"
import { useState } from "react"

type Tab = "analyze" | "budget"
type Expense = { category: string; amount: number; vendor: string; description: string }

export default function ExpensesPage() {
  const [tab, setTab] = useState<Tab>("analyze")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<unknown>(null)
  const [error, setError] = useState("")

  const [expenses, setExpenses] = useState<Expense[]>([{ category: "", amount: 0, vendor: "", description: "" }])
  const [monthlyRevenue, setMonthlyRevenue] = useState("")
  const [budgetForm, setBudgetForm] = useState({ currentMonthlyRevenue: "", targetMonthlyRevenue: "", timeframeMonths: "12" })

  function addExpense() { setExpenses(e => [...e, { category: "", amount: 0, vendor: "", description: "" }]) }
  function updateExpense(i: number, field: keyof Expense, value: string | number) {
    setExpenses(e => e.map((exp, idx) => idx === i ? { ...exp, [field]: value } : exp))
  }
  function removeExpense(i: number) { setExpenses(e => e.filter((_, idx) => idx !== i)) }

  async function generate() {
    setLoading(true); setError(""); setResult(null)
    try {
      let body: Record<string, unknown> = { action: tab }
      if (tab === "analyze") {
        body = { ...body, monthlyRevenue: Number(monthlyRevenue), monthlyExpenses: expenses.filter(e => e.category && e.amount > 0) }
      }
      if (tab === "budget") {
        const currentExpenses: Record<string, number> = {}
        expenses.filter(e => e.category && e.amount > 0).forEach(e => { currentExpenses[e.category] = (currentExpenses[e.category] || 0) + e.amount })
        body = { ...body, currentMonthlyRevenue: Number(budgetForm.currentMonthlyRevenue), targetMonthlyRevenue: Number(budgetForm.targetMonthlyRevenue), timeframeMonths: Number(budgetForm.timeframeMonths), currentExpenses }
      }

      const res = await fetch("/api/agents/expenses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      if (!res.ok) throw new Error(await res.text())
      setResult(await res.json())
    } catch (e) { setError(e instanceof Error ? e.message : "Failed") }
    finally { setLoading(false) }
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-teal-500/20 border border-teal-500/30 flex items-center justify-center text-lg">📊</div>
          <h1 className="text-2xl font-bold">Expense Analyzer Agent</h1>
        </div>
        <p className="text-gray-400">Find the money hiding in your expenses. Get savings opportunities, negotiation scripts, and a budget plan to hit your revenue goals.</p>
      </div>

      <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit mb-6">
        {([["analyze", "Analyze Expenses"], ["budget", "Budget Plan"]] as const).map(([id, label]) => (
          <button key={id} onClick={() => { setTab(id); setResult(null) }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === id ? "bg-teal-600 text-white" : "text-gray-400 hover:text-white"}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
          {tab === "analyze" && <>
            <p className="text-sm text-gray-400">Enter your monthly expenses to find savings, get negotiation scripts, and benchmark against your industry.</p>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Monthly revenue ($)</label>
              <input value={monthlyRevenue} onChange={e => setMonthlyRevenue(e.target.value)} placeholder="e.g. 15000"
                className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-600 text-sm focus:outline-none focus:border-teal-500" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-gray-400">Monthly expenses</label>
                <button onClick={addExpense} className="text-xs text-teal-400 hover:text-teal-300">+ Add row</button>
              </div>
              <div className="space-y-2">
                {expenses.map((exp, i) => (
                  <div key={i} className="grid grid-cols-4 gap-1">
                    <input value={exp.category} onChange={e => updateExpense(i, "category", e.target.value)} placeholder="Category" className="col-span-2 px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-xs focus:outline-none focus:border-teal-500" />
                    <input value={exp.amount || ""} onChange={e => updateExpense(i, "amount", Number(e.target.value))} placeholder="$" type="number" className="px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-xs focus:outline-none focus:border-teal-500" />
                    <div className="flex gap-1">
                      <input value={exp.vendor} onChange={e => updateExpense(i, "vendor", e.target.value)} placeholder="Vendor" className="flex-1 px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-xs focus:outline-none focus:border-teal-500" />
                      {expenses.length > 1 && <button onClick={() => removeExpense(i)} className="text-gray-600 hover:text-red-400 text-xs px-1">✕</button>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>}

          {tab === "budget" && <>
            <p className="text-sm text-gray-400">Build a budget plan to get from your current revenue to your target with a month-by-month roadmap.</p>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Current monthly revenue ($)</label>
              <input value={budgetForm.currentMonthlyRevenue} onChange={e => setBudgetForm(f => ({ ...f, currentMonthlyRevenue: e.target.value }))} placeholder="e.g. 8000"
                className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-600 text-sm focus:outline-none focus:border-teal-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Target monthly revenue ($)</label>
              <input value={budgetForm.targetMonthlyRevenue} onChange={e => setBudgetForm(f => ({ ...f, targetMonthlyRevenue: e.target.value }))} placeholder="e.g. 25000"
                className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-600 text-sm focus:outline-none focus:border-teal-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Timeframe (months)</label>
              <input value={budgetForm.timeframeMonths} onChange={e => setBudgetForm(f => ({ ...f, timeframeMonths: e.target.value }))} placeholder="12"
                className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-600 text-sm focus:outline-none focus:border-teal-500" />
            </div>
            <p className="text-xs text-gray-500">Add current expenses above for a more accurate budget plan.</p>
          </>}

          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button onClick={generate} disabled={loading} className="w-full py-3 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white font-semibold rounded-xl transition">
            {loading ? "Analyzing…" : tab === "analyze" ? "Find Savings" : "Build Budget Plan"}
          </button>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 overflow-auto max-h-[600px]">
          {!result && !loading && <div className="h-full flex items-center justify-center"><p className="text-gray-600 text-sm text-center">Your expense analysis will appear here.</p></div>}
          {loading && <div className="h-full flex items-center justify-center"><div className="text-center"><div className="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" /><p className="text-gray-400 text-sm">Finding your savings opportunities…</p></div></div>}
          {result ? <ExpenseResult data={result} /> : null}
        </div>
      </div>
    </div>
  )
}

function ExpenseResult({ data }: { data: unknown }) {
  const d = data as Record<string, unknown>
  return (
    <div className="space-y-4">
      {d.totalPotentialMonthlySavings !== undefined && (
        <div className="border border-teal-800/40 bg-teal-950/20 rounded-lg p-4">
          <p className="text-xs text-teal-400 font-bold mb-1">POTENTIAL MONTHLY SAVINGS</p>
          <p className="text-2xl font-extrabold text-white">${Number(d.totalPotentialMonthlySavings).toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-1">{String(d.benchmarkComparison ?? "")}</p>
        </div>
      )}
      {Array.isArray(d.savingsOpportunities) ? (
        <div>
          <h3 className="text-xs font-bold text-white mb-2">Top Savings Opportunities</h3>
          {(d.savingsOpportunities as Array<Record<string, unknown>>).slice(0, 5).map((s, i) => (
            <div key={i} className="border border-gray-700 rounded-lg p-3 mb-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-semibold text-white">{String(s.item)}</span>
                <span className="text-sm font-bold text-teal-400">${Number(s.estimatedMonthlySavings).toLocaleString()}/mo</span>
              </div>
              <p className="text-xs text-gray-400">{String(s.suggestedAction)}</p>
              <span className={`inline-block text-xs mt-1 px-2 py-0.5 rounded-full ${s.difficulty === "easy" ? "bg-emerald-900/50 text-emerald-400" : s.difficulty === "medium" ? "bg-amber-900/50 text-amber-400" : "bg-red-900/50 text-red-400"}`}>{String(s.difficulty)}</span>
            </div>
          ))}
        </div>
      ) : null}
      <pre className="text-xs text-gray-500 whitespace-pre-wrap">{JSON.stringify(data, null, 2)}</pre>
    </div>
  )
}
