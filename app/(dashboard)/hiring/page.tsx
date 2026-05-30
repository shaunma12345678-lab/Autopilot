"use client"
import { useState } from "react"

type Tab = "job-description" | "interview-kit" | "offer-letter"

export default function HiringPage() {
  const [tab, setTab] = useState<Tab>("job-description")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<unknown>(null)
  const [error, setError] = useState("")

  const [jdForm, setJdForm] = useState({ role: "", salary: "", requiredSkills: "", niceToHaveSkills: "", cultureValues: "" })
  const [kitForm, setKitForm] = useState({ role: "", requiredSkills: "", cultureValues: "", interviewRounds: "2" })
  const [offerForm, setOfferForm] = useState({ candidateName: "", role: "", salary: "", startDate: "", benefits: "", reportingTo: "" })

  async function generate() {
    setLoading(true); setError(""); setResult(null)
    try {
      let body: Record<string, unknown> = { action: tab }
      if (tab === "job-description") body = { ...body, ...jdForm, requiredSkills: jdForm.requiredSkills.split(",").map(s => s.trim()).filter(Boolean), niceToHaveSkills: jdForm.niceToHaveSkills.split(",").map(s => s.trim()).filter(Boolean), cultureValues: jdForm.cultureValues.split(",").map(s => s.trim()).filter(Boolean) }
      if (tab === "interview-kit") body = { ...body, ...kitForm, requiredSkills: kitForm.requiredSkills.split(",").map(s => s.trim()).filter(Boolean), cultureValues: kitForm.cultureValues.split(",").map(s => s.trim()).filter(Boolean), interviewRounds: Number(kitForm.interviewRounds) }
      if (tab === "offer-letter") body = { ...body, ...offerForm, benefits: offerForm.benefits.split(",").map(s => s.trim()).filter(Boolean) }

      const res = await fetch("/api/agents/hiring", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      if (!res.ok) throw new Error(await res.text())
      setResult(await res.json())
    } catch (e) { setError(e instanceof Error ? e.message : "Failed") }
    finally { setLoading(false) }
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-lg">👥</div>
          <h1 className="text-2xl font-bold">Hiring Agent</h1>
        </div>
        <p className="text-gray-400">Attract A-players, run structured interviews that reveal character, and onboard new hires for success from day one.</p>
      </div>

      <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit mb-6">
        {([["job-description", "Job Description"], ["interview-kit", "Interview Kit"], ["offer-letter", "Offer Letter"]] as const).map(([id, label]) => (
          <button key={id} onClick={() => { setTab(id); setResult(null) }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === id ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-white"}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
          {tab === "job-description" && <>
            <p className="text-sm text-gray-400">A job posting that attracts the right candidates and repels the wrong ones — with an internal scorecard.</p>
            <Field label="Role title" value={jdForm.role} onChange={v => setJdForm(f => ({ ...f, role: v }))} placeholder="e.g. Front Desk Manager, Lead Technician" accent="indigo" />
            <Field label="Salary range" value={jdForm.salary} onChange={v => setJdForm(f => ({ ...f, salary: v }))} placeholder="e.g. $45,000 - $55,000/year" accent="indigo" />
            <Field label="Required skills (comma-separated)" value={jdForm.requiredSkills} onChange={v => setJdForm(f => ({ ...f, requiredSkills: v }))} placeholder="e.g. 2+ years experience, customer service, QuickBooks" accent="indigo" />
            <Field label="Nice-to-have skills" value={jdForm.niceToHaveSkills} onChange={v => setJdForm(f => ({ ...f, niceToHaveSkills: v }))} placeholder="e.g. Bilingual, industry certification (optional)" accent="indigo" />
            <Field label="Company values (comma-separated)" value={jdForm.cultureValues} onChange={v => setJdForm(f => ({ ...f, cultureValues: v }))} placeholder="e.g. Accountability, growth mindset, customer obsession" accent="indigo" />
          </>}

          {tab === "interview-kit" && <>
            <p className="text-sm text-gray-400">Structured interview questions that reveal real behavior — with green/red flags and a 30-day onboarding plan.</p>
            <Field label="Role you're hiring for" value={kitForm.role} onChange={v => setKitForm(f => ({ ...f, role: v }))} placeholder="e.g. Sales Manager, Operations Coordinator" accent="indigo" />
            <Field label="Required skills (comma-separated)" value={kitForm.requiredSkills} onChange={v => setKitForm(f => ({ ...f, requiredSkills: v }))} placeholder="e.g. Sales, communication, problem-solving" accent="indigo" />
            <Field label="Company values (comma-separated)" value={kitForm.cultureValues} onChange={v => setKitForm(f => ({ ...f, cultureValues: v }))} placeholder="e.g. Integrity, initiative, team player" accent="indigo" />
            <Field label="Number of interview rounds" value={kitForm.interviewRounds} onChange={v => setKitForm(f => ({ ...f, interviewRounds: v }))} placeholder="2" accent="indigo" />
          </>}

          {tab === "offer-letter" && <>
            <p className="text-sm text-gray-400">Professional offer letter that gets accepted — with negotiation guidance and pre-start checklist.</p>
            <Field label="Candidate name" value={offerForm.candidateName} onChange={v => setOfferForm(f => ({ ...f, candidateName: v }))} placeholder="e.g. Jamie Smith" accent="indigo" />
            <Field label="Role" value={offerForm.role} onChange={v => setOfferForm(f => ({ ...f, role: v }))} placeholder="e.g. Customer Success Manager" accent="indigo" />
            <Field label="Salary" value={offerForm.salary} onChange={v => setOfferForm(f => ({ ...f, salary: v }))} placeholder="e.g. $52,000/year" accent="indigo" />
            <Field label="Start date" value={offerForm.startDate} onChange={v => setOfferForm(f => ({ ...f, startDate: v }))} placeholder="e.g. June 2, 2026" accent="indigo" />
            <Field label="Benefits (comma-separated)" value={offerForm.benefits} onChange={v => setOfferForm(f => ({ ...f, benefits: v }))} placeholder="e.g. Health insurance, PTO, flexible hours" accent="indigo" />
            <Field label="Reports to" value={offerForm.reportingTo} onChange={v => setOfferForm(f => ({ ...f, reportingTo: v }))} placeholder="e.g. Sarah Chen, Operations Director" accent="indigo" />
          </>}

          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button onClick={generate} disabled={loading} className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold rounded-xl transition">
            {loading ? "Generating…" : "Generate"}
          </button>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 overflow-auto max-h-[600px]">
          {!result && !loading && <div className="h-full flex items-center justify-center"><p className="text-gray-600 text-sm text-center">Your hiring document will appear here.</p></div>}
          {loading && <div className="h-full flex items-center justify-center"><div className="text-center"><div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" /><p className="text-gray-400 text-sm">Building your hiring materials…</p></div></div>}
          {result ? <HiringResult data={result} tab={tab} /> : null}
        </div>
      </div>
    </div>
  )
}

function HiringResult({ data, tab }: { data: unknown; tab: Tab }) {
  const d = data as Record<string, unknown>
  if (tab === "job-description" && d.jobPosting) {
    const jp = d.jobPosting as Record<string, unknown>
    return (
      <div className="space-y-3">
        <div className="border border-indigo-800/40 bg-indigo-950/20 rounded-lg p-3">
          <h2 className="text-base font-bold text-white">{String(jp.title ?? "")}</h2>
          <p className="text-sm text-indigo-400 mt-1">{String(jp.headline ?? "")}</p>
        </div>
        <div className="border border-gray-700 rounded-lg p-3">
          <h3 className="text-xs font-bold text-white mb-2">Role Overview</h3>
          <p className="text-xs text-gray-300">{String(jp.roleOverview ?? "")}</p>
        </div>
        <button onClick={() => navigator.clipboard.writeText(JSON.stringify(d.jobPosting, null, 2))} className="text-xs text-indigo-400 hover:text-indigo-300">Copy full posting →</button>
        <pre className="text-xs text-gray-500 whitespace-pre-wrap">{JSON.stringify(data, null, 2)}</pre>
      </div>
    )
  }
  return <pre className="text-xs text-gray-300 whitespace-pre-wrap">{JSON.stringify(data, null, 2)}</pre>
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
