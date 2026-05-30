"use client"
import { useState } from "react"

type InvoiceRow = {
  clientName: string
  invoiceNumber: string
  amount: string
  daysOverdue: string
  previousAttempts: string
}

type CollectionSeq = {
  clientName: string
  invoiceNumber: string
  amount: number
  daysOverdue: number
  urgencyLevel: string
  emailSubject: string
  emailBody: string
  nextStep: string
}

const EMPTY_ROW = (): InvoiceRow => ({ clientName: "", invoiceNumber: "", amount: "", daysOverdue: "", previousAttempts: "0" })

export default function InvoicingPage() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<unknown>(null)
  const [error, setError] = useState("")
  const [businessName, setBusinessName] = useState("")
  const [invoices, setInvoices] = useState<InvoiceRow[]>([EMPTY_ROW(), EMPTY_ROW()])

  function addRow() { setInvoices(r => [...r, EMPTY_ROW()]) }
  function removeRow(i: number) { setInvoices(r => r.filter((_, idx) => idx !== i)) }
  function updateRow(i: number, field: keyof InvoiceRow, value: string) {
    setInvoices(r => r.map((row, idx) => idx === i ? { ...row, [field]: value } : row))
  }

  async function analyze() {
    setLoading(true); setError(""); setResult(null)
    try {
      const validInvoices = invoices
        .filter(inv => inv.clientName && inv.amount)
        .map(inv => ({
          clientName: inv.clientName,
          invoiceNumber: inv.invoiceNumber || `INV-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
          amount: Number(inv.amount),
          daysOverdue: Number(inv.daysOverdue || 0),
          previousAttempts: Number(inv.previousAttempts || 0),
        }))
      if (validInvoices.length === 0) throw new Error("Add at least one invoice with a client name and amount.")
      const res = await fetch("/api/agents/invoicing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "analyze", invoices: validInvoices, businessName: businessName || "My Business" }),
      })
      if (!res.ok) throw new Error(await res.text())
      setResult(await res.json())
    } catch (e) { setError(e instanceof Error ? e.message : "Failed") }
    finally { setLoading(false) }
  }

  const inputCls = "w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-xs focus:outline-none focus:border-amber-500"

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-lg">🧾</div>
          <h1 className="text-2xl font-bold">Invoice &amp; Collections Agent</h1>
        </div>
        <p className="text-gray-400">Get professional collection emails, demand letters, and a recovery strategy for every overdue invoice.</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Business name</label>
            <input value={businessName} onChange={e => setBusinessName(e.target.value)} placeholder="Acme Services LLC" className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-600 text-sm focus:outline-none focus:border-amber-500" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-400">Outstanding invoices</label>
              <button onClick={addRow} className="text-xs text-amber-400 hover:text-amber-300">+ Add invoice</button>
            </div>
            <div className="space-y-2">
              <div className="grid grid-cols-5 gap-1 text-xs text-gray-600 mb-1">
                <span className="col-span-2">Client name</span>
                <span>Invoice #</span>
                <span>Amount</span>
                <span>Days overdue</span>
              </div>
              {invoices.map((inv, i) => (
                <div key={i} className="grid grid-cols-5 gap-1 items-center">
                  <input value={inv.clientName} onChange={e => updateRow(i, "clientName", e.target.value)} placeholder="Client name" className={`col-span-2 ${inputCls}`} />
                  <input value={inv.invoiceNumber} onChange={e => updateRow(i, "invoiceNumber", e.target.value)} placeholder="INV-001" className={inputCls} />
                  <input type="number" value={inv.amount} onChange={e => updateRow(i, "amount", e.target.value)} placeholder="$" className={inputCls} />
                  <div className="flex gap-1">
                    <input type="number" value={inv.daysOverdue} onChange={e => updateRow(i, "daysOverdue", e.target.value)} placeholder="0" className={inputCls} />
                    {invoices.length > 1 ? (
                      <button onClick={() => removeRow(i)} className="text-gray-600 hover:text-red-400 text-xs px-1">✕</button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-600 mt-1">Previous contact attempts? Edit the &quot;Prev. attempts&quot; field or leave at 0.</p>
          </div>
          {error ? <p className="text-red-400 text-sm">{error}</p> : null}
          <button onClick={analyze} disabled={loading} className="w-full py-3 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-semibold rounded-xl transition">
            {loading ? "Analyzing…" : "Generate Collection Strategy"}
          </button>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 overflow-auto max-h-[700px]">
          {!result && !loading ? (
            <div className="h-full flex items-center justify-center">
              <p className="text-gray-600 text-sm text-center">Your collection strategy will appear here.</p>
            </div>
          ) : null}
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-gray-400 text-sm">Building your collection strategy…</p>
              </div>
            </div>
          ) : null}
          {result ? <InvoicingResult data={result} /> : null}
        </div>
      </div>
    </div>
  )
}

function UrgencyBadge({ level }: { level: string }) {
  const map: Record<string, string> = {
    friendly: "bg-emerald-900/50 text-emerald-400 border-emerald-700/50",
    firm: "bg-amber-900/50 text-amber-400 border-amber-700/50",
    final: "bg-orange-900/50 text-orange-400 border-orange-700/50",
    legal: "bg-red-900/50 text-red-400 border-red-700/50",
  }
  const cls = map[level.toLowerCase()] ?? "bg-gray-800 text-gray-400 border-gray-700"
  return <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${cls}`}>{level.toUpperCase()}</span>
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }
  return (
    <button onClick={copy} className="text-xs px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-400 rounded transition">
      {copied ? "Copied!" : "Copy"}
    </button>
  )
}

function InvoicingResult({ data }: { data: unknown }) {
  const d = data as Record<string, unknown>
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const sequences = Array.isArray(d.collectionSequences) ? (d.collectionSequences as CollectionSeq[]) : []
  const recs = Array.isArray(d.topRecommendations) ? (d.topRecommendations as string[]) : []
  const aging = d.agingBuckets as Record<string, { count: number; amount: number }> | undefined
  const prob = d.collectionProbability as Record<string, string> | undefined

  const agingConfig = [
    { key: "current", label: "Current", color: "bg-emerald-900/40 border-emerald-700/40 text-emerald-400" },
    { key: "1_30", label: "1–30 days", color: "bg-yellow-900/40 border-yellow-700/40 text-yellow-400" },
    { key: "31_60", label: "31–60 days", color: "bg-orange-900/40 border-orange-700/40 text-orange-400" },
    { key: "61_90", label: "61–90 days", color: "bg-red-900/40 border-red-700/40 text-red-400" },
    { key: "90plus", label: "90+ days", color: "bg-red-950/60 border-red-900/60 text-red-300" },
  ]

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <div className="border border-amber-800/40 bg-amber-950/20 rounded-lg p-4">
          <p className="text-xs text-amber-400 font-bold mb-1">TOTAL OUTSTANDING</p>
          <p className="text-2xl font-extrabold text-white">${Number(d.totalOutstanding ?? 0).toLocaleString()}</p>
        </div>
        <div className="border border-red-800/40 bg-red-950/20 rounded-lg p-4">
          <p className="text-xs text-red-400 font-bold mb-1">HIGH RISK (60+ DAYS)</p>
          <p className="text-2xl font-extrabold text-white">${Number(d.highRiskAmount ?? 0).toLocaleString()}</p>
        </div>
      </div>

      {aging ? (
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Aging Buckets</p>
          <div className="flex flex-wrap gap-2">
            {agingConfig.map(({ key, label, color }) => {
              const bucket = aging[key]
              if (!bucket) return null
              return (
                <div key={key} className={`px-3 py-2 rounded-lg border ${color}`}>
                  <p className="text-xs font-bold">{label}</p>
                  <p className="text-sm font-bold text-white">${Number(bucket.amount).toLocaleString()}</p>
                  <p className="text-xs opacity-75">{bucket.count} invoice{bucket.count !== 1 ? "s" : ""}</p>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      {prob ? (
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Collection Probability</p>
          <div className="grid grid-cols-4 gap-2">
            {Object.entries(prob).map(([k, v]) => (
              <div key={k} className="bg-gray-800 rounded-lg p-2 text-center">
                <p className="text-xs text-gray-500">{k.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase())}</p>
                <p className="text-sm font-bold text-white">{String(v)}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {sequences.length > 0 ? (
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Collection Sequences</p>
          <div className="space-y-3">
            {sequences.map((seq, i) => (
              <div key={i} className="border border-gray-800 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white">{seq.clientName}</span>
                    <span className="text-xs text-gray-500">{seq.invoiceNumber}</span>
                    <span className="text-xs font-bold text-amber-400">${Number(seq.amount).toLocaleString()}</span>
                  </div>
                  <UrgencyBadge level={seq.urgencyLevel} />
                </div>
                <p className="text-xs text-gray-400 mb-2">{seq.daysOverdue} days overdue</p>
                <button onClick={() => setOpenIndex(openIndex === i ? null : i)} className="text-xs text-amber-400 hover:text-amber-300 mb-2">
                  {openIndex === i ? "▲ Hide email" : "▼ Show email"}
                </button>
                {openIndex === i ? (
                  <div className="bg-gray-800 rounded-lg p-3 mt-2">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-white">Subject: {seq.emailSubject}</p>
                      <CopyButton text={`Subject: ${seq.emailSubject}\n\n${seq.emailBody}`} />
                    </div>
                    <pre className="text-xs text-gray-300 whitespace-pre-wrap font-sans">{seq.emailBody}</pre>
                  </div>
                ) : null}
                <p className="text-xs text-gray-500 mt-2">Next step: {seq.nextStep}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {d.legalDemandLetter ? (
        <div className="border-2 border-red-800/50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold text-red-400 uppercase tracking-wider">Legal Demand Letter</p>
            <CopyButton text={String(d.legalDemandLetter)} />
          </div>
          <pre className="text-xs text-gray-300 whitespace-pre-wrap font-sans">{String(d.legalDemandLetter)}</pre>
        </div>
      ) : null}

      {recs.length > 0 ? (
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Top Recommendations</p>
          <ol className="space-y-1.5">
            {recs.map((r, i) => (
              <li key={i} className="flex gap-2 text-sm text-gray-300">
                <span className="text-amber-400 font-bold shrink-0">{i + 1}.</span>{r}
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
