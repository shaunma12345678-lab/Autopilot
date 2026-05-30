"use client"
import { useState } from "react"

export default function TaxStrategyPage() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<unknown>(null)
  const [error, setError] = useState("")

  const [form, setForm] = useState({
    businessStructure: "LLC",
    annualRevenue: "",
    estimatedProfit: "",
    ownerSalary: "",
    state: "",
    topExpenseCategories: "",
    hasRetirementPlan: false,
    homeOffice: false,
    vehicleUsed: false,
  })

  function setField<K extends keyof typeof form>(field: K, value: typeof form[K]) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function analyze() {
    setLoading(true); setError(""); setResult(null)
    try {
      const res = await fetch("/api/agents/tax-strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "analyze", ...form }),
      })
      if (!res.ok) throw new Error(await res.text())
      setResult(await res.json())
    } catch (e) { setError(e instanceof Error ? e.message : "Failed") }
    finally { setLoading(false) }
  }

  const inputCls = "w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-600 text-sm focus:outline-none focus:border-emerald-500"
  const selectCls = "w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500"
  const labelCls = "block text-xs font-medium text-gray-400 mb-1.5"

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-lg">🏛️</div>
          <h1 className="text-2xl font-bold">Tax Strategy Advisor</h1>
        </div>
        <p className="text-gray-400">Find missed deductions, get quarterly tax estimates, and optimize your business structure to minimize your tax bill.</p>
        <div className="mt-2 text-xs text-amber-400 bg-amber-950/30 border border-amber-800/40 rounded-lg px-3 py-2">
          ⚠ For planning purposes only — consult a CPA or tax attorney before making tax decisions.
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Business structure</label>
              <select value={form.businessStructure} onChange={e => setField("businessStructure", e.target.value)} className={selectCls}>
                <option>Sole Proprietorship</option>
                <option>LLC</option>
                <option>S-Corp</option>
                <option>C-Corp</option>
                <option>Partnership</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>State</label>
              <input value={form.state} onChange={e => setField("state", e.target.value)} placeholder="e.g. California" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Annual revenue ($)</label>
              <input type="number" value={form.annualRevenue} onChange={e => setField("annualRevenue", e.target.value)} placeholder="240000" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Estimated annual profit ($)</label>
              <input type="number" value={form.estimatedProfit} onChange={e => setField("estimatedProfit", e.target.value)} placeholder="80000" className={inputCls} />
            </div>
          </div>

          <div>
            <label className={labelCls}>Owner salary / draw ($) — enter 0 if none</label>
            <input type="number" value={form.ownerSalary} onChange={e => setField("ownerSalary", e.target.value)} placeholder="60000" className={inputCls} />
          </div>

          <div>
            <label className={labelCls}>Top expense categories (comma-separated)</label>
            <input value={form.topExpenseCategories} onChange={e => setField("topExpenseCategories", e.target.value)} placeholder="e.g. payroll, software, marketing, contractor" className={inputCls} />
          </div>

          <div className="space-y-2 pt-1">
            {([
              ["hasRetirementPlan", "Have a retirement plan (SEP-IRA, Solo 401k, etc.)"],
              ["homeOffice", "Use a dedicated home office for business"],
              ["vehicleUsed", "Use a vehicle for business purposes"],
            ] as const).map(([key, label]) => (
              <label key={key} className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form[key]}
                  onChange={e => setField(key, e.target.checked)}
                  className="w-4 h-4 rounded accent-emerald-500"
                />
                <span className="text-sm text-gray-300">{label}</span>
              </label>
            ))}
          </div>

          {error ? <p className="text-red-400 text-sm">{error}</p> : null}
          <button onClick={analyze} disabled={loading} className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded-xl transition">
            {loading ? "Analyzing…" : "Build My Tax Strategy"}
          </button>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 overflow-auto max-h-[700px]">
          {!result && !loading ? (
            <div className="h-full flex items-center justify-center">
              <p className="text-gray-600 text-sm text-center">Your tax strategy will appear here.</p>
            </div>
          ) : null}
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-gray-400 text-sm">Building your tax strategy…</p>
              </div>
            </div>
          ) : null}
          {result ? <TaxResult data={result} /> : null}
        </div>
      </div>
    </div>
  )
}

function TaxResult({ data }: { data: unknown }) {
  const d = data as Record<string, unknown>

  const deductions = Array.isArray(d.missedDeductions) ? (d.missedDeductions as Array<Record<string, unknown>>) : []
  const quarterly = Array.isArray(d.quarterlyPayments) ? (d.quarterlyPayments as Array<Record<string, unknown>>) : []
  const entityTips = Array.isArray(d.entityOptimizationTips) ? (d.entityOptimizationTips as string[]) : []
  const actions = Array.isArray(d.priorityActions) ? (d.priorityActions as string[]) : []

  return (
    <div className="space-y-5">
      <div>
        <p className="text-lg font-bold text-white">{String(d.headline ?? "")}</p>
        <div className="flex flex-wrap gap-4 mt-1 text-sm text-gray-400">
          {d.estimatedAnnualTax ? <span>Est. tax: <strong className="text-white">${Number(d.estimatedAnnualTax).toLocaleString()}</strong></span> : null}
          {d.effectiveTaxRate ? <span>Effective rate: <strong className="text-white">{String(d.effectiveTaxRate)}%</strong></span> : null}
          {d.potentialSavings ? <span>Potential savings: <strong className="text-emerald-400">${Number(d.potentialSavings).toLocaleString()}</strong></span> : null}
        </div>
      </div>

      {quarterly.length > 0 ? (
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Quarterly Payment Calendar</p>
          <div className="grid grid-cols-2 gap-2">
            {quarterly.map((q, i) => (
              <div key={i} className="border border-gray-700 rounded-lg p-3">
                <p className="text-xs font-bold text-emerald-400">{String(q.quarter ?? q.label ?? "")}</p>
                <p className="text-sm font-bold text-white mt-0.5">${Number(q.amount ?? q.payment ?? 0).toLocaleString()}</p>
                {q.dueDate ? <p className="text-xs text-gray-500 mt-0.5">Due: {String(q.dueDate)}</p> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {deductions.length > 0 ? (
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Missed / Overlooked Deductions</p>
          <div className="space-y-2">
            {deductions.map((ded, i) => (
              <div key={i} className="border border-gray-700 rounded-lg p-3">
                <div className="flex items-center justify-between mb-0.5">
                  <p className="text-sm font-semibold text-white">{String(ded.deduction ?? ded.name ?? "")}</p>
                  {ded.estimatedValue ? <p className="text-xs text-emerald-400 font-bold">${Number(ded.estimatedValue).toLocaleString()}</p> : null}
                </div>
                <p className="text-xs text-gray-400">{String(ded.howToCapture ?? ded.description ?? "")}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {entityTips.length > 0 ? (
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Entity Structure Optimization</p>
          <ul className="space-y-1.5">
            {entityTips.map((tip, i) => (
              <li key={i} className="text-sm text-gray-300 flex gap-2">
                <span className="text-emerald-400 shrink-0">→</span>
                {tip}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {actions.length > 0 ? (
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Priority Actions</p>
          <ol className="space-y-1.5">
            {actions.map((a, i) => (
              <li key={i} className="flex gap-2 text-sm text-gray-300">
                <span className="text-emerald-400 font-bold shrink-0">{i + 1}.</span>
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
