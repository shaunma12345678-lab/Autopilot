"use client"
import { useState } from "react"

type Tab = "service-agreement" | "privacy-policy" | "nda" | "terms"

export default function LegalPage() {
  const [tab, setTab] = useState<Tab>("service-agreement")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<unknown>(null)
  const [error, setError] = useState("")

  const [saForm, setSaForm] = useState({ clientName: "", serviceDescription: "", price: "", paymentTerms: "", deliverables: "", timeline: "", state: "" })
  const [ppForm, setPpForm] = useState({ websiteUrl: "", dataCollected: "", usesAnalytics: true, usesPayments: true, emailMarketing: true, state: "" })
  const [ndaForm, setNdaForm] = useState({ otherParty: "", purposeOfDisclosure: "", duration: "2 years", ndaType: "one-way" as "one-way" | "mutual", state: "" })
  const [tosForm, setTosForm] = useState({ websiteUrl: "", serviceDescription: "", pricingModel: "", refundPolicy: "", state: "" })

  async function generate() {
    setLoading(true); setError(""); setResult(null)
    try {
      let body: Record<string, unknown> = { action: tab }
      if (tab === "service-agreement") body = { ...body, ...saForm, deliverables: saForm.deliverables.split(";").map(s => s.trim()).filter(Boolean) }
      if (tab === "privacy-policy") body = { ...body, ...ppForm, dataCollected: ppForm.dataCollected.split(",").map(s => s.trim()).filter(Boolean) }
      if (tab === "nda") body = { ...body, ...ndaForm }
      if (tab === "terms") body = { ...body, ...tosForm }

      const res = await fetch("/api/agents/legal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      if (!res.ok) throw new Error(await res.text())
      setResult(await res.json())
    } catch (e) { setError(e instanceof Error ? e.message : "Failed") }
    finally { setLoading(false) }
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-gray-500/20 border border-gray-500/30 flex items-center justify-center text-lg">⚖</div>
          <h1 className="text-2xl font-bold">Legal Agent</h1>
        </div>
        <p className="text-gray-400">Generate contract templates, privacy policies, NDAs, and terms of service. Always review with an attorney before using.</p>
        <div className="mt-2 text-xs text-amber-400 bg-amber-950/30 border border-amber-800/40 rounded-lg px-3 py-2">
          ⚠ Templates only — not legal advice. Have an attorney review all documents before signing or sending.
        </div>
      </div>

      <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit mb-6 flex-wrap">
        {([["service-agreement", "Service Agreement"], ["privacy-policy", "Privacy Policy"], ["nda", "NDA"], ["terms", "Terms of Service"]] as const).map(([id, label]) => (
          <button key={id} onClick={() => { setTab(id); setResult(null) }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === id ? "bg-gray-600 text-white" : "text-gray-400 hover:text-white"}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
          {tab === "service-agreement" && <>
            <p className="text-sm text-gray-400">Service agreement protecting scope, payment, IP, and termination.</p>
            <Field label="Client name (optional)" value={saForm.clientName} onChange={v => setSaForm(f => ({ ...f, clientName: v }))} placeholder="e.g. Acme Corp or leave blank" />
            <TA label="Services to be provided" value={saForm.serviceDescription} onChange={v => setSaForm(f => ({ ...f, serviceDescription: v }))} placeholder="Describe exactly what you will deliver" />
            <Field label="Total price" value={saForm.price} onChange={v => setSaForm(f => ({ ...f, price: v }))} placeholder="e.g. $3,500" />
            <Field label="Payment terms" value={saForm.paymentTerms} onChange={v => setSaForm(f => ({ ...f, paymentTerms: v }))} placeholder="e.g. 50% upfront, 50% on completion" />
            <Field label="Deliverables (separate with ;)" value={saForm.deliverables} onChange={v => setSaForm(f => ({ ...f, deliverables: v }))} placeholder="e.g. Final logo files; brand guide; 3 revisions" />
            <Field label="Timeline" value={saForm.timeline} onChange={v => setSaForm(f => ({ ...f, timeline: v }))} placeholder="e.g. 4 weeks from signed agreement" />
            <Field label="Governing state" value={saForm.state} onChange={v => setSaForm(f => ({ ...f, state: v }))} placeholder="e.g. California" />
          </>}

          {tab === "privacy-policy" && <>
            <p className="text-sm text-gray-400">GDPR/CCPA-aware privacy policy for your website.</p>
            <Field label="Website URL" value={ppForm.websiteUrl} onChange={v => setPpForm(f => ({ ...f, websiteUrl: v }))} placeholder="e.g. www.yourbusiness.com" />
            <Field label="Data you collect (comma-separated)" value={ppForm.dataCollected} onChange={v => setPpForm(f => ({ ...f, dataCollected: v }))} placeholder="e.g. name, email, phone, payment info" />
            <div className="space-y-2">
              {[["usesAnalytics", "Uses analytics (Google Analytics etc.)"], ["usesPayments", "Processes payments"], ["emailMarketing", "Sends marketing emails"]].map(([key, label]) => (
                <label key={key} className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={ppForm[key as keyof typeof ppForm] as boolean} onChange={e => setPpForm(f => ({ ...f, [key]: e.target.checked }))} className="w-4 h-4 rounded" />
                  <span className="text-sm text-gray-300">{label}</span>
                </label>
              ))}
            </div>
            <Field label="State/country" value={ppForm.state} onChange={v => setPpForm(f => ({ ...f, state: v }))} placeholder="e.g. California, EU" />
          </>}

          {tab === "nda" && <>
            <p className="text-sm text-gray-400">One-way or mutual NDA to protect confidential information.</p>
            <Field label="Other party (optional)" value={ndaForm.otherParty} onChange={v => setNdaForm(f => ({ ...f, otherParty: v }))} placeholder="e.g. ABC Consulting" />
            <Field label="Purpose of disclosure" value={ndaForm.purposeOfDisclosure} onChange={v => setNdaForm(f => ({ ...f, purposeOfDisclosure: v }))} placeholder="e.g. Evaluating a potential business partnership" />
            <Field label="Confidentiality period" value={ndaForm.duration} onChange={v => setNdaForm(f => ({ ...f, duration: v }))} placeholder="e.g. 2 years" />
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">NDA type</label>
              <select value={ndaForm.ndaType} onChange={e => setNdaForm(f => ({ ...f, ndaType: e.target.value as "one-way" | "mutual" }))}
                className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-gray-500">
                <option value="one-way">One-way (you protect your info)</option>
                <option value="mutual">Mutual (both parties protected)</option>
              </select>
            </div>
            <Field label="Governing state" value={ndaForm.state} onChange={v => setNdaForm(f => ({ ...f, state: v }))} placeholder="e.g. New York" />
          </>}

          {tab === "terms" && <>
            <p className="text-sm text-gray-400">Terms of Service covering usage, payments, and liability.</p>
            <Field label="Website URL" value={tosForm.websiteUrl} onChange={v => setTosForm(f => ({ ...f, websiteUrl: v }))} placeholder="e.g. www.yourbusiness.com" />
            <TA label="Service description" value={tosForm.serviceDescription} onChange={v => setTosForm(f => ({ ...f, serviceDescription: v }))} placeholder="What does your product/service do?" />
            <Field label="Pricing model" value={tosForm.pricingModel} onChange={v => setTosForm(f => ({ ...f, pricingModel: v }))} placeholder="e.g. Monthly subscription, one-time fee" />
            <Field label="Refund policy" value={tosForm.refundPolicy} onChange={v => setTosForm(f => ({ ...f, refundPolicy: v }))} placeholder="e.g. 30-day money back, no refunds (optional)" />
            <Field label="Governing state" value={tosForm.state} onChange={v => setTosForm(f => ({ ...f, state: v }))} placeholder="e.g. Texas" />
          </>}

          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button onClick={generate} disabled={loading} className="w-full py-3 bg-gray-600 hover:bg-gray-500 disabled:opacity-50 text-white font-semibold rounded-xl transition">
            {loading ? "Drafting document…" : "Generate Document"}
          </button>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 overflow-auto max-h-[600px]">
          {!result && !loading && <div className="h-full flex items-center justify-center"><p className="text-gray-600 text-sm text-center">Your legal document will appear here.</p></div>}
          {loading && <div className="h-full flex items-center justify-center"><div className="text-center"><div className="w-8 h-8 border-2 border-gray-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" /><p className="text-gray-400 text-sm">Drafting your document…</p></div></div>}
          {result ? <LegalResult data={result} /> : null}
        </div>
      </div>
    </div>
  )
}

function LegalResult({ data }: { data: unknown }) {
  const d = data as Record<string, unknown>
  const docText = String(d.agreement ?? d.privacyPolicy ?? d.nda ?? d.termsOfService ?? "")
  return (
    <div className="space-y-4">
      {d.disclaimer ? <div className="border border-amber-800/40 bg-amber-950/20 rounded-lg p-3"><p className="text-xs text-amber-400">{String(d.disclaimer)}</p></div> : null}
      {docText && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold text-white">Document</h3>
            <button onClick={() => navigator.clipboard.writeText(docText)} className="text-xs text-gray-400 hover:text-white border border-gray-700 rounded px-2 py-1">Copy document</button>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-3 text-xs text-gray-300 whitespace-pre-wrap max-h-80 overflow-auto">{docText}</div>
        </div>
      )}
      {Array.isArray(d.keyTermsSummary) ? (
        <div>
          <h3 className="text-xs font-bold text-white mb-2">Key Terms (Plain English)</h3>
          {(d.keyTermsSummary as Array<Record<string, unknown>>).map((t, i) => (
            <div key={i} className="border border-gray-700 rounded-lg p-2 mb-1">
              <p className="text-xs font-bold text-gray-300">{String(t.clause ?? t.term ?? "")}</p>
              <p className="text-xs text-gray-500 mt-0.5">{String(t.whatItMeans ?? t.plain ?? "")}</p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-400 mb-1.5">{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-600 text-sm focus:outline-none focus:border-gray-500" />
    </div>
  )
}

function TA({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-400 mb-1.5">{label}</label>
      <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={3}
        className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-600 text-sm focus:outline-none focus:border-gray-500 resize-none" />
    </div>
  )
}
