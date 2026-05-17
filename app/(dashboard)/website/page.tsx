"use client"

import { useState, useEffect } from "react"

interface Site {
  id: string
  slug: string
  title: string
  html: string
  published: boolean
  createdAt: string
}

interface Business {
  id: string
  name: string
  type: string
  location: string
  website: string | null
  brandVoice: Record<string, unknown>
}

function GlowDot({ color = "bg-indigo-400" }: { color?: string }) {
  return (
    <span className="relative flex h-2 w-2 shrink-0">
      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${color} opacity-60`} style={{ animationDuration: "2s" }} />
      <span className={`relative inline-flex h-2 w-2 rounded-full ${color}`} />
    </span>
  )
}

export default function WebsitePage() {
  const [business, setBusiness]     = useState<Business | null>(null)
  const [sites, setSites]           = useState<Site[]>([])
  const [loading, setLoading]       = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError]           = useState("")
  const [preview, setPreview]       = useState<Site | null>(null)

  const [brandColor, setBrandColor] = useState("#6366f1")
  const [tagline, setTagline]       = useState("")
  const [services, setServices]     = useState("")
  const [progress, setProgress]     = useState(0)

  useEffect(() => {
    fetch("/api/businesses/current")
      .then(r => r.json())
      .then(d => {
        if (d.business) {
          setBusiness(d.business)
          const bv = d.business.brandVoice as Record<string, unknown>
          if (Array.isArray(bv?.keyServices)) setServices((bv.keyServices as string[]).join(", "))
          return fetch(`/api/agents/website?businessId=${d.business.id}`)
        }
      })
      .then(r => r?.json())
      .then(d => { if (d?.sites) setSites(d.sites) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function generate() {
    if (!business) return
    setGenerating(true)
    setError("")
    setProgress(0)

    const STEPS = [
      { pct: 8,  msg: "Analysing brand voice…" },
      { pct: 22, msg: "Crafting your hero section…" },
      { pct: 38, msg: "Writing service cards…" },
      { pct: 55, msg: "Building WebGL shader background…" },
      { pct: 70, msg: "Adding particle effects…" },
      { pct: 84, msg: "Optimising for mobile…" },
      { pct: 95, msg: "Finalising…" },
    ]
    let step = 0
    const tick = setInterval(() => {
      if (step < STEPS.length) { setProgress(STEPS[step].pct); step++ }
    }, 2200)

    try {
      const res = await fetch("/api/agents/website", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId: business.id,
          brandColor,
          tagline:    tagline || undefined,
          services:   services ? services.split(",").map(s => s.trim()).filter(Boolean) : undefined,
        }),
      })
      clearInterval(tick)
      setProgress(100)

      const data = await res.json()
      if (!res.ok) { setError(data.error ?? "Failed to generate"); return }

      setSites(prev => [data.site, ...prev])
      setPreview(data.site)
    } catch {
      setError("Network error — please try again")
    } finally {
      clearInterval(tick)
      setGenerating(false)
      setTimeout(() => setProgress(0), 1000)
    }
  }

  async function togglePublish(site: Site) {
    const res = await fetch("/api/agents/website", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId: site.id, published: !site.published }),
    })
    if (res.ok) {
      const d = await res.json()
      setSites(prev => prev.map(s => s.id === site.id ? d.site : s))
      if (preview?.id === site.id) setPreview(d.site)
    }
  }

  const PROGRESS_MSGS: Record<number, string> = {
    8: "Analysing brand voice…",
    22: "Crafting your hero section…",
    38: "Writing service cards…",
    55: "Building WebGL shader background…",
    70: "Adding particle effects…",
    84: "Optimising for mobile…",
    95: "Finalising…",
    100: "Done!",
  }
  const progressMsg = Object.entries(PROGRESS_MSGS).reverse().find(([k]) => progress >= Number(k))?.[1] ?? ""

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-gray-500">
          <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          Loading…
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <GlowDot color="bg-indigo-400" />
            <span className="text-xs font-semibold text-indigo-400 uppercase tracking-widest">AI Agent</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Website Builder</h1>
          <p className="text-gray-400 mt-1 text-sm max-w-lg">
            Generate a complete, SEO-ready website with WebGL 3D effects, mobile-first design, and conversion-optimised copy — in under 60 seconds. No developer required.
          </p>
        </div>
        <div className="flex items-center gap-2 bg-indigo-950/40 border border-indigo-800/40 rounded-xl px-4 py-2">
          <span className="text-xs text-indigo-400 font-semibold">Saves ~40 hrs</span>
          <span className="text-xs text-gray-700">vs. hiring a dev</span>
        </div>
      </div>

      <div className="grid lg:grid-cols-[420px_1fr] gap-6">
        {/* ── Left: Generator ── */}
        <div className="space-y-4">
          {/* Config card */}
          <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-6">
            <h2 className="font-semibold text-white mb-5 flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-indigo-900/60 border border-indigo-800/50 flex items-center justify-center text-xs text-indigo-400">1</span>
              Configure your site
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1.5 font-medium uppercase tracking-wider">Brand Color</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color" value={brandColor}
                    onChange={e => setBrandColor(e.target.value)}
                    className="w-10 h-10 rounded-lg border border-gray-700 cursor-pointer bg-transparent"
                  />
                  <input
                    type="text" value={brandColor}
                    onChange={e => setBrandColor(e.target.value)}
                    className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1.5 font-medium uppercase tracking-wider">Tagline <span className="text-gray-700 normal-case">(optional — AI writes one if blank)</span></label>
                <input
                  type="text" value={tagline}
                  onChange={e => setTagline(e.target.value)}
                  placeholder="e.g. Phoenix's most trusted HVAC team"
                  className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1.5 font-medium uppercase tracking-wider">Services <span className="text-gray-700 normal-case">(comma-separated)</span></label>
                <textarea
                  value={services}
                  onChange={e => setServices(e.target.value)}
                  placeholder="AC Repair, Heating Install, Tune-Ups, Emergency Service"
                  rows={3}
                  className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>
            </div>

            {/* Progress bar */}
            {generating && (
              <div className="mt-4">
                <div className="flex justify-between text-xs mb-2">
                  <span className="text-indigo-400 font-medium">{progressMsg}</span>
                  <span className="text-gray-600">{progress}%</span>
                </div>
                <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${progress}%`, background: "linear-gradient(90deg, #4f46e5, #7c3aed)" }}
                  />
                </div>
              </div>
            )}

            {error && <p className="mt-3 text-red-400 text-sm">{error}</p>}

            <button
              onClick={generate}
              disabled={generating || !business}
              className="mt-5 w-full py-3 text-white font-bold rounded-xl text-sm transition-all disabled:opacity-40 hover:brightness-110"
              style={{ background: "linear-gradient(135deg, #4f46e5, #7c3aed)" }}
            >
              {generating ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Generating…
                </span>
              ) : "Generate Website"}
            </button>

            <p className="text-xs text-gray-700 text-center mt-2">Takes ~45–90 seconds · Complete HTML output</p>
          </div>

          {/* Previous sites */}
          {sites.length > 0 && (
            <div className="bg-gray-900/80 border border-gray-800 rounded-2xl overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-800">
                <h3 className="font-semibold text-white text-sm">Generated Sites ({sites.length})</h3>
              </div>
              <div className="divide-y divide-gray-800/60">
                {sites.map(s => (
                  <div key={s.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{s.title}</p>
                      <p className="text-xs text-gray-600 mt-0.5">{new Date(s.createdAt).toLocaleDateString()}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => setPreview(s)}
                        className="text-xs px-2.5 py-1 border border-gray-700 hover:border-indigo-600 text-gray-400 hover:text-indigo-400 rounded-lg transition-colors"
                      >
                        Preview
                      </button>
                      <button
                        onClick={() => togglePublish(s)}
                        className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors border ${
                          s.published
                            ? "bg-emerald-950/40 border-emerald-800/40 text-emerald-400 hover:bg-red-950/40 hover:border-red-800/40 hover:text-red-400"
                            : "bg-gray-800 border-gray-700 text-gray-500 hover:border-emerald-700 hover:text-emerald-400"
                        }`}
                      >
                        {s.published ? "Live" : "Publish"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Right: Preview ── */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-2xl overflow-hidden flex flex-col" style={{ minHeight: "600px" }}>
          {preview ? (
            <>
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800 bg-gray-900/60">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-500/50" />
                    <div className="w-3 h-3 rounded-full bg-yellow-500/50" />
                    <div className="w-3 h-3 rounded-full bg-emerald-500/50" />
                  </div>
                  <span className="text-xs text-gray-600 font-mono ml-2">{preview.slug}.autopilot.ai</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const w = window.open("", "_blank")
                      if (w) { w.document.write(preview.html); w.document.close() }
                    }}
                    className="text-xs px-3 py-1.5 border border-gray-700 hover:border-indigo-600 text-gray-400 hover:text-indigo-400 rounded-lg transition-colors"
                  >
                    Open full screen ↗
                  </button>
                  <button
                    onClick={() => {
                      const blob = new Blob([preview.html], { type: "text/html" })
                      const a = document.createElement("a")
                      a.href = URL.createObjectURL(blob)
                      a.download = `${preview.slug}.html`
                      a.click()
                    }}
                    className="text-xs px-3 py-1.5 border border-gray-700 hover:border-emerald-700 text-gray-400 hover:text-emerald-400 rounded-lg transition-colors"
                  >
                    Download HTML
                  </button>
                </div>
              </div>
              <iframe
                srcDoc={preview.html}
                className="flex-1 w-full border-0"
                title="Website Preview"
                sandbox="allow-scripts"
              />
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <div className="w-16 h-16 rounded-2xl border border-gray-800 flex items-center justify-center mb-4 bg-gray-900">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-700">
                  <rect x="2" y="3" width="20" height="14" rx="2" />
                  <path d="M8 21h8M12 17v4" />
                </svg>
              </div>
              <p className="text-gray-500 font-medium mb-1">No preview yet</p>
              <p className="text-gray-700 text-sm">Configure your settings and click Generate Website to build your site.</p>

              {/* Feature list */}
              <div className="mt-8 text-left w-full max-w-sm">
                <p className="text-xs text-gray-600 uppercase tracking-widest font-semibold mb-3">What gets generated</p>
                <div className="space-y-2">
                  {[
                    ["WebGL 3D animated hero", "Three.js shader + rotating object"],
                    ["Particle system", "400+ floating particles"],
                    ["Mouse parallax", "Layers move at different depths"],
                    ["Scroll reveals", "Sections animate in as you scroll"],
                    ["Mobile-first", "Fully responsive on all devices"],
                    ["SEO-ready", "Semantic HTML + meta tags included"],
                    ["Contact form", "Visual form with your details"],
                    ["Testimonials", "Pulls from your real reviews"],
                  ].map(([feat, desc]) => (
                    <div key={feat} className="flex items-start gap-2.5">
                      <span className="text-emerald-500 text-xs mt-0.5">✓</span>
                      <div>
                        <span className="text-xs text-gray-400 font-medium">{feat}</span>
                        <span className="text-xs text-gray-700"> — {desc}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
