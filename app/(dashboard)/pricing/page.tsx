"use client"
import { useState } from "react"

type Tab = "strategy" | "page"

export default function PricingPage() {
  const [tab, setTab] = useState<Tab>("strategy")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<unknown>(null)
  const [error, setError] = useState("")

  const [strategyForm, setStrategyForm] = useState({ competitors: "", currentPricingJson: "", targetMargin: "" })
  const [pageForm, setPageForm] = useState({ service: "", targetAudience: "", packagesJson: "", guarantee: "" })

  async function generate() {
    setLoading(true); setError(""); setResult(null)
    try {
      let body: Record<string, unknown> = { action: tab }
      if (tab === "strategy") {
        let currentPricing: Record<string, string> | undefined
        try { if (strategyForm.currentPricingJson) currentPricing = JSON.parse(strategyForm.currentPricingJson) } catch {}
        body = {
          ...body,
          currentPricing,
          competitors: strategyForm.competitors.split(",").map(s => s.trim()).filter(Boolean),
          targetMargin: strategyForm.targetMargin ? Number(strategyForm.targetMargin) : undefined,
        }
      }
      if (tab === "page") {
        let packages: Array<{ name: string; price: string; includes: string[] }> = []
        try { if (pageForm.packagesJson) packages = JSON.parse(pageForm.packagesJson) } catch {}
        body = { ...body, ...pageForm, packages }
      }

      const res = await fetch("/api/agents/pricing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      if (!res.ok) throw new Error(await res.text())
      setResult(await res.json())
    } catch (e) { setError(e instanceof Error ? e.message : "Failed") }
    finally { setLoading(false) }
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-green-500/20 border border-green-500/30 flex items-center justify-center text-lg">💲</div>
          <h1 className="text-2xl font-bold">Pricing Agent</h1>
        </div>
        <p className="text-gray-400">Stop leaving money on the table. Get a complete pricing strategy with packages, psychology tips, and page copy that justifies your rates.</p>
      </div>

      <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit mb-6">
        {([["strategy", "Pricing Strategy"], ["page", "Pricing Page Copy"]] as const).map(([id, label]) => (
          <button key={id} onClick={() => { setTab(id); setResult(null) }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === id ? "bg-green-600 text-white" : "text-gray-400 hover:text-white"}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
          {tab === "strategy" && <>
            <p className="text-sm text-gray-400">Full audit of your current pricing with specific recommendations, packaging strategy, and a price increase script.</p>
            <Field label="Competitors (comma-separated)" value={strategyForm.competitors} onChange={v => setStrategyForm(f => ({ ...f, competitors: v }))} placeholder="e.g. Competitor A, Competitor B" accent="green" />
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Current pricing (JSON, optional)</label>
              <textarea value={strategyForm.currentPricingJson} onChange={e => setStrategyForm(f => ({ ...f, currentPricingJson: e.target.value }))}
                placeholder={`{"Basic cleaning": "$120", "Deep clean": "$250"}`}
                rows={3} className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-600 text-sm focus:outline-none focus:border-green-500 resize-none" />
            </div>
            <Field label="Target profit margin %" value={strategyForm.targetMargin} onChange={v => setStrategyForm(f => ({ ...f, targetMargin: v }))} placeholder="e.g. 40 (optional)" accent="green" />
          </>}

          {tab === "page" && <>
            <p className="text-sm text-gray-400">Pricing page copy that makes your packages irresistible and your price feel like a bargain.</p>
            <Field label="Service name" value={pageForm.service} onChange={v => setPageForm(f => ({ ...f, service: v }))} placeholder="e.g. Business coaching, Website design" accent="green" />
            <Field label="Target audience" value={pageForm.targetAudience} onChange={v => setPageForm(f => ({ ...f, targetAudience: v }))} placeholder="e.g. Small business owners who want to scale" accent="green" />
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Packages (JSON, optional)</label>
              <textarea value={pageForm.packagesJson} onChange={e => setPageForm(f => ({ ...f, packagesJson: e.target.value }))}
                placeholder={`[{"name":"Starter","price":"$99/mo","includes":["Feature 1","Feature 2"]}]`}
                rows={3} className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-600 text-sm focus:outline-none focus:border-green-500 resize-none" />
            </div>
            <Field label="Your guarantee" value={pageForm.guarantee} onChange={v => setPageForm(f => ({ ...f, guarantee: v }))} placeholder="e.g. 30-day money back, results guarantee" accent="green" />
          </>}

          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button onClick={generate} disabled={loading} className="w-full py-3 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-semibold rounded-xl transition">
            {loading ? "Analyzing pricing…" : "Generate Pricing Strategy"}
          </button>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 overflow-auto max-h-[600px]">
          {!result && !loading && <div className="h-full flex items-center justify-center"><p className="text-gray-600 text-sm text-center">Your pricing strategy will appear here.</p></div>}
          {loading && <div className="h-full flex items-center justify-center"><div className="text-center"><div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" /><p className="text-gray-400 text-sm">Building your pricing strategy…</p></div></div>}
          {result ? <PricingResult data={result} /> : null}
        </div>
      </div>
    </div>
  )
}

function PricingResult({ data }: { data: unknown }) {
  const d = data as Record<string, unknown>
  return (
    <div className="space-y-4">
      {d.pricingAudit ? (
        <div className={`border rounded-lg p-3 ${(d.pricingAudit as Record<string, unknown>).pricePositioning === "underpriced" ? "border-red-800/40 bg-red-950/20" : "border-green-800/40 bg-green-950/20"}`}>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold text-white">Pricing Position</span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${(d.pricingAudit as Record<string, unknown>).pricePositioning === "underpriced" ? "bg-red-900/50 text-red-400" : "bg-green-900/50 text-green-400"}`}>
              {String((d.pricingAudit as Record<string, unknown>).pricePositioning ?? "")}
            </span>
          </div>
          <p className="text-sm text-green-300 font-bold">{String((d.pricingAudit as Record<string, unknown>).revenueLeakageEstimate ?? "")}</p>
        </div>
      ) : null}
      {d.packageStrategy && Array.isArray((d.packageStrategy as Record<string, unknown>).packages) ? (
        <div>
          <h3 className="text-xs font-bold text-white mb-2">Recommended Packages</h3>
          {((d.packageStrategy as Record<string, unknown>).packages as Array<Record<string, unknown>>).map((pkg, i) => (
            <div key={i} className={`border rounded-lg p-3 mb-2 ${pkg.hero ? "border-green-600 bg-green-950/20" : "border-gray-700"}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-bold text-white">{String(pkg.name)}</span>
                <span className="text-sm font-bold text-green-400">{String(pkg.price)}</span>
                {pkg.hero ? <span className="text-xs bg-green-900/50 text-green-400 border border-green-800 rounded-full px-2 py-0.5">Most Popular</span> : null}
              </div>
              <p className="text-xs text-gray-400">{String(pkg.targetBuyer)}</p>
            </div>
          ))}
        </div>
      ) : null}
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
