"use client"
import { useState } from "react"

type Tab = "campaign" | "templates"

export default function ReviewGenPage() {
  const [tab, setTab] = useState<Tab>("campaign")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<unknown>(null)
  const [error, setError] = useState("")

  const [campaignForm, setCampaignForm] = useState({ currentRating: "", currentReviewCount: "", primaryPlatform: "Google", reviewPageUrl: "" })
  const [templatesForm, setTemplatesForm] = useState({ platform: "Google", ownerName: "" })

  async function generate() {
    setLoading(true); setError(""); setResult(null)
    try {
      let body: Record<string, unknown> = { action: tab }
      if (tab === "campaign") body = { ...body, ...campaignForm, currentRating: campaignForm.currentRating ? Number(campaignForm.currentRating) : undefined, currentReviewCount: campaignForm.currentReviewCount ? Number(campaignForm.currentReviewCount) : undefined }
      if (tab === "templates") body = { ...body, ...templatesForm }

      const res = await fetch("/api/agents/review-gen", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      if (!res.ok) throw new Error(await res.text())
      setResult(await res.json())
    } catch (e) { setError(e instanceof Error ? e.message : "Failed") }
    finally { setLoading(false) }
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-lg">⭐</div>
          <h1 className="text-2xl font-bold">Review Generation Agent</h1>
        </div>
        <p className="text-gray-400">Systematically get more 5-star reviews from happy customers — while catching unhappy ones before they post publicly.</p>
      </div>

      <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit mb-6">
        {([["campaign", "Full Campaign System"], ["templates", "Request Templates"]] as const).map(([id, label]) => (
          <button key={id} onClick={() => { setTab(id); setResult(null) }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === id ? "bg-amber-600 text-white" : "text-gray-400 hover:text-white"}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
          {tab === "campaign" && <>
            <p className="text-sm text-gray-400">Complete review generation system: when to ask, how to ask, and how to filter negative feedback privately.</p>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Primary review platform</label>
              <select value={campaignForm.primaryPlatform} onChange={e => setCampaignForm(f => ({ ...f, primaryPlatform: e.target.value }))}
                className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500">
                {["Google", "Yelp", "Facebook", "Trustpilot", "TripAdvisor", "Houzz", "Healthgrades"].map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <Field label="Current star rating (optional)" value={campaignForm.currentRating} onChange={v => setCampaignForm(f => ({ ...f, currentRating: v }))} placeholder="e.g. 4.1" accent="amber" />
            <Field label="Number of current reviews (optional)" value={campaignForm.currentReviewCount} onChange={v => setCampaignForm(f => ({ ...f, currentReviewCount: v }))} placeholder="e.g. 23" accent="amber" />
            <Field label="Direct review page URL (optional)" value={campaignForm.reviewPageUrl} onChange={v => setCampaignForm(f => ({ ...f, reviewPageUrl: v }))} placeholder="e.g. g.page/your-business/review" accent="amber" />
          </>}

          {tab === "templates" && <>
            <p className="text-sm text-gray-400">Ready-to-use templates for every channel: email, SMS, in-person, receipt, card.</p>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Review platform</label>
              <select value={templatesForm.platform} onChange={e => setTemplatesForm(f => ({ ...f, platform: e.target.value }))}
                className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500">
                {["Google", "Yelp", "Facebook", "Trustpilot"].map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <Field label="Your name (optional)" value={templatesForm.ownerName} onChange={v => setTemplatesForm(f => ({ ...f, ownerName: v }))} placeholder="e.g. Sarah" accent="amber" />
          </>}

          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button onClick={generate} disabled={loading} className="w-full py-3 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-semibold rounded-xl transition">
            {loading ? "Building system…" : "Generate Review System"}
          </button>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 overflow-auto max-h-[600px]">
          {!result && !loading && <div className="h-full flex items-center justify-center"><p className="text-gray-600 text-sm text-center">Your review generation system will appear here.</p></div>}
          {loading && <div className="h-full flex items-center justify-center"><div className="text-center"><div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" /><p className="text-gray-400 text-sm">Building your review system…</p></div></div>}
          {result ? <ReviewResult data={result} /> : null}
        </div>
      </div>
    </div>
  )
}

function ReviewResult({ data }: { data: unknown }) {
  const d = data as Record<string, unknown>
  return (
    <div className="space-y-4">
      {d.strategy ? <div className="border border-amber-800/40 bg-amber-950/20 rounded-lg p-3"><p className="text-xs font-bold text-amber-400 mb-1">Strategy</p><p className="text-sm text-gray-300">{String(d.strategy)}</p></div> : null}
      {Array.isArray(d.goalTimeline) ? (
        <div>
          <h3 className="text-xs font-bold text-white mb-2">90-Day Timeline</h3>
          {(d.goalTimeline as Array<Record<string, unknown>>).map((g, i) => (
            <div key={i} className="flex items-start gap-3 mb-2">
              <span className="text-xs bg-gray-800 border border-gray-700 rounded px-2 py-1 shrink-0">{String(g.timeframe)}</span>
              <div><p className="text-xs text-amber-400">{String(g.targetReviews)} reviews · {String(g.targetRating)} ★</p></div>
            </div>
          ))}
        </div>
      ) : null}
      {d.negativeFilterSystem ? (
        <div className="border border-red-800/30 bg-red-950/20 rounded-lg p-3">
          <h3 className="text-xs font-bold text-red-400 mb-2">Negative Review Filter</h3>
          <p className="text-xs text-gray-300">{String((d.negativeFilterSystem as Record<string, unknown>).preScreenQuestion ?? "")}</p>
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
