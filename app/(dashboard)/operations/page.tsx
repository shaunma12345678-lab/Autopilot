"use client"
import { useState } from "react"

type Tab = "sop" | "checklist" | "delegation"

export default function OperationsPage() {
  const [tab, setTab] = useState<Tab>("sop")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<unknown>(null)
  const [error, setError] = useState("")

  const [sopForm, setSopForm] = useState({ process: "", role: "", frequency: "", tools: "" })
  const [checklistForm, setChecklistForm] = useState({ role: "", openingOrClosing: "opening" as "opening" | "closing" | "daily" })
  const [delegationForm, setDelegationForm] = useState({ ownerRole: "", currentTasks: "", teamSize: "", growthGoal: "" })

  async function generate() {
    setLoading(true); setError(""); setResult(null)
    try {
      let body: Record<string, unknown> = { action: tab }
      if (tab === "sop") body = { ...body, ...sopForm, tools: sopForm.tools.split(",").map(s => s.trim()).filter(Boolean) }
      if (tab === "checklist") body = { ...body, ...checklistForm }
      if (tab === "delegation") body = { ...body, ...delegationForm, teamSize: Number(delegationForm.teamSize), currentTasks: delegationForm.currentTasks.split(";").map(s => s.trim()).filter(Boolean) }

      const res = await fetch("/api/agents/operations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      if (!res.ok) throw new Error(await res.text())
      setResult(await res.json())
    } catch (e) { setError(e instanceof Error ? e.message : "Failed") }
    finally { setLoading(false) }
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-lg">⚙</div>
          <h1 className="text-2xl font-bold">Operations Agent</h1>
        </div>
        <p className="text-gray-400">Build the systems that let your business run without you. SOPs, checklists, and delegation plans that real employees actually follow.</p>
      </div>

      <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit mb-6">
        {([["sop", "Write SOP"], ["checklist", "Daily Checklist"], ["delegation", "Delegation Plan"]] as const).map(([id, label]) => (
          <button key={id} onClick={() => { setTab(id); setResult(null) }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === id ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
          {tab === "sop" && <>
            <p className="text-sm text-gray-400">Step-by-step SOP a new hire can follow on day one — with common mistakes and quality checks.</p>
            <Field label="Process to document" value={sopForm.process} onChange={v => setSopForm(f => ({ ...f, process: v }))} placeholder="e.g. Customer onboarding, daily opening, invoice processing" accent="blue" />
            <Field label="Responsible role" value={sopForm.role} onChange={v => setSopForm(f => ({ ...f, role: v }))} placeholder="e.g. Front desk, manager, bookkeeper" accent="blue" />
            <Field label="Frequency" value={sopForm.frequency} onChange={v => setSopForm(f => ({ ...f, frequency: v }))} placeholder="e.g. Daily, weekly, per customer" accent="blue" />
            <Field label="Tools used (comma-separated)" value={sopForm.tools} onChange={v => setSopForm(f => ({ ...f, tools: v }))} placeholder="e.g. Square POS, Google Drive, Slack" accent="blue" />
          </>}

          {tab === "checklist" && <>
            <p className="text-sm text-gray-400">Opening, closing, or daily checklist with clear acceptance criteria — not just a list of vague tasks.</p>
            <Field label="Role this checklist is for" value={checklistForm.role} onChange={v => setChecklistForm(f => ({ ...f, role: v }))} placeholder="e.g. Store manager, receptionist, team lead" accent="blue" />
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Checklist type</label>
              <select value={checklistForm.openingOrClosing} onChange={e => setChecklistForm(f => ({ ...f, openingOrClosing: e.target.value as typeof checklistForm.openingOrClosing }))}
                className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500">
                <option value="opening">Opening</option>
                <option value="closing">Closing</option>
                <option value="daily">Full Day</option>
              </select>
            </div>
          </>}

          {tab === "delegation" && <>
            <p className="text-sm text-gray-400">Figure out exactly what to stop doing, what to delegate, and who to hire next.</p>
            <Field label="Your current role" value={delegationForm.ownerRole} onChange={v => setDelegationForm(f => ({ ...f, ownerRole: v }))} placeholder="e.g. Owner doing everything, CEO/operator" accent="blue" />
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Current tasks you handle (separate with ;)</label>
              <textarea value={delegationForm.currentTasks} onChange={e => setDelegationForm(f => ({ ...f, currentTasks: e.target.value }))}
                placeholder="e.g. Sales calls; bookkeeping; social media; hiring; customer service; payroll"
                rows={3} className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-600 text-sm focus:outline-none focus:border-blue-500 resize-none" />
            </div>
            <Field label="Current team size" value={delegationForm.teamSize} onChange={v => setDelegationForm(f => ({ ...f, teamSize: v }))} placeholder="e.g. 3" accent="blue" />
            <Field label="Growth goal" value={delegationForm.growthGoal} onChange={v => setDelegationForm(f => ({ ...f, growthGoal: v }))} placeholder="e.g. Double revenue in 18 months, open 2nd location" accent="blue" />
          </>}

          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button onClick={generate} disabled={loading} className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold rounded-xl transition">
            {loading ? "Building…" : "Generate"}
          </button>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 overflow-auto max-h-[600px]">
          {!result && !loading && <div className="h-full flex items-center justify-center"><p className="text-gray-600 text-sm text-center">Your operations document will appear here.</p></div>}
          {loading && <div className="h-full flex items-center justify-center"><div className="text-center"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" /><p className="text-gray-400 text-sm">Building your operations document…</p></div></div>}
          {result ? tab === "sop" ? <SOPResult data={result} /> : <pre className="text-xs text-gray-300 whitespace-pre-wrap">{JSON.stringify(result, null, 2)}</pre> : null}
        </div>
      </div>
    </div>
  )
}

function SOPResult({ data }: { data: unknown }) {
  const d = data as Record<string, unknown>
  return (
    <div className="space-y-4">
      <div className="border border-blue-800/40 bg-blue-950/20 rounded-lg p-3">
        <h2 className="text-base font-bold text-white">{String(d.sopTitle ?? "")}</h2>
        <p className="text-xs text-gray-400 mt-1">{String(d.purpose ?? "")}</p>
        <div className="flex gap-3 mt-2 text-xs">
          <span className="text-blue-400">Owner: {String(d.owner ?? "")}</span>
          <span className="text-gray-500">Freq: {String(d.frequency ?? "")}</span>
        </div>
      </div>
      {Array.isArray(d.steps) ? (d.steps as Array<Record<string, unknown>>).map((step, i) => (
        <div key={i} className="border border-gray-700 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold shrink-0">{Number(step.stepNumber)}</span>
            <span className="text-sm font-bold text-white">{String(step.title)}</span>
            <span className="text-xs text-gray-600 ml-auto">{String(step.timeEstimate)}</span>
          </div>
          {Array.isArray(step.instructions) ? (step.instructions as string[]).map((inst, j) => (
            <p key={j} className="text-xs text-gray-300 mb-1">• {inst}</p>
          )) : null}
          {step.qualityCheck ? <p className="text-xs text-emerald-400 mt-2">✓ {String(step.qualityCheck)}</p> : null}
        </div>
      )) : null}
    </div>
  )
}

function Field({ label, value, onChange, placeholder, accent }: { label: string; value: string; onChange: (v: string) => void; placeholder: string; accent: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-400 mb-1.5">{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className={`w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-600 text-sm focus:outline-none focus:border-${accent}-500`} />
    </div>
  )
}
