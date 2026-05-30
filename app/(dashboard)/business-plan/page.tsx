"use client"
import { useState } from "react"

type Tab = "full-plan" | "executive-summary"

export default function BusinessPlanPage() {
  const [tab, setTab] = useState<Tab>("full-plan")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<unknown>(null)
  const [error, setError] = useState("")

  const [planForm, setPlanForm] = useState({ targetMarket: "", problem: "", solution: "", revenue: "", currentStage: "early-revenue" as "idea" | "pre-revenue" | "early-revenue" | "growth", fundingNeeded: "" })
  const [summaryForm, setSummaryForm] = useState({ problem: "", solution: "", traction: "", ask: "" })

  async function generate() {
    setLoading(true); setError(""); setResult(null)
    try {
      let body: Record<string, unknown> = { action: tab }
      if (tab === "full-plan") body = { ...body, ...planForm, fundingNeeded: planForm.fundingNeeded ? Number(planForm.fundingNeeded) : undefined }
      if (tab === "executive-summary") body = { ...body, ...summaryForm }

      const res = await fetch("/api/agents/business-plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      if (!res.ok) throw new Error(await res.text())
      setResult(await res.json())
    } catch (e) { setError(e instanceof Error ? e.message : "Failed") }
    finally { setLoading(false) }
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-lg">📋</div>
          <h1 className="text-2xl font-bold">Business Plan Agent</h1>
        </div>
        <p className="text-gray-400">Generate investor-ready business plans, executive summaries, and pitch materials — built on realistic assumptions, not fantasy projections.</p>
      </div>

      <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit mb-6">
        {([["full-plan", "Full Business Plan"], ["executive-summary", "Executive Summary & Pitch"]] as const).map(([id, label]) => (
          <button key={id} onClick={() => { setTab(id); setResult(null) }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === id ? "bg-rose-600 text-white" : "text-gray-400 hover:text-white"}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
          {tab === "full-plan" && <>
            <p className="text-sm text-gray-400">Complete business plan with market analysis, financials, and risk assessment. Takes 60-90 seconds to generate.</p>
            <Field label="Target market" value={planForm.targetMarket} onChange={v => setPlanForm(f => ({ ...f, targetMarket: v }))} placeholder="e.g. Homeowners in suburban markets, 35-60" />
            <TA label="Problem you solve" value={planForm.problem} onChange={v => setPlanForm(f => ({ ...f, problem: v }))} placeholder="What specific problem does your business solve?" />
            <TA label="Your solution" value={planForm.solution} onChange={v => setPlanForm(f => ({ ...f, solution: v }))} placeholder="How do you solve it better than alternatives?" />
            <Field label="Revenue model" value={planForm.revenue} onChange={v => setPlanForm(f => ({ ...f, revenue: v }))} placeholder="e.g. Per-project fees, monthly retainer, product sales" />
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Current stage</label>
              <select value={planForm.currentStage} onChange={e => setPlanForm(f => ({ ...f, currentStage: e.target.value as typeof planForm.currentStage }))}
                className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-rose-500">
                <option value="idea">Idea stage</option>
                <option value="pre-revenue">Pre-revenue</option>
                <option value="early-revenue">Early revenue</option>
                <option value="growth">Growth stage</option>
              </select>
            </div>
            <Field label="Funding needed ($, optional)" value={planForm.fundingNeeded} onChange={v => setPlanForm(f => ({ ...f, fundingNeeded: v }))} placeholder="e.g. 150000 (leave blank if not seeking)" />
          </>}

          {tab === "executive-summary" && <>
            <p className="text-sm text-gray-400">One-page exec summary, elevator pitches, and investor Q&A prep.</p>
            <TA label="Problem you solve" value={summaryForm.problem} onChange={v => setSummaryForm(f => ({ ...f, problem: v }))} placeholder="What is the painful problem in the market?" />
            <TA label="Your solution" value={summaryForm.solution} onChange={v => setSummaryForm(f => ({ ...f, solution: v }))} placeholder="How does your business solve it uniquely?" />
            <TA label="Traction / proof" value={summaryForm.traction} onChange={v => setSummaryForm(f => ({ ...f, traction: v }))} placeholder="e.g. $20k MRR, 50 customers, 4.9 stars, 3 years operating" />
            <Field label="The ask" value={summaryForm.ask} onChange={v => setSummaryForm(f => ({ ...f, ask: v }))} placeholder="e.g. $200k investment for 15% equity" />
          </>}

          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button onClick={generate} disabled={loading} className="w-full py-3 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-semibold rounded-xl transition">
            {loading ? "Building plan…" : tab === "full-plan" ? "Generate Business Plan" : "Generate Pitch Materials"}
          </button>
          {tab === "full-plan" && <p className="text-xs text-gray-600 text-center">Full plan takes ~90 seconds to generate</p>}
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 overflow-auto max-h-[600px]">
          {!result && !loading && <div className="h-full flex items-center justify-center"><p className="text-gray-600 text-sm text-center">Your business plan will appear here.</p></div>}
          {loading && <div className="h-full flex items-center justify-center"><div className="text-center"><div className="w-8 h-8 border-2 border-rose-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" /><p className="text-gray-400 text-sm">{tab === "full-plan" ? "Building your complete business plan…" : "Writing your pitch materials…"}</p></div></div>}
          {result ? <BusinessPlanResult data={result} tab={tab} /> : null}
        </div>
      </div>
    </div>
  )
}

function BusinessPlanResult({ data, tab }: { data: unknown; tab: Tab }) {
  const d = data as Record<string, unknown>
  if (tab === "executive-summary") {
    return (
      <div className="space-y-4">
        {d.elevatorPitch ? (
          <div>
            <h3 className="text-xs font-bold text-rose-400 mb-2">30-Second Pitch</h3>
            <div className="bg-gray-800/50 rounded-lg p-3 text-sm text-gray-300">{String((d.elevatorPitch as Record<string, unknown>).thirtySeconds ?? "")}</div>
            <button onClick={() => navigator.clipboard.writeText(String((d.elevatorPitch as Record<string, unknown>).thirtySeconds ?? ""))} className="mt-1 text-xs text-gray-600 hover:text-gray-400">Copy →</button>
          </div>
        ) : null}
        {d.onePager ? (
          <div>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-xs font-bold text-white">One-Page Executive Summary</h3>
              <button onClick={() => navigator.clipboard.writeText(String(d.onePager))} className="text-xs text-rose-400 hover:text-rose-300">Copy</button>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-3 text-xs text-gray-300 whitespace-pre-wrap">{String(d.onePager)}</div>
          </div>
        ) : null}
        <pre className="text-xs text-gray-500 whitespace-pre-wrap">{JSON.stringify(data, null, 2)}</pre>
      </div>
    )
  }
  return (
    <div className="space-y-4">
      {d.executiveSummary ? <div className="border border-rose-800/40 bg-rose-950/20 rounded-lg p-3"><p className="text-xs font-bold text-rose-400 mb-1">Executive Summary</p><p className="text-sm text-gray-300">{String(d.executiveSummary)}</p></div> : null}
      {d.financialProjections ? (
        <div className="border border-gray-700 rounded-lg p-3">
          <h3 className="text-xs font-bold text-white mb-2">Financial Projections</h3>
          <div className="flex gap-6">
            <div className="text-center"><p className="text-lg font-bold text-white">${((d.financialProjections as Record<string, unknown>).year1Revenue as number)?.toLocaleString()}</p><p className="text-xs text-gray-500">Year 1</p></div>
            <div className="text-center"><p className="text-lg font-bold text-white">${((d.financialProjections as Record<string, unknown>).year3Revenue as number)?.toLocaleString()}</p><p className="text-xs text-gray-500">Year 3</p></div>
            <div className="text-center"><p className="text-lg font-bold text-white">Mo. {(d.financialProjections as Record<string, unknown>).breakEvenMonth as number}</p><p className="text-xs text-gray-500">Break Even</p></div>
          </div>
        </div>
      ) : null}
      <button onClick={() => navigator.clipboard.writeText(JSON.stringify(data, null, 2))} className="text-xs text-rose-400 hover:text-rose-300">Copy full plan →</button>
      <pre className="text-xs text-gray-500 whitespace-pre-wrap">{JSON.stringify(data, null, 2)}</pre>
    </div>
  )
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-400 mb-1.5">{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-600 text-sm focus:outline-none focus:border-rose-500" />
    </div>
  )
}

function TA({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-400 mb-1.5">{label}</label>
      <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={3}
        className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-600 text-sm focus:outline-none focus:border-rose-500 resize-none" />
    </div>
  )
}
