"use client"
import { useState } from "react"

export default function FundingPage() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<unknown>(null)
  const [error, setError] = useState("")

  const [form, setForm] = useState({
    businessAgeMonths: "",
    annualRevenue: "",
    monthlyRevenue: "",
    monthlyProfit: "",
    currentDebt: "",
    monthlyDebtPayments: "",
    creditScore: "700-749",
    industryType: "",
    fundingAmount: "",
    fundingPurpose: "",
    fundingType: "SBA Loan",
  })

  function set(field: keyof typeof form, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function analyze() {
    setLoading(true); setError(""); setResult(null)
    try {
      const res = await fetch("/api/agents/funding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "analyze", ...form }),
      })
      if (!res.ok) throw new Error(await res.text())
      setResult(await res.json())
    } catch (e) { setError(e instanceof Error ? e.message : "Failed") }
    finally { setLoading(false) }
  }

  const inputCls = "w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-600 text-sm focus:outline-none focus:border-rose-500"
  const selectCls = "w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-rose-500"
  const labelCls = "block text-xs font-medium text-gray-400 mb-1.5"

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-lg">🏦</div>
          <h1 className="text-2xl font-bold">Funding Readiness Agent</h1>
        </div>
        <p className="text-gray-400">Score your funding readiness, calculate DSCR, and find the best financing options for your business.</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Business age (months)</label>
              <input type="number" value={form.businessAgeMonths} onChange={e => set("businessAgeMonths", e.target.value)} placeholder="24" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Annual revenue ($)</label>
              <input type="number" value={form.annualRevenue} onChange={e => set("annualRevenue", e.target.value)} placeholder="240000" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Monthly revenue ($)</label>
              <input type="number" value={form.monthlyRevenue} onChange={e => set("monthlyRevenue", e.target.value)} placeholder="20000" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Monthly profit ($)</label>
              <input type="number" value={form.monthlyProfit} onChange={e => set("monthlyProfit", e.target.value)} placeholder="5000" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Current total debt ($)</label>
              <input type="number" value={form.currentDebt} onChange={e => set("currentDebt", e.target.value)} placeholder="50000" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Monthly debt payments ($)</label>
              <input type="number" value={form.monthlyDebtPayments} onChange={e => set("monthlyDebtPayments", e.target.value)} placeholder="2000" className={inputCls} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Credit score range</label>
              <select value={form.creditScore} onChange={e => set("creditScore", e.target.value)} className={selectCls}>
                <option value="750+">750+ (Excellent)</option>
                <option value="700-749">700–749 (Good)</option>
                <option value="650-699">650–699 (Fair)</option>
                <option value="600-649">600–649 (Poor)</option>
                <option value="below-600">Below 600</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Industry type</label>
              <input value={form.industryType} onChange={e => set("industryType", e.target.value)} placeholder="e.g. Restaurant, SaaS, Retail" className={inputCls} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Funding amount needed ($)</label>
              <input type="number" value={form.fundingAmount} onChange={e => set("fundingAmount", e.target.value)} placeholder="100000" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Preferred funding type</label>
              <select value={form.fundingType} onChange={e => set("fundingType", e.target.value)} className={selectCls}>
                <option>SBA Loan</option>
                <option>Business Line of Credit</option>
                <option>Equipment Financing</option>
                <option>Invoice Factoring</option>
                <option>Merchant Cash Advance</option>
                <option>Venture Capital</option>
                <option>Angel Investment</option>
                <option>Revenue-Based Financing</option>
                <option>Not Sure</option>
              </select>
            </div>
          </div>

          <div>
            <label className={labelCls}>What will the funding be used for?</label>
            <input value={form.fundingPurpose} onChange={e => set("fundingPurpose", e.target.value)} placeholder="e.g. New equipment, hire staff, expand location" className={inputCls} />
          </div>

          {error ? <p className="text-red-400 text-sm">{error}</p> : null}
          <button onClick={analyze} disabled={loading} className="w-full py-3 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-semibold rounded-xl transition">
            {loading ? "Analyzing…" : "Check Funding Readiness"}
          </button>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 overflow-auto max-h-[700px]">
          {!result && !loading ? (
            <div className="h-full flex items-center justify-center">
              <p className="text-gray-600 text-sm text-center">Your funding readiness report will appear here.</p>
            </div>
          ) : null}
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <div className="w-8 h-8 border-2 border-rose-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-gray-400 text-sm">Analyzing your funding profile…</p>
              </div>
            </div>
          ) : null}
          {result ? <FundingResult data={result} /> : null}
        </div>
      </div>
    </div>
  )
}

function FundingResult({ data }: { data: unknown }) {
  const d = data as Record<string, unknown>
  const grade = String(d.readinessGrade ?? "")
  const gradeColor =
    grade === "A" ? "text-emerald-400 border-emerald-700/50 bg-emerald-950/20" :
    grade === "B" ? "text-teal-400 border-teal-700/50 bg-teal-950/20" :
    grade === "C" ? "text-amber-400 border-amber-700/50 bg-amber-950/20" :
    "text-red-400 border-red-700/50 bg-red-950/20"

  const strengths = Array.isArray(d.strengths) ? (d.strengths as string[]) : []
  const weaknesses = Array.isArray(d.weaknesses) ? (d.weaknesses as string[]) : []
  const options = Array.isArray(d.fundingOptions) ? (d.fundingOptions as Array<Record<string, unknown>>) : []
  const steps = Array.isArray(d.immediateSteps) ? (d.immediateSteps as string[]) : []

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-4">
        <div className={`w-16 h-16 rounded-xl border flex items-center justify-center text-3xl font-black shrink-0 ${gradeColor}`}>
          {grade}
        </div>
        <div>
          <p className="text-lg font-bold text-white">{String(d.readinessScore ?? 0)}/100 Funding Ready</p>
          <p className="text-sm text-gray-400 mt-0.5">DSCR: {String(d.dscr ?? "—")} · {String(d.headline ?? "")}</p>
        </div>
      </div>

      {d.dscrExplanation ? (
        <div className="border border-gray-700/50 rounded-lg p-3">
          <p className="text-xs font-bold text-gray-400 mb-1">DEBT SERVICE COVERAGE RATIO</p>
          <p className="text-xs text-gray-300">{String(d.dscrExplanation)}</p>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        {strengths.length > 0 ? (
          <div>
            <p className="text-xs font-bold text-emerald-400 mb-2">Strengths</p>
            <ul className="space-y-1">
              {strengths.map((s, i) => (
                <li key={i} className="text-xs text-gray-300 flex gap-1.5"><span className="text-emerald-500 shrink-0">✓</span>{s}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {weaknesses.length > 0 ? (
          <div>
            <p className="text-xs font-bold text-red-400 mb-2">Gaps to Address</p>
            <ul className="space-y-1">
              {weaknesses.map((w, i) => (
                <li key={i} className="text-xs text-gray-300 flex gap-1.5"><span className="text-red-500 shrink-0">✗</span>{w}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {options.length > 0 ? (
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Best Funding Options</p>
          <div className="space-y-2">
            {options.map((opt, i) => {
              const likelihood = String(opt.likelihood ?? "")
              const badgeColor = likelihood === "High" ? "bg-emerald-900/50 text-emerald-400" : likelihood === "Medium" ? "bg-amber-900/50 text-amber-400" : "bg-red-900/50 text-red-400"
              return (
                <div key={i} className="border border-gray-700 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-semibold text-white">{String(opt.type ?? opt.name ?? "")}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${badgeColor}`}>{likelihood} likelihood</span>
                  </div>
                  <p className="text-xs text-gray-400">{String(opt.details ?? opt.description ?? "")}</p>
                  {opt.estimatedRange ? <p className="text-xs text-rose-400 mt-1 font-medium">{String(opt.estimatedRange)}</p> : null}
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      {steps.length > 0 ? (
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Immediate Steps</p>
          <ol className="space-y-1.5">
            {steps.map((s, i) => (
              <li key={i} className="flex gap-2 text-sm text-gray-300">
                <span className="text-rose-400 font-bold shrink-0">{i + 1}.</span>
                {s}
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
