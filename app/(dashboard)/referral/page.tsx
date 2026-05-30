"use client"
import { useState } from "react"

type Tab = "program" | "copy"

export default function ReferralPage() {
  const [tab, setTab] = useState<Tab>("program")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<unknown>(null)
  const [error, setError] = useState("")

  const [programForm, setProgramForm] = useState({ averageCustomerValue: "", customerAcquisitionCost: "", currentReferralRate: "" })
  const [copyForm, setCopyForm] = useState({ referrerReward: "", refereeReward: "", channel: "email" as "email" | "sms" | "social" | "in-person" | "card" })

  async function generate() {
    setLoading(true); setError(""); setResult(null)
    try {
      let body: Record<string, unknown> = { action: tab }
      if (tab === "program") body = { ...body, averageCustomerValue: Number(programForm.averageCustomerValue), customerAcquisitionCost: programForm.customerAcquisitionCost ? Number(programForm.customerAcquisitionCost) : undefined, currentReferralRate: programForm.currentReferralRate || undefined }
      if (tab === "copy") body = { ...body, ...copyForm }

      const res = await fetch("/api/agents/referral", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      if (!res.ok) throw new Error(await res.text())
      setResult(await res.json())
    } catch (e) { setError(e instanceof Error ? e.message : "Failed") }
    finally { setLoading(false) }
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-pink-500/20 border border-pink-500/30 flex items-center justify-center text-lg">🤝</div>
          <h1 className="text-2xl font-bold">Referral Program Agent</h1>
        </div>
        <p className="text-gray-400">Design a referral program that turns happy customers into your best salespeople — with economics that work.</p>
      </div>

      <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit mb-6">
        {([["program", "Design Program"], ["copy", "Referral Copy"]] as const).map(([id, label]) => (
          <button key={id} onClick={() => { setTab(id); setResult(null) }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === id ? "bg-pink-600 text-white" : "text-gray-400 hover:text-white"}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
          {tab === "program" && <>
            <p className="text-sm text-gray-400">Full program design with incentive structure, economics analysis, launch plan, and all promotional assets.</p>
            <Field label="Average customer lifetime value ($)" value={programForm.averageCustomerValue} onChange={v => setProgramForm(f => ({ ...f, averageCustomerValue: v }))} placeholder="e.g. 500" accent="pink" />
            <Field label="Customer acquisition cost ($)" value={programForm.customerAcquisitionCost} onChange={v => setProgramForm(f => ({ ...f, customerAcquisitionCost: v }))} placeholder="e.g. 80 (optional)" accent="pink" />
            <Field label="Current referral rate (optional)" value={programForm.currentReferralRate} onChange={v => setProgramForm(f => ({ ...f, currentReferralRate: v }))} placeholder="e.g. 5% of customers refer" accent="pink" />
          </>}

          {tab === "copy" && <>
            <p className="text-sm text-gray-400">3 tones of referral copy for your chosen channel — ready to copy and use.</p>
            <Field label="What the referrer gets" value={copyForm.referrerReward} onChange={v => setCopyForm(f => ({ ...f, referrerReward: v }))} placeholder="e.g. $50 account credit, free month" accent="pink" />
            <Field label="What the new customer gets" value={copyForm.refereeReward} onChange={v => setCopyForm(f => ({ ...f, refereeReward: v }))} placeholder="e.g. 20% off first purchase" accent="pink" />
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Channel</label>
              <select value={copyForm.channel} onChange={e => setCopyForm(f => ({ ...f, channel: e.target.value as typeof copyForm.channel }))}
                className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-pink-500">
                {["email", "sms", "social", "in-person", "card"].map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
              </select>
            </div>
          </>}

          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button onClick={generate} disabled={loading} className="w-full py-3 bg-pink-600 hover:bg-pink-500 disabled:opacity-50 text-white font-semibold rounded-xl transition">
            {loading ? "Building program…" : "Generate Referral Program"}
          </button>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 overflow-auto max-h-[600px]">
          {!result && !loading && <div className="h-full flex items-center justify-center"><p className="text-gray-600 text-sm text-center">Your referral program will appear here.</p></div>}
          {loading && <div className="h-full flex items-center justify-center"><div className="text-center"><div className="w-8 h-8 border-2 border-pink-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" /><p className="text-gray-400 text-sm">Designing your referral program…</p></div></div>}
          {result ? <ReferralResult data={result} /> : null}
        </div>
      </div>
    </div>
  )
}

function ReferralResult({ data }: { data: unknown }) {
  const d = data as Record<string, unknown>
  return (
    <div className="space-y-4">
      {d.programName ? <h2 className="text-lg font-bold text-white">{String(d.programName)}</h2> : null}
      {d.economicsAnalysis ? (
        <div className="border border-pink-800/40 bg-pink-950/20 rounded-lg p-3">
          <h3 className="text-xs font-bold text-pink-400 mb-2">Program Economics</h3>
          {Object.entries(d.economicsAnalysis as Record<string, unknown>).map(([k, v]) => (
            <div key={k} className="flex justify-between text-xs py-1 border-b border-gray-800/50 last:border-0">
              <span className="text-gray-400 capitalize">{k.replace(/([A-Z])/g, " $1").trim()}</span>
              <span className="text-white font-medium">{String(v)}</span>
            </div>
          ))}
        </div>
      ) : null}
      {(d.promotionAssets as Record<string, unknown> | undefined)?.websiteSection ? (
        <div className="border border-gray-700 rounded-lg p-3">
          <h3 className="text-xs font-bold text-white mb-1">Website Section Copy</h3>
          <p className="text-sm font-bold text-pink-400">{String(((d.promotionAssets as Record<string, unknown>).websiteSection as Record<string, unknown>).headline)}</p>
        </div>
      ) : null}
      {Array.isArray(d.messages) ? (d.messages as Array<Record<string, unknown>>).map((m, i) => (
        <div key={i} className="border border-gray-700 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-pink-400 font-bold">{String(m.tone)}</span>
            <span className="text-xs text-gray-600">{String(m.bestFor)}</span>
          </div>
          <p className="text-sm text-gray-300">{String(m.message)}</p>
          <button onClick={() => navigator.clipboard.writeText(String(m.message))} className="mt-2 text-xs text-gray-600 hover:text-gray-400">Copy →</button>
        </div>
      )) : null}
      <pre className="text-xs text-gray-500 whitespace-pre-wrap">{JSON.stringify(data, null, 2)}</pre>
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
