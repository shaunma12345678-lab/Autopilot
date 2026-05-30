"use client"
import { useState } from "react"
import { ConnectBanner } from "@/components/ConnectBanner"

type Tab = "welcome" | "winback" | "broadcast" | "nurture"

const TABS: { id: Tab; label: string; desc: string }[] = [
  { id: "welcome", label: "Welcome Sequence", desc: "5-email onboarding sequence for new leads and customers" },
  { id: "winback", label: "Win-Back", desc: "Recover inactive customers with a 3-email re-engagement campaign" },
  { id: "broadcast", label: "Promo Broadcast", desc: "3-email promotional series with A/B subject lines" },
  { id: "nurture", label: "Lead Nurture", desc: "Progressive nurture sequence matched to your sales cycle" },
]

export default function EmailMarketingPage() {
  const [tab, setTab] = useState<Tab>("welcome")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<unknown>(null)
  const [error, setError] = useState("")

  const [welcomeForm, setWelcomeForm] = useState({ service: "" })
  const [winbackForm, setWinbackForm] = useState({ service: "", inactiveDays: "60", offer: "" })
  const [broadcastForm, setBroadcastForm] = useState({ offer: "", deadline: "", audienceSegment: "" })
  const [nurtureForm, setNurtureForm] = useState({ service: "", leadSource: "", salesCycleDays: "30" })

  async function generate() {
    setLoading(true); setError(""); setResult(null)
    try {
      let body: Record<string, unknown> = { action: tab }
      if (tab === "welcome") body = { ...body, ...welcomeForm }
      if (tab === "winback") body = { ...body, ...winbackForm, inactiveDays: Number(winbackForm.inactiveDays) }
      if (tab === "broadcast") body = { ...body, ...broadcastForm }
      if (tab === "nurture") body = { ...body, ...nurtureForm, salesCycleDays: Number(nurtureForm.salesCycleDays) }

      const res = await fetch("/api/agents/email-marketing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      if (!res.ok) throw new Error(await res.text())
      setResult(await res.json())
    } catch (e) { setError(e instanceof Error ? e.message : "Failed") }
    finally { setLoading(false) }
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-lg">✉</div>
          <h1 className="text-2xl font-bold">Email Marketing Agent</h1>
        </div>
        <p className="text-gray-400">Build complete email sequences that get opened, read, and acted on — for every stage of the customer journey.</p>
      </div>

      <ConnectBanner
        provider="gmail"
        detail="Emails sent from your real Gmail address land in Primary, not Promotions."
      />

      <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit mb-6 flex-wrap">
        {TABS.map(t => (
          <button key={t.id} onClick={() => { setTab(t.id); setResult(null) }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === t.id ? "bg-cyan-600 text-white" : "text-gray-400 hover:text-white"}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
          <p className="text-sm text-gray-400">{TABS.find(t => t.id === tab)?.desc}</p>

          {tab === "welcome" && (
            <Field label="Service / product you offer" value={welcomeForm.service} onChange={v => setWelcomeForm({ service: v })} placeholder="e.g. Monthly bookkeeping, Personal training packages" />
          )}

          {tab === "winback" && <>
            <Field label="Service" value={winbackForm.service} onChange={v => setWinbackForm(f => ({ ...f, service: v }))} placeholder="e.g. Haircuts, legal consultations" />
            <Field label="Days since last activity" value={winbackForm.inactiveDays} onChange={v => setWinbackForm(f => ({ ...f, inactiveDays: v }))} placeholder="60" />
            <Field label="Win-back offer (optional)" value={winbackForm.offer} onChange={v => setWinbackForm(f => ({ ...f, offer: v }))} placeholder="e.g. 20% off next visit, free add-on" />
          </>}

          {tab === "broadcast" && <>
            <Field label="Offer to promote" value={broadcastForm.offer} onChange={v => setBroadcastForm(f => ({ ...f, offer: v }))} placeholder="e.g. Spring sale — 30% off all services" />
            <Field label="Deadline" value={broadcastForm.deadline} onChange={v => setBroadcastForm(f => ({ ...f, deadline: v }))} placeholder="e.g. Friday at midnight" />
            <Field label="Audience segment" value={broadcastForm.audienceSegment} onChange={v => setBroadcastForm(f => ({ ...f, audienceSegment: v }))} placeholder="e.g. All past customers, newsletter subscribers" />
          </>}

          {tab === "nurture" && <>
            <Field label="Service being sold" value={nurtureForm.service} onChange={v => setNurtureForm(f => ({ ...f, service: v }))} placeholder="e.g. Website design, roofing services" />
            <Field label="Lead source" value={nurtureForm.leadSource} onChange={v => setNurtureForm(f => ({ ...f, leadSource: v }))} placeholder="e.g. Google Ads, trade show, referral" />
            <Field label="Sales cycle length (days)" value={nurtureForm.salesCycleDays} onChange={v => setNurtureForm(f => ({ ...f, salesCycleDays: v }))} placeholder="30" />
          </>}

          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button onClick={generate} disabled={loading} className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-semibold rounded-xl transition">
            {loading ? "Writing emails…" : "Generate Email Sequence"}
          </button>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 overflow-auto max-h-[600px]">
          {!result && !loading && <div className="h-full flex items-center justify-center"><p className="text-gray-600 text-sm text-center">Your email sequence will appear here.</p></div>}
          {loading && <div className="h-full flex items-center justify-center"><div className="text-center"><div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" /><p className="text-gray-400 text-sm">Writing your email sequence…</p></div></div>}
          {result ? <ResultDisplay data={result} /> : null}
        </div>
      </div>
    </div>
  )
}

function ResultDisplay({ data }: { data: unknown }) {
  const d = data as Record<string, unknown>
  if (d.emails && Array.isArray(d.emails)) {
    return (
      <div className="space-y-4">
        {(d.emails as Array<Record<string, unknown>>).map((email, i) => (
          <div key={i} className="border border-gray-700 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs bg-cyan-900/50 text-cyan-400 border border-cyan-800 rounded-full px-2 py-0.5">
                {email.day !== undefined ? `Day ${String(email.day)}` : email.version ? String(email.version) : `Email ${i + 1}`}
              </span>
              {email.goal ? <span className="text-xs text-gray-600">{String(email.goal)}</span> : null}
            </div>
            <p className="text-sm font-semibold text-white mb-1">{String(email.subject ?? "")}</p>
            {email.previewText ? <p className="text-xs text-gray-500 mb-2 italic">{String(email.previewText)}</p> : null}
            <p className="text-xs text-gray-400 line-clamp-4">{String(email.body ?? "").replace(/<[^>]+>/g, " ").trim()}</p>
            {email.cta ? <p className="text-xs text-cyan-400 mt-2 font-medium">CTA: {String(email.cta)}</p> : null}
            <button onClick={() => navigator.clipboard.writeText(String(email.body ?? ""))} className="mt-2 text-xs text-gray-600 hover:text-gray-400">Copy body →</button>
          </div>
        ))}
        {d.sequenceStrategy ? <div className="border border-gray-800 rounded-lg p-3 bg-gray-800/30"><p className="text-xs text-gray-400">{String(d.sequenceStrategy)}</p></div> : null}
      </div>
    )
  }
  return <pre className="text-xs text-gray-300 whitespace-pre-wrap">{JSON.stringify(data, null, 2)}</pre>
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-400 mb-1.5">{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-600 text-sm focus:outline-none focus:border-cyan-500" />
    </div>
  )
}
