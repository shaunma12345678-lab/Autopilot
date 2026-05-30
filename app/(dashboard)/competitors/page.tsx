"use client"
import { useState } from "react"

type Tab = "analyze" | "swot"

export default function CompetitorsPage() {
  const [tab, setTab] = useState<Tab>("analyze")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<unknown>(null)
  const [error, setError] = useState("")

  const [analyzeForm, setAnalyzeForm] = useState({ competitors: "", yourStrengths: "", yourWeaknesses: "" })
  const [swotForm, setSwotForm] = useState({ industry: "" })

  async function generate() {
    setLoading(true); setError(""); setResult(null)
    try {
      let body: Record<string, unknown> = { action: tab }
      if (tab === "analyze") {
        body = {
          ...body,
          competitors: analyzeForm.competitors.split(",").map(s => s.trim()).filter(Boolean),
          yourStrengths: analyzeForm.yourStrengths.split(",").map(s => s.trim()).filter(Boolean),
          yourWeaknesses: analyzeForm.yourWeaknesses.split(",").map(s => s.trim()).filter(Boolean),
        }
      }
      if (tab === "swot") body = { ...body, ...swotForm }

      const res = await fetch("/api/agents/competitors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      if (!res.ok) throw new Error(await res.text())
      setResult(await res.json())
    } catch (e) { setError(e instanceof Error ? e.message : "Failed") }
    finally { setLoading(false) }
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center text-lg">🔍</div>
          <h1 className="text-2xl font-bold">Competitor Intel Agent</h1>
        </div>
        <p className="text-gray-400">Know exactly where you stand, where the gaps are, and how to position yourself to win.</p>
      </div>

      <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit mb-6">
        {([["analyze", "Competitor Analysis"], ["swot", "SWOT Analysis"]] as const).map(([id, label]) => (
          <button key={id} onClick={() => { setTab(id); setResult(null) }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === id ? "bg-violet-600 text-white" : "text-gray-400 hover:text-white"}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
          {tab === "analyze" && <>
            <p className="text-sm text-gray-400">Profile your competitors, identify gaps, and get a battle card for each.</p>
            <Field label="Competitors (comma-separated)" value={analyzeForm.competitors} onChange={v => setAnalyzeForm(f => ({ ...f, competitors: v }))} placeholder="e.g. Smith's Plumbing, ABC Drain, City Pipe Co" accentColor="violet" />
            <Field label="Your strengths (comma-separated)" value={analyzeForm.yourStrengths} onChange={v => setAnalyzeForm(f => ({ ...f, yourStrengths: v }))} placeholder="e.g. 24/7 availability, 10 years experience, 5-star rated" accentColor="violet" />
            <Field label="Potential weaknesses (comma-separated)" value={analyzeForm.yourWeaknesses} onChange={v => setAnalyzeForm(f => ({ ...f, yourWeaknesses: v }))} placeholder="e.g. Higher pricing, smaller team (optional)" accentColor="violet" />
          </>}

          {tab === "swot" && <>
            <p className="text-sm text-gray-400">Full SWOT analysis with actionable strategies for each quadrant.</p>
            <Field label="Industry / market" value={swotForm.industry} onChange={v => setSwotForm({ industry: v })} placeholder="e.g. Residential plumbing, dental care, fitness coaching" accentColor="violet" />
          </>}

          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button onClick={generate} disabled={loading} className="w-full py-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-semibold rounded-xl transition">
            {loading ? "Analyzing…" : "Run Analysis"}
          </button>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 overflow-auto max-h-[600px]">
          {!result && !loading && <EmptyState text="Your competitive intelligence will appear here." />}
          {loading && <LoadingSpinner color="violet" text="Running competitive analysis…" />}
          {result && tab === "analyze" ? <CompetitorResult data={result} /> : null}
          {result && tab === "swot" ? <SwotResult data={result} /> : null}
        </div>
      </div>
    </div>
  )
}

function CompetitorResult({ data }: { data: unknown }) {
  const d = data as Record<string, unknown>
  return (
    <div className="space-y-4">
      {Array.isArray(d.opportunities) ? (
        <div>
          <h3 className="text-sm font-bold text-white mb-2">Top Opportunities</h3>
          {(d.opportunities as Array<Record<string, unknown>>).slice(0, 3).map((o, i) => (
            <div key={i} className="border border-gray-700 rounded-lg p-3 mb-2">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${o.estimatedImpact === "high" ? "bg-emerald-900/50 text-emerald-400 border border-emerald-800" : "bg-amber-900/50 text-amber-400 border border-amber-800"}`}>{String(o.estimatedImpact)} impact</span>
                <span className="text-xs text-gray-600">{String(o.effort)} effort</span>
              </div>
              <p className="text-sm text-white font-medium">{String(o.opportunity)}</p>
              <p className="text-xs text-gray-400 mt-1">{String(o.howToCapture)}</p>
            </div>
          ))}
        </div>
      ) : null}
      {d.positioningRecommendation ? (
        <div className="border border-violet-800/40 bg-violet-950/20 rounded-lg p-3">
          <h3 className="text-xs font-bold text-violet-400 mb-1">Recommended Positioning</h3>
          <p className="text-sm text-white">{String((d.positioningRecommendation as Record<string, unknown>).tagline ?? "")}</p>
        </div>
      ) : null}
      <pre className="text-xs text-gray-500 whitespace-pre-wrap mt-2">{JSON.stringify(data, null, 2)}</pre>
    </div>
  )
}

function SwotResult({ data }: { data: unknown }) {
  const d = data as Record<string, unknown>
  const sections = [
    { key: "strengths", label: "Strengths", color: "emerald" },
    { key: "weaknesses", label: "Weaknesses", color: "red" },
    { key: "opportunities", label: "Opportunities", color: "cyan" },
    { key: "threats", label: "Threats", color: "amber" },
  ] as const
  return (
    <div className="space-y-3">
      {sections.map(s => Array.isArray(d[s.key]) ? (
        <div key={s.key} className="border border-gray-700 rounded-lg p-3">
          <h3 className={`text-xs font-bold text-${s.color}-400 mb-2`}>{s.label}</h3>
          {(d[s.key] as Array<Record<string, unknown>>).map((item, i) => (
            <p key={i} className="text-xs text-gray-300 mb-1">• {String(item.item ?? item)}</p>
          ))}
        </div>
      ) : null)}
      {Array.isArray(d.top3Actions) ? (
        <div className="border border-violet-800/40 bg-violet-950/20 rounded-lg p-3">
          <h3 className="text-xs font-bold text-violet-400 mb-2">Top 3 Actions This Month</h3>
          {(d.top3Actions as string[]).map((a, i) => <p key={i} className="text-xs text-gray-300 mb-1">{i + 1}. {a}</p>)}
        </div>
      ) : null}
    </div>
  )
}

function Field({ label, value, onChange, placeholder, accentColor }: { label: string; value: string; onChange: (v: string) => void; placeholder: string; accentColor: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-400 mb-1.5">{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className={`w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-600 text-sm focus:outline-none focus:border-${accentColor}-500`} />
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return <div className="h-full flex items-center justify-center"><p className="text-gray-600 text-sm text-center">{text}</p></div>
}

function LoadingSpinner({ color, text }: { color: string; text: string }) {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center">
        <div className={`w-8 h-8 border-2 border-${color}-500 border-t-transparent rounded-full animate-spin mx-auto mb-3`} />
        <p className="text-gray-400 text-sm">{text}</p>
      </div>
    </div>
  )
}
