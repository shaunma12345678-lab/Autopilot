"use client"
import { useState } from "react"

type Service = { name: string; monthlyRevenue: string; estimatedCost: string; hoursPerMonth: string }

export default function ProfitMaximizerPage() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<unknown>(null)
  const [error, setError] = useState("")

  const [services, setServices] = useState<Service[]>([
    { name: "", monthlyRevenue: "", estimatedCost: "", hoursPerMonth: "" },
  ])
  const [totalOverhead, setTotalOverhead] = useState("")
  const [businessGoal, setBusinessGoal] = useState("")

  function addService() {
    setServices(s => [...s, { name: "", monthlyRevenue: "", estimatedCost: "", hoursPerMonth: "" }])
  }
  function removeService(i: number) {
    setServices(s => s.filter((_, idx) => idx !== i))
  }
  function updateService(i: number, field: keyof Service, value: string) {
    setServices(s => s.map((svc, idx) => idx === i ? { ...svc, [field]: value } : svc))
  }

  async function analyze() {
    setLoading(true); setError(""); setResult(null)
    try {
      const validServices = services
        .filter(s => s.name && Number(s.monthlyRevenue) > 0)
        .map(s => ({
          name: s.name,
          monthlyRevenue: Number(s.monthlyRevenue),
          estimatedCost: Number(s.estimatedCost),
          hoursPerMonth: Number(s.hoursPerMonth),
        }))
      if (validServices.length === 0) throw new Error("Add at least one service with a name and revenue")

      const res = await fetch("/api/agents/profit-maximizer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "analyze",
          services: validServices,
          totalOverhead: Number(totalOverhead),
          businessGoal,
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      setResult(await res.json())
    } catch (e) { setError(e instanceof Error ? e.message : "Failed") }
    finally { setLoading(false) }
  }

  const inputCls = "w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-white placeholder-gray-600 text-xs focus:outline-none focus:border-green-500"

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-green-500/20 border border-green-500/30 flex items-center justify-center text-lg">📈</div>
          <h1 className="text-2xl font-bold">Profit Maximizer Agent</h1>
        </div>
        <p className="text-gray-400">Analyze profit margins per service, identify your star performers, and get a pricing strategy to maximize net profit.</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-400">Your services / revenue streams</label>
              <button onClick={addService} className="text-xs text-green-400 hover:text-green-300">+ Add service</button>
            </div>
            <div className="grid grid-cols-4 gap-1 mb-1">
              <span className="col-span-1 text-xs text-gray-600">Service name</span>
              <span className="text-xs text-gray-600 text-right">Revenue/mo</span>
              <span className="text-xs text-gray-600 text-right">Cost/mo</span>
              <span className="text-xs text-gray-600 text-right">Hours/mo</span>
            </div>
            <div className="space-y-1.5">
              {services.map((svc, i) => (
                <div key={i} className="grid grid-cols-4 gap-1 items-center">
                  <input value={svc.name} onChange={e => updateService(i, "name", e.target.value)} placeholder="e.g. Monthly SEO" className={inputCls} />
                  <input type="number" value={svc.monthlyRevenue} onChange={e => updateService(i, "monthlyRevenue", e.target.value)} placeholder="$" className={inputCls} />
                  <input type="number" value={svc.estimatedCost} onChange={e => updateService(i, "estimatedCost", e.target.value)} placeholder="$" className={inputCls} />
                  <div className="flex gap-1">
                    <input type="number" value={svc.hoursPerMonth} onChange={e => updateService(i, "hoursPerMonth", e.target.value)} placeholder="hrs" className={inputCls} />
                    {services.length > 1 ? (
                      <button onClick={() => removeService(i)} className="text-gray-600 hover:text-red-400 text-xs px-1">✕</button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Total monthly overhead ($)</label>
            <input type="number" value={totalOverhead} onChange={e => setTotalOverhead(e.target.value)} placeholder="e.g. 8000 (rent, payroll, software)"
              className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-600 text-sm focus:outline-none focus:border-green-500" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Your business goal</label>
            <input value={businessGoal} onChange={e => setBusinessGoal(e.target.value)} placeholder="e.g. Reach $30k/mo profit, replace myself in ops"
              className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-600 text-sm focus:outline-none focus:border-green-500" />
          </div>

          {error ? <p className="text-red-400 text-sm">{error}</p> : null}
          <button onClick={analyze} disabled={loading} className="w-full py-3 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-semibold rounded-xl transition">
            {loading ? "Analyzing…" : "Maximize My Profit"}
          </button>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 overflow-auto max-h-[700px]">
          {!result && !loading ? (
            <div className="h-full flex items-center justify-center">
              <p className="text-gray-600 text-sm text-center">Your profit analysis will appear here.</p>
            </div>
          ) : null}
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-gray-400 text-sm">Analyzing profit margins…</p>
              </div>
            </div>
          ) : null}
          {result ? <ProfitResult data={result} /> : null}
        </div>
      </div>
    </div>
  )
}

function ProfitResult({ data }: { data: unknown }) {
  const d = data as Record<string, unknown>

  const services = Array.isArray(d.services) ? (d.services as Array<Record<string, unknown>>) : []
  const pricingLevers = Array.isArray(d.pricingLevers) ? (d.pricingLevers as Array<Record<string, unknown>>) : []
  const costCuts = Array.isArray(d.costCutOpportunities) ? (d.costCutOpportunities as Array<Record<string, unknown>>) : []
  const actions = Array.isArray(d.immediateActions) ? (d.immediateActions as string[]) : []

  const tierBadge = (tier: string) => {
    if (tier === "star") return "bg-emerald-900/50 text-emerald-300 border-emerald-700/50"
    if (tier === "cashcow") return "bg-teal-900/50 text-teal-300 border-teal-700/50"
    if (tier === "questionmark") return "bg-amber-900/50 text-amber-300 border-amber-700/50"
    return "bg-red-900/50 text-red-300 border-red-700/50"
  }
  const tierLabel = (tier: string) => {
    if (tier === "star") return "⭐ Star"
    if (tier === "cashcow") return "🐄 Cash Cow"
    if (tier === "questionmark") return "❓ Question Mark"
    return "🐕 Dog"
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-lg font-bold text-white">{String(d.headline ?? "")}</p>
        <div className="flex gap-4 mt-1 text-sm text-gray-400">
          <span>Total Revenue: <strong className="text-white">${Number(d.totalRevenue ?? 0).toLocaleString()}</strong></span>
          <span>Net Profit: <strong className="text-green-400">${Number(d.netProfit ?? 0).toLocaleString()}</strong></span>
          <span>Margin: <strong className="text-white">{String(d.netMarginPct ?? 0)}%</strong></span>
        </div>
      </div>

      {services.length > 0 ? (
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Service Breakdown</p>
          <div className="space-y-2">
            {services.map((svc, i) => (
              <div key={i} className="border border-gray-700 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-semibold text-white">{String(svc.name ?? "")}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${tierBadge(String(svc.tier ?? ""))}`}>
                    {tierLabel(String(svc.tier ?? ""))}
                  </span>
                </div>
                <div className="flex gap-3 text-xs text-gray-400">
                  <span>Revenue: <strong className="text-white">${Number(svc.monthlyRevenue ?? 0).toLocaleString()}</strong></span>
                  <span>Margin: <strong className="text-green-400">{String(svc.marginPct ?? 0)}%</strong></span>
                  {svc.revenuePerHour ? <span>$/hr: <strong className="text-white">${Number(svc.revenuePerHour).toFixed(0)}</strong></span> : null}
                </div>
                {svc.recommendation ? <p className="text-xs text-gray-500 mt-1">{String(svc.recommendation)}</p> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {pricingLevers.length > 0 ? (
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Pricing Levers</p>
          <div className="space-y-2">
            {pricingLevers.map((lever, i) => (
              <div key={i} className="border border-gray-700 rounded-lg p-3">
                <p className="text-sm font-semibold text-white">{String(lever.action ?? lever.title ?? "")}</p>
                <p className="text-xs text-gray-400 mt-0.5">{String(lever.rationale ?? lever.description ?? "")}</p>
                {lever.estimatedImpact ? <p className="text-xs text-green-400 mt-1 font-medium">{String(lever.estimatedImpact)}</p> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {costCuts.length > 0 ? (
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Cost Cut Opportunities</p>
          <div className="space-y-2">
            {costCuts.map((cut, i) => (
              <div key={i} className="border border-gray-700/50 rounded-lg p-3 bg-gray-800/30">
                <p className="text-sm font-semibold text-white">{String(cut.item ?? cut.area ?? "")}</p>
                <p className="text-xs text-gray-400 mt-0.5">{String(cut.action ?? cut.description ?? "")}</p>
                {cut.estimatedSavings ? <p className="text-xs text-amber-400 mt-1 font-medium">Save {String(cut.estimatedSavings)}</p> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {actions.length > 0 ? (
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Immediate Actions</p>
          <ol className="space-y-1.5">
            {actions.map((a, i) => (
              <li key={i} className="flex gap-2 text-sm text-gray-300">
                <span className="text-green-400 font-bold shrink-0">{i + 1}.</span>
                {a}
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
