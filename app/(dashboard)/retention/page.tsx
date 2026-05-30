"use client"
import { useState } from "react"

type Tab = "churn" | "loyalty" | "campaign"

export default function RetentionPage() {
  const [tab, setTab] = useState<Tab>("churn")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<unknown>(null)
  const [error, setError] = useState("")

  const [churnForm, setChurnForm] = useState({ totalCustomers: "", activeCustomers: "", avgPurchaseFrequency: "", avgCustomerValue: "", commonCancellationReasons: "" })
  const [loyaltyForm, setLoyaltyForm] = useState({ avgTransactionValue: "", avgPurchaseFrequency: "", currentRetentionRate: "" })
  const [campaignForm, setCampaignForm] = useState({ customerSegment: "", inactivePeriod: "", winBackOffer: "" })

  async function generate() {
    setLoading(true); setError(""); setResult(null)
    try {
      let body: Record<string, unknown> = { action: tab }
      if (tab === "churn") {
        body = {
          ...body,
          customerData: {
            totalCustomers: Number(churnForm.totalCustomers),
            activeCustomers: Number(churnForm.activeCustomers),
            avgPurchaseFrequency: churnForm.avgPurchaseFrequency,
            avgCustomerValue: churnForm.avgCustomerValue,
            commonCancellationReasons: churnForm.commonCancellationReasons.split(",").map(s => s.trim()).filter(Boolean),
          }
        }
      }
      if (tab === "loyalty") body = { ...body, ...loyaltyForm, avgTransactionValue: Number(loyaltyForm.avgTransactionValue), currentRetentionRate: Number(loyaltyForm.currentRetentionRate) }
      if (tab === "campaign") body = { ...body, ...campaignForm }

      const res = await fetch("/api/agents/retention", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      if (!res.ok) throw new Error(await res.text())
      setResult(await res.json())
    } catch (e) { setError(e instanceof Error ? e.message : "Failed") }
    finally { setLoading(false) }
  }

  const accent = "emerald"

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-lg">♻</div>
          <h1 className="text-2xl font-bold">Customer Retention Agent</h1>
        </div>
        <p className="text-gray-400">Stop losing customers you already have. Identify churn risk, build loyalty programs, and win back lapsed clients.</p>
      </div>

      <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit mb-6">
        {([["churn", "Churn Analysis"], ["loyalty", "Loyalty Program"], ["campaign", "Win-Back Campaign"]] as const).map(([id, label]) => (
          <button key={id} onClick={() => { setTab(id); setResult(null) }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === id ? `bg-${accent}-600 text-white` : "text-gray-400 hover:text-white"}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
          {tab === "churn" && <>
            <p className="text-sm text-gray-400">Analyze your at-risk segments and get a complete retention playbook.</p>
            <Field label="Total customers" value={churnForm.totalCustomers} onChange={v => setChurnForm(f => ({ ...f, totalCustomers: v }))} placeholder="e.g. 200" accent={accent} />
            <Field label="Active customers (bought in 90 days)" value={churnForm.activeCustomers} onChange={v => setChurnForm(f => ({ ...f, activeCustomers: v }))} placeholder="e.g. 120" accent={accent} />
            <Field label="Average purchase frequency" value={churnForm.avgPurchaseFrequency} onChange={v => setChurnForm(f => ({ ...f, avgPurchaseFrequency: v }))} placeholder="e.g. Monthly, quarterly, every 6 weeks" accent={accent} />
            <Field label="Average customer value (lifetime)" value={churnForm.avgCustomerValue} onChange={v => setChurnForm(f => ({ ...f, avgCustomerValue: v }))} placeholder="e.g. $500, $2,000" accent={accent} />
            <Field label="Cancellation reasons (comma-separated, optional)" value={churnForm.commonCancellationReasons} onChange={v => setChurnForm(f => ({ ...f, commonCancellationReasons: v }))} placeholder="e.g. Too expensive, moved away, using competitor" accent={accent} />
          </>}

          {tab === "loyalty" && <>
            <p className="text-sm text-gray-400">Design a loyalty program with real economics and a full launch plan.</p>
            <Field label="Average transaction value ($)" value={loyaltyForm.avgTransactionValue} onChange={v => setLoyaltyForm(f => ({ ...f, avgTransactionValue: v }))} placeholder="e.g. 85" accent={accent} />
            <Field label="Average purchase frequency" value={loyaltyForm.avgPurchaseFrequency} onChange={v => setLoyaltyForm(f => ({ ...f, avgPurchaseFrequency: v }))} placeholder="e.g. 2x per month, every 6 weeks" accent={accent} />
            <Field label="Current retention rate (%)" value={loyaltyForm.currentRetentionRate} onChange={v => setLoyaltyForm(f => ({ ...f, currentRetentionRate: v }))} placeholder="e.g. 65 (optional)" accent={accent} />
          </>}

          {tab === "campaign" && <>
            <p className="text-sm text-gray-400">Multi-channel campaign to bring lapsed customers back.</p>
            <Field label="Customer segment to target" value={campaignForm.customerSegment} onChange={v => setCampaignForm(f => ({ ...f, customerSegment: v }))} placeholder="e.g. Past clients, former subscribers" accent={accent} />
            <Field label="How long they've been inactive" value={campaignForm.inactivePeriod} onChange={v => setCampaignForm(f => ({ ...f, inactivePeriod: v }))} placeholder="e.g. 60 days, 3 months" accent={accent} />
            <Field label="Win-back offer (optional)" value={campaignForm.winBackOffer} onChange={v => setCampaignForm(f => ({ ...f, winBackOffer: v }))} placeholder="e.g. 25% off, free first session back" accent={accent} />
          </>}

          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button onClick={generate} disabled={loading} className={`w-full py-3 bg-${accent}-600 hover:bg-${accent}-500 disabled:opacity-50 text-white font-semibold rounded-xl transition`}>
            {loading ? "Analyzing…" : "Generate"}
          </button>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 overflow-auto max-h-[600px]">
          {!result && !loading && <div className="h-full flex items-center justify-center"><p className="text-gray-600 text-sm text-center">Your retention strategy will appear here.</p></div>}
          {loading && <div className="h-full flex items-center justify-center"><div className="text-center"><div className={`w-8 h-8 border-2 border-${accent}-500 border-t-transparent rounded-full animate-spin mx-auto mb-3`} /><p className="text-gray-400 text-sm">Building your retention system…</p></div></div>}
          {result ? <pre className="text-xs text-gray-300 whitespace-pre-wrap">{JSON.stringify(result, null, 2)}</pre> : null}
        </div>
      </div>
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
