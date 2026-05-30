"use client"
import { useState } from "react"

type Tab = "keyword-strategy" | "blog-post"

const TABS: { id: Tab; label: string; description: string }[] = [
  { id: "keyword-strategy", label: "Keyword Strategy", description: "AI maps your highest-value local keywords, content gaps, and 90-day quick wins" },
  { id: "blog-post",        label: "Blog Post",         description: "Write a fully-optimized SEO article that ranks AND converts" },
]

export default function SEOPage() {
  const [tab, setTab]         = useState<Tab>("keyword-strategy")
  const [loading, setLoading] = useState(false)
  const [result, setResult]   = useState<Record<string, unknown> | null>(null)
  const [error, setError]     = useState("")

  const [keywordForm, setKeywordForm] = useState({ competitors: "" })
  const [blogForm, setBlogForm]       = useState({ keyword: "", wordCount: "1200" })

  async function generate() {
    setLoading(true); setError(""); setResult(null)
    try {
      const busRes  = await fetch("/api/businesses/current")
      const busData = await busRes.json()
      if (!busData.business) throw new Error("Business not found — complete onboarding first")
      const businessId = busData.business.id

      const body: Record<string, unknown> = { businessId, action: tab }
      if (tab === "blog-post") {
        if (!blogForm.keyword) throw new Error("Target keyword is required")
        body.keyword   = blogForm.keyword
        body.wordCount = parseInt(blogForm.wordCount, 10) || 1200
      }

      const res = await fetch("/api/agents/seo", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
      setResult(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-teal-500/20 border border-teal-500/30 flex items-center justify-center text-lg">🔎</div>
          <h1 className="text-2xl font-bold">SEO Agent</h1>
          <span className="text-xs bg-teal-900/40 text-teal-400 border border-teal-800/50 rounded-full px-2 py-0.5 ml-1">
            claude-sonnet
          </span>
        </div>
        <p className="text-gray-400">
          Rank on page 1. The SEO agent maps your keyword opportunities and writes content that ranks AND converts.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit mb-6">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); setResult(null) }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              tab === t.id ? "bg-teal-600 text-white" : "text-gray-400 hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Form */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
          <p className="text-sm text-gray-400">{TABS.find(t => t.id === tab)?.description}</p>

          {tab === "keyword-strategy" && (
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">
                Competitor domains (optional, comma-separated)
              </label>
              <input
                value={keywordForm.competitors}
                onChange={e => setKeywordForm(f => ({ ...f, competitors: e.target.value }))}
                placeholder="e.g. competitorA.com, competitorB.com"
                className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-600 text-sm focus:outline-none focus:border-teal-500"
              />
              <p className="text-xs text-gray-600 mt-2">
                Leave blank — the agent will use your business type and location to identify opportunities automatically.
              </p>
            </div>
          )}

          {tab === "blog-post" && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Target keyword *</label>
                <input
                  value={blogForm.keyword}
                  onChange={e => setBlogForm(f => ({ ...f, keyword: e.target.value }))}
                  placeholder="e.g. best plumber in Austin"
                  className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-600 text-sm focus:outline-none focus:border-teal-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Word count</label>
                <select
                  value={blogForm.wordCount}
                  onChange={e => setBlogForm(f => ({ ...f, wordCount: e.target.value }))}
                  className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-teal-500"
                >
                  <option value="800">800 words (quick read)</option>
                  <option value="1200">1,200 words (standard)</option>
                  <option value="1800">1,800 words (comprehensive)</option>
                  <option value="2500">2,500 words (pillar content)</option>
                </select>
              </div>
            </>
          )}

          {error && (
            <div className="bg-red-950/40 border border-red-800/50 rounded-lg px-3 py-2.5">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          <button
            onClick={generate}
            disabled={loading}
            className="w-full py-3 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white font-semibold rounded-xl transition flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Agent working…
              </>
            ) : (
              tab === "keyword-strategy" ? "Generate Keyword Strategy" : "Generate Blog Post"
            )}
          </button>
        </div>

        {/* Output */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 overflow-auto max-h-[600px]">
          {!result && !loading && (
            <div className="h-full flex items-center justify-center min-h-[300px]">
              <div className="text-center">
                <div className="text-4xl mb-3">🔎</div>
                <p className="text-gray-500 text-sm">
                  {tab === "keyword-strategy"
                    ? "Your keyword map will appear here.\nIncludes primary keywords, local variations,\ncontent gaps, and 90-day quick wins."
                    : "Your SEO article will appear here.\nFull markdown with meta description,\nslug, and internal link suggestions."}
                </p>
              </div>
            </div>
          )}

          {loading && (
            <div className="h-full flex items-center justify-center min-h-[300px]">
              <div className="text-center">
                <div className="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-gray-400 text-sm font-medium">Agent reasoning…</p>
                <p className="text-gray-600 text-xs mt-1">Analyzing intent, competition, and local signals</p>
              </div>
            </div>
          )}

          {result !== null && !loading && (
            <SEOOutput result={result} tab={tab} />
          )}
        </div>
      </div>
    </div>
  )
}

function SEOOutput({ result, tab }: { result: Record<string, unknown>; tab: Tab }) {
  const data = result

  if (tab === "keyword-strategy") {
    const strategy = data.strategy as Record<string, unknown> | undefined
    if (!strategy) return <pre className="text-xs text-gray-300 whitespace-pre-wrap">{JSON.stringify(result, null, 2)}</pre>

    const primary = (strategy.primaryKeywords as Array<{ keyword: string; intent: string; difficulty: string; priority: string }>) ?? []
    const local   = (strategy.localKeywords as string[]) ?? []
    const gaps    = (strategy.contentGaps as string[]) ?? []
    const wins    = (strategy.quickWins as string[]) ?? []

    return (
      <div className="space-y-5 text-sm">
        <Section title="Primary Keywords" count={primary.length}>
          <div className="space-y-2">
            {primary.map((kw, i) => (
              <div key={i} className="flex items-center justify-between bg-gray-800/60 rounded-lg px-3 py-2">
                <span className="text-white font-medium">{kw.keyword}</span>
                <div className="flex items-center gap-2">
                  <Badge label={kw.intent}    color="blue" />
                  <Badge label={kw.difficulty} color={kw.difficulty === "low" ? "green" : kw.difficulty === "medium" ? "yellow" : "red"} />
                  <Badge label={kw.priority}  color={kw.priority === "high" ? "teal" : "gray"} />
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Local Keyword Variations" count={local.length}>
          <div className="flex flex-wrap gap-2">
            {local.map((kw, i) => (
              <span key={i} className="text-xs bg-teal-900/30 text-teal-300 border border-teal-800/40 rounded-full px-2.5 py-1">{kw}</span>
            ))}
          </div>
        </Section>

        <Section title="Content Gaps" count={gaps.length}>
          <ul className="space-y-1.5">
            {gaps.map((g, i) => <li key={i} className="text-gray-300 flex items-start gap-2"><span className="text-orange-400 mt-0.5">→</span>{g}</li>)}
          </ul>
        </Section>

        <Section title="90-Day Quick Wins" count={wins.length}>
          <ul className="space-y-1.5">
            {wins.map((w, i) => <li key={i} className="text-gray-300 flex items-start gap-2"><span className="text-emerald-400 mt-0.5">✓</span>{w}</li>)}
          </ul>
        </Section>
      </div>
    )
  }

  // Blog post output
  const post = (data.post as Record<string, unknown>) ?? data
  const title           = typeof post.title           === "string" ? post.title           : undefined
  const metaDescription = typeof post.metaDescription === "string" ? post.metaDescription : undefined
  const slug            = typeof post.slug            === "string" ? post.slug            : undefined
  const body            = typeof post.body            === "string" ? post.body            : undefined
  const internalLinks   = Array.isArray(post.internalLinks)        ? (post.internalLinks as string[]) : []

  return (
    <div className="space-y-4 text-sm">
      {title && (
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Title</p>
          <p className="text-white font-semibold">{title}</p>
        </div>
      )}
      {metaDescription && (
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Meta Description</p>
          <p className="text-gray-300">{metaDescription}</p>
        </div>
      )}
      {slug && (
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Slug</p>
          <code className="text-teal-400 text-xs bg-gray-800 px-2 py-1 rounded">/{slug}</code>
        </div>
      )}
      {internalLinks.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Suggested Internal Links</p>
          <ul className="space-y-1">
            {internalLinks.map((l, i) => (
              <li key={i} className="text-teal-300 text-xs">→ {l}</li>
            ))}
          </ul>
        </div>
      )}
      {body && (
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Article</p>
          <pre className="text-xs text-gray-300 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
            {body}
          </pre>
        </div>
      )}
    </div>
  )
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{title}</p>
        <span className="text-xs text-gray-600">({count})</span>
      </div>
      {children}
    </div>
  )
}

function Badge({ label, color }: { label: string; color: string }) {
  const colors: Record<string, string> = {
    blue:   "bg-blue-900/30 text-blue-300 border-blue-800/40",
    green:  "bg-emerald-900/30 text-emerald-300 border-emerald-800/40",
    yellow: "bg-amber-900/30 text-amber-300 border-amber-800/40",
    red:    "bg-red-900/30 text-red-300 border-red-800/40",
    teal:   "bg-teal-900/30 text-teal-300 border-teal-800/40",
    gray:   "bg-gray-800 text-gray-400 border-gray-700",
  }
  return (
    <span className={`text-xs border rounded-full px-2 py-0.5 ${colors[color] ?? colors.gray}`}>
      {label}
    </span>
  )
}
