"use client"

import { useState, useEffect, useRef } from "react"

interface Site {
  id:        string
  slug:      string
  title:     string
  html:      string
  published: boolean
  createdAt: string
}

interface CROIssue {
  severity: "critical" | "high" | "medium"
  issue:    string
  fix:      string
}

interface Business {
  id:         string
  name:       string
  type:       string
  location:   string
  website:    string | null
  brandVoice: Record<string, unknown>
}

type Device = "desktop" | "tablet" | "mobile"

const DEVICE_WIDTHS: Record<Device, string> = {
  desktop: "100%",
  tablet:  "768px",
  mobile:  "390px",
}

const DEVICE_ICONS: Record<Device, string> = {
  desktop: "🖥",
  tablet:  "📱",
  mobile:  "📲",
}

const PROGRESS_STEPS = [
  { pct: 5,  msg: "Selecting font pair and section plan…" },
  { pct: 12, msg: "Generating with 20 techniques…" },
  { pct: 25, msg: "Building hero with WebGL shader…" },
  { pct: 38, msg: "Writing kinetic typography animations…" },
  { pct: 50, msg: "Crafting service cards and layout…" },
  { pct: 63, msg: "Adding testimonials and social proof…" },
  { pct: 75, msg: "Assembling scroll scrub animations…" },
  { pct: 85, msg: "Finalising CSS grain and micro-interactions…" },
  { pct: 93, msg: "Verifying all sections complete…" },
  { pct: 98, msg: "Saving your site…" },
]

const EXAMPLE_PROMPTS = [
  "Dark luxury theme, serif fonts, no cursor effects, add pricing and FAQ sections",
  "Light minimal style, centered layout, target: restaurant owners, add water shader",
  "Bold corporate feel, split hero layout, blue palette, add testimonials and contact",
  "Playful colorful design, add aurora shader, include blog section and pricing",
]

function DirectiveChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-indigo-950/60 border border-indigo-800/50 text-indigo-300">
      {label}
      <button onClick={onRemove} className="hover:text-red-400 transition-colors ml-0.5">×</button>
    </span>
  )
}

function CROBadge({ severity }: { severity: "critical" | "high" | "medium" }) {
  const colors = {
    critical: "bg-red-950/60 border-red-800/50 text-red-400",
    high:     "bg-orange-950/60 border-orange-800/50 text-orange-400",
    medium:   "bg-yellow-950/60 border-yellow-800/50 text-yellow-400",
  }
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded border font-semibold uppercase tracking-wider ${colors[severity]}`}>
      {severity}
    </span>
  )
}

export default function WebsitePage() {
  const [business,    setBusiness]    = useState<Business | null>(null)
  const [sites,       setSites]       = useState<Site[]>([])
  const [loading,     setLoading]     = useState(true)
  const [generating,  setGenerating]  = useState(false)
  const [error,       setError]       = useState("")
  const [preview,     setPreview]     = useState<Site | null>(null)
  const [device,      setDevice]      = useState<Device>("desktop")
  const [progress,    setProgress]    = useState(0)
  const [progressMsg, setProgressMsg] = useState("")

  // Command input
  const [command,      setCommand]      = useState("")
  const [brandColor,   setBrandColor]   = useState("#6366f1")
  const [referenceUrl, setReferenceUrl] = useState("")
  const [competitorUrl,setCompetitorUrl]= useState("")
  const [refImage,     setRefImage]     = useState<{ base64: string; mediaType: string } | null>(null)
  const [refImageName, setRefImageName] = useState("")
  const [runCRO,       setRunCRO]       = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)

  // Result meta
  const [qualityScore,  setQualityScore]  = useState<number | null>(null)
  const [violations,    setViolations]    = useState<string[]>([])
  const [croIssues,     setCROIssues]     = useState<CROIssue[]>([])
  const [activeChips,   setActiveChips]   = useState<string[]>([])

  // Edit mode
  const [editMode,     setEditMode]     = useState(false)
  const [editRequest,  setEditRequest]  = useState("")
  const [editingSection, setEditingSection] = useState("")

  const fileRef    = useRef<HTMLInputElement>(null)
  const commandRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    fetch("/api/businesses/current")
      .then(r => {
        if (!r.ok) throw new Error(`Failed to load business (${r.status})`)
        return r.json()
      })
      .then(d => {
        if (d.business) {
          setBusiness(d.business)
          const bv = d.business.brandVoice as Record<string, unknown>
          if (typeof bv?.brandColor === "string") setBrandColor(bv.brandColor)
          return fetch(`/api/agents/website?businessId=${d.business.id}`)
        }
      })
      .then(r => r?.json())
      .then(d => { if (d?.sites) setSites(d.sites) })
      .catch(err => {
        if (err instanceof Error && !err.message.includes("404")) {
          setError(err.message || "Failed to load — please refresh")
        }
      })
      .finally(() => setLoading(false))
  }, [])

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setRefImageName(file.name)
    const reader = new FileReader()
    reader.onload = ev => {
      const result = ev.target?.result as string
      const [header, base64] = result.split(",")
      const mediaType = header.match(/data:([^;]+)/)?.[1] ?? "image/jpeg"
      setRefImage({ base64, mediaType: mediaType as "image/jpeg" | "image/png" | "image/webp" | "image/gif" })
    }
    reader.readAsDataURL(file)
  }

  function buildChipsFromCommand(cmd: string): string[] {
    const chips: string[] = []
    if (/dark|black background/i.test(cmd))     chips.push("Dark mode")
    if (/light|white background/i.test(cmd))    chips.push("Light theme")
    if (/serif/i.test(cmd))                     chips.push("Serif fonts")
    if (/no anim/i.test(cmd))                   chips.push("No animations")
    if (/water|aurora|plasma|galaxy|fire/i.test(cmd)) chips.push("Custom shader")
    if (/pricing/i.test(cmd))                   chips.push("Pricing section")
    if (/faq/i.test(cmd))                       chips.push("FAQ section")
    if (/luxury/i.test(cmd))                    chips.push("Luxury tone")
    if (/minimal/i.test(cmd))                   chips.push("Minimal tone")
    if (referenceUrl)                           chips.push("Style clone")
    if (refImage)                               chips.push("Reference image")
    if (competitorUrl)                          chips.push("Competitor analysis")
    if (runCRO)                                 chips.push("CRO pass")
    return chips
  }

  async function generate() {
    if (!business || !command.trim()) return
    setGenerating(true)
    setError("")
    setProgress(0)
    setProgressMsg("")
    setQualityScore(null)
    setViolations([])
    setCROIssues([])
    setActiveChips(buildChipsFromCommand(command))
    setEditMode(false)

    let stepIdx = 0
    const tick = setInterval(() => {
      if (stepIdx < PROGRESS_STEPS.length) {
        setProgress(PROGRESS_STEPS[stepIdx].pct)
        setProgressMsg(PROGRESS_STEPS[stepIdx].msg)
        stepIdx++
      }
    }, 7000)

    try {
      const res = await fetch("/api/agents/website", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId:   business.id,
          brandColor,
          userPrompt:   command,
          referenceUrl: referenceUrl || undefined,
          referenceImage: refImage || undefined,
          competitorUrl: competitorUrl || undefined,
          runCRO,
        }),
      })
      clearInterval(tick)
      setProgress(100)
      setProgressMsg("Done!")

      const data = await res.json()
      if (!res.ok) { setError(data.error ?? "Failed to generate"); return }

      setSites(prev => [data.site, ...prev])
      setPreview(data.site)
      setQualityScore(data.qualityScore ?? null)
      setViolations(data.complianceViolations ?? [])
      setCROIssues(data.croIssues ?? [])
    } catch {
      setError("Network error — please try again")
    } finally {
      clearInterval(tick)
      setGenerating(false)
      setTimeout(() => { setProgress(0); setProgressMsg("") }, 2000)
    }
  }

  async function submitEdit() {
    if (!business || !editRequest.trim() || !preview) return
    setGenerating(true)
    setError("")
    setProgress(20)
    setProgressMsg(`Editing ${editingSection || "section"}…`)

    try {
      const res = await fetch("/api/agents/website", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId:    business.id,
          brandColor,
          userPrompt:    editRequest,
          currentSiteId: preview.id,
          editSection:   editingSection || "hero",
        }),
      })
      setProgress(100)
      setProgressMsg("Section updated!")

      const data = await res.json()
      if (!res.ok) { setError(data.error ?? "Edit failed"); return }

      setSites(prev => prev.map(s => s.id === data.site.id ? data.site : s))
      setPreview(data.site)
      setEditRequest("")
      setEditingSection("")
      setEditMode(false)
    } catch {
      setError("Edit failed — please try again")
    } finally {
      setGenerating(false)
      setTimeout(() => { setProgress(0); setProgressMsg("") }, 1500)
    }
  }

  async function togglePublish(site: Site) {
    const res = await fetch("/api/agents/website", {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId: site.id, published: !site.published }),
    })
    if (res.ok) {
      const d = await res.json()
      setSites(prev => prev.map(s => s.id === site.id ? d.site : s))
      if (preview?.id === site.id) setPreview(d.site)
    }
  }

  function downloadHtml(site: Site) {
    const blob = new Blob([site.html], { type: "text/html" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `${site.slug}.html`
    a.click()
    URL.revokeObjectURL(a.href)
  }

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
    <div className="flex flex-col h-full p-6 gap-4 max-w-[1600px] mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between shrink-0">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-60" style={{ animationDuration: "2s" }} />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-indigo-400" />
            </span>
            <span className="text-xs font-semibold text-indigo-400 uppercase tracking-widest">AI Website Builder</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Website Builder</h1>
          <p className="text-gray-500 text-sm mt-0.5">Type exactly what you want — the AI parses every directive and builds it precisely.</p>
        </div>
        <div className="flex items-center gap-2 bg-indigo-950/40 border border-indigo-800/40 rounded-xl px-3 py-2 text-xs">
          <span className="text-indigo-400 font-semibold">15 techniques</span>
          <span className="text-gray-700">·</span>
          <span className="text-gray-600">Awwwards-level</span>
        </div>
      </div>

      {/* Main layout */}
      <div className="flex gap-4 flex-1 min-h-0">

        {/* ── Left panel ── */}
        <div className="w-[380px] shrink-0 flex flex-col gap-3 overflow-y-auto">

          {/* Command input */}
          <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-4">
            <label className="block text-xs text-gray-500 mb-2 font-medium uppercase tracking-wider">
              Your Command
            </label>
            <textarea
              ref={commandRef}
              value={command}
              onChange={e => setCommand(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) generate() }}
              placeholder="Describe exactly what you want. E.g. 'Dark luxury theme, serif fonts, water shader, pricing and FAQ sections, no cursor effects, target: restaurant owners'"
              rows={5}
              className="w-full px-3 py-2.5 bg-gray-800/80 border border-gray-700 rounded-xl text-white text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-500 resize-none leading-relaxed"
            />

            {/* Example prompts */}
            {!command && (
              <div className="mt-2 space-y-1">
                <p className="text-xs text-gray-700 mb-1.5">Examples:</p>
                {EXAMPLE_PROMPTS.map(p => (
                  <button
                    key={p}
                    onClick={() => { setCommand(p); commandRef.current?.focus() }}
                    className="w-full text-left text-xs px-2.5 py-1.5 rounded-lg border border-gray-800 hover:border-indigo-700 text-gray-600 hover:text-indigo-400 transition-colors leading-relaxed"
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}

            {/* Active directive chips */}
            {activeChips.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {activeChips.map(chip => (
                  <DirectiveChip
                    key={chip}
                    label={chip}
                    onRemove={() => setActiveChips(prev => prev.filter(c => c !== chip))}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Options */}
          <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-4 space-y-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1.5 font-medium uppercase tracking-wider">Brand Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color" value={brandColor}
                  onChange={e => setBrandColor(e.target.value)}
                  className="w-9 h-9 rounded-lg border border-gray-700 cursor-pointer bg-transparent"
                />
                <input
                  type="text" value={brandColor}
                  onChange={e => setBrandColor(e.target.value)}
                  className="flex-1 px-2.5 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Reference URL — #10 */}
            <div>
              <label className="block text-xs text-gray-500 mb-1.5 font-medium uppercase tracking-wider">
                Reference URL <span className="normal-case text-gray-700">(clone this site&apos;s style)</span>
              </label>
              <input
                type="url" value={referenceUrl}
                onChange={e => setReferenceUrl(e.target.value)}
                placeholder="https://stripe.com"
                className="w-full px-2.5 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Reference image — #30 */}
            <div>
              <label className="block text-xs text-gray-500 mb-1.5 font-medium uppercase tracking-wider">
                Reference Image <span className="normal-case text-gray-700">(screenshot or sketch)</span>
              </label>
              <div
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-2 px-2.5 py-2 bg-gray-800 border border-gray-700 border-dashed rounded-lg cursor-pointer hover:border-indigo-600 transition-colors"
              >
                <span className="text-gray-600 text-xs">📎</span>
                <span className="text-xs text-gray-500 truncate">
                  {refImageName || "Upload screenshot or sketch…"}
                </span>
                {refImage && (
                  <button
                    onClick={e => { e.stopPropagation(); setRefImage(null); setRefImageName("") }}
                    className="ml-auto text-gray-600 hover:text-red-400 text-xs"
                  >
                    ×
                  </button>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
            </div>

            {/* Advanced toggle */}
            <button
              onClick={() => setShowAdvanced(v => !v)}
              className="text-xs text-gray-600 hover:text-gray-400 transition-colors flex items-center gap-1"
            >
              {showAdvanced ? "▲" : "▼"} Advanced options
            </button>

            {showAdvanced && (
              <div className="space-y-3 pt-1 border-t border-gray-800/60">
                {/* Competitor URL — #39 */}
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5 font-medium uppercase tracking-wider">
                    Competitor URL <span className="normal-case text-gray-700">(build something better)</span>
                  </label>
                  <input
                    type="url" value={competitorUrl}
                    onChange={e => setCompetitorUrl(e.target.value)}
                    placeholder="https://competitor.com"
                    className="w-full px-2.5 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {/* CRO toggle — #40 */}
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <div
                    onClick={() => setRunCRO(v => !v)}
                    className={`relative w-9 h-5 rounded-full transition-colors ${runCRO ? "bg-indigo-600" : "bg-gray-700"}`}
                  >
                    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${runCRO ? "translate-x-4" : "translate-x-0.5"}`} />
                  </div>
                  <span className="text-xs text-gray-400">Run CRO analysis after generation</span>
                </label>
              </div>
            )}
          </div>

          {/* Progress + Generate button */}
          <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-4">
            {generating && (
              <div className="mb-4">
                <div className="flex justify-between text-xs mb-1.5">
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

            {error && <p className="mb-3 text-red-400 text-sm">{error}</p>}

            <button
              onClick={generate}
              disabled={generating || !business || !command.trim()}
              className="w-full py-3 text-white font-bold rounded-xl text-sm transition-all disabled:opacity-40 hover:brightness-110"
              style={{ background: "linear-gradient(135deg, #4f46e5, #7c3aed)" }}
            >
              {generating ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Building…
                </span>
              ) : "Build Website"}
            </button>
            <p className="text-xs text-gray-700 text-center mt-2">⌘+Enter · Takes ~45–90 seconds</p>

            {/* Quality score */}
            {qualityScore !== null && (
              <div className="mt-3 flex items-center justify-between p-2.5 bg-indigo-950/40 border border-indigo-800/30 rounded-xl">
                <span className="text-xs text-indigo-400 font-medium">Quality Score</span>
                <span className="text-sm font-bold text-white">{qualityScore.toFixed(1)}<span className="text-gray-600 font-normal">/10</span></span>
              </div>
            )}

            {/* Compliance violations */}
            {violations.length > 0 && (
              <div className="mt-2 p-2.5 bg-red-950/30 border border-red-900/40 rounded-xl">
                <p className="text-xs text-red-400 font-medium mb-1">Compliance Issues Fixed</p>
                {violations.slice(0, 3).map((v, i) => (
                  <p key={i} className="text-xs text-red-400/70 leading-relaxed">{v.split(":")[0]}</p>
                ))}
              </div>
            )}
          </div>

          {/* CRO Issues panel — #40 */}
          {croIssues.length > 0 && (
            <div className="bg-gray-900/80 border border-gray-800 rounded-2xl overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-800 flex items-center justify-between">
                <h3 className="text-xs font-semibold text-white uppercase tracking-wider">CRO Fixes Applied</h3>
                <span className="text-xs text-gray-600">{croIssues.length} issues</span>
              </div>
              <div className="divide-y divide-gray-800/60">
                {croIssues.map((issue, i) => (
                  <div key={i} className="px-4 py-2.5">
                    <div className="flex items-center gap-2 mb-1">
                      <CROBadge severity={issue.severity} />
                      <span className="text-xs text-gray-400 font-medium">{issue.issue}</span>
                    </div>
                    <p className="text-xs text-gray-600 leading-relaxed">→ {issue.fix}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Edit mode panel — #4 */}
          {preview && (
            <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-4">
              <button
                onClick={() => setEditMode(v => !v)}
                className="w-full flex items-center justify-between text-xs text-gray-400 hover:text-white transition-colors"
              >
                <span className="font-semibold uppercase tracking-wider">Edit a Section</span>
                <span>{editMode ? "▲" : "▼"}</span>
              </button>
              {editMode && (
                <div className="mt-3 space-y-2">
                  <p className="text-xs text-gray-600">Describe what to change without regenerating the whole site:</p>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {["hero", "services", "pricing", "testimonials", "footer", "nav"].map(s => (
                      <button
                        key={s}
                        onClick={() => setEditingSection(s)}
                        className={`text-xs px-2 py-1 rounded-lg border transition-colors capitalize ${
                          editingSection === s
                            ? "bg-indigo-900/60 border-indigo-700 text-indigo-300"
                            : "border-gray-700 text-gray-600 hover:border-gray-600 hover:text-gray-400"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={editRequest}
                    onChange={e => setEditRequest(e.target.value)}
                    placeholder={`Describe the edit, e.g. "Change the ${editingSection || 'hero'} headline to focus on cost savings, make CTAs more aggressive"`}
                    rows={3}
                    className="w-full px-2.5 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-500 resize-none"
                  />
                  <button
                    onClick={submitEdit}
                    disabled={generating || !editRequest.trim()}
                    className="w-full py-2 text-white font-semibold rounded-lg text-xs disabled:opacity-40 transition-all hover:brightness-110"
                    style={{ background: "linear-gradient(135deg, #4f46e5, #7c3aed)" }}
                  >
                    {generating ? "Editing…" : "Apply Edit"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Version history — #14 */}
          {sites.length > 0 && (
            <div className="bg-gray-900/80 border border-gray-800 rounded-2xl overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-800">
                <h3 className="text-xs font-semibold text-white uppercase tracking-wider">Version History ({sites.length})</h3>
              </div>
              <div className="divide-y divide-gray-800/60 max-h-64 overflow-y-auto">
                {sites.map(s => (
                  <div key={s.id} className="flex items-center gap-2 px-4 py-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-white truncate">{s.title}</p>
                      <p className="text-xs text-gray-600 mt-0.5">{new Date(s.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => setPreview(s)}
                        className={`text-xs px-2 py-1 border rounded-lg transition-colors ${
                          preview?.id === s.id
                            ? "bg-indigo-900/60 border-indigo-700 text-indigo-300"
                            : "border-gray-700 hover:border-indigo-600 text-gray-500 hover:text-indigo-400"
                        }`}
                      >
                        {preview?.id === s.id ? "Viewing" : "View"}
                      </button>
                      <button
                        onClick={() => togglePublish(s)}
                        className={`text-xs px-2 py-1 rounded-lg font-medium border transition-colors ${
                          s.published
                            ? "bg-emerald-950/40 border-emerald-800/40 text-emerald-400 hover:bg-red-950/40 hover:border-red-800/40 hover:text-red-400"
                            : "bg-gray-800 border-gray-700 text-gray-600 hover:border-emerald-700 hover:text-emerald-400"
                        }`}
                      >
                        {s.published ? "Live" : "Publish"}
                      </button>
                      <button
                        onClick={() => downloadHtml(s)}
                        className="text-xs px-2 py-1 border border-gray-700 hover:border-gray-500 text-gray-600 hover:text-gray-300 rounded-lg transition-colors"
                        title="Download HTML"
                      >
                        ↓
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Right: Preview ── */}
        <div className="flex-1 flex flex-col min-w-0 bg-gray-900/50 border border-gray-800 rounded-2xl overflow-hidden">

          {/* Preview toolbar */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-800 bg-gray-900/60 shrink-0">
            <div className="flex items-center gap-3">
              {/* Browser dots */}
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500/50" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/50" />
                <div className="w-3 h-3 rounded-full bg-emerald-500/50" />
              </div>
              {preview && (
                <span className="text-xs text-gray-600 font-mono">{preview.slug}.autopilot.ai</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Device toggle — #12 */}
              <div className="flex items-center bg-gray-800 rounded-lg p-0.5 gap-0.5">
                {(["desktop", "tablet", "mobile"] as Device[]).map(d => (
                  <button
                    key={d}
                    onClick={() => setDevice(d)}
                    className={`px-2 py-1 rounded-md text-xs transition-colors ${
                      device === d ? "bg-gray-700 text-white" : "text-gray-500 hover:text-gray-300"
                    }`}
                    title={d}
                  >
                    {DEVICE_ICONS[d]}
                  </button>
                ))}
              </div>

              {preview && (
                <>
                  <button
                    onClick={() => { const w = window.open("", "_blank"); if (w) { w.document.write(preview.html); w.document.close() } }}
                    className="text-xs px-2.5 py-1 border border-gray-700 hover:border-indigo-600 text-gray-500 hover:text-indigo-400 rounded-lg transition-colors"
                  >
                    Open ↗
                  </button>
                  <button
                    onClick={() => downloadHtml(preview)}
                    className="text-xs px-2.5 py-1 border border-gray-700 hover:border-emerald-700 text-gray-500 hover:text-emerald-400 rounded-lg transition-colors"
                  >
                    Download
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Preview content */}
          <div className="flex-1 flex items-start justify-center overflow-auto p-4 bg-gray-950/40">
            {preview ? (
              <div
                className="transition-all duration-300 h-full"
                style={{ width: DEVICE_WIDTHS[device], minHeight: "600px" }}
              >
                <div className="bg-white rounded-xl overflow-hidden shadow-2xl h-full" style={{
                  boxShadow: device !== "desktop" ? "0 20px 60px rgba(0,0,0,0.5)" : undefined,
                }}>
                  <iframe
                    srcDoc={preview.html}
                    className="w-full border-0"
                    style={{ height: "100%", minHeight: "700px" }}
                    title="Website Preview"
                    sandbox="allow-scripts allow-same-origin allow-popups"
                  />
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-center p-12 h-full">
                <div className="w-16 h-16 rounded-2xl border border-gray-800 flex items-center justify-center mb-5 bg-gray-900">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-700">
                    <rect x="2" y="3" width="20" height="14" rx="2" />
                    <path d="M8 21h8M12 17v4" />
                  </svg>
                </div>
                <p className="text-gray-400 font-semibold mb-2">Describe your website above</p>
                <p className="text-gray-600 text-sm max-w-sm leading-relaxed mb-8">
                  Tell the AI exactly what you want — dark mode, fonts, sections, animations, shader effects, tone. Every directive is parsed and honored.
                </p>
                <div className="text-left w-full max-w-sm space-y-2">
                  <p className="text-xs text-gray-700 uppercase tracking-widest font-semibold mb-3">What gets built</p>
                  {[
                    ["15 advanced techniques", "WebGL, GSAP, scroll scrubbing, shaders"],
                    ["Exact command following", "Every directive you write is parsed & honored"],
                    ["Custom GLSL shaders", "aurora, water, plasma, galaxy effects on demand"],
                    ["Competitor analysis", "Analyzes rival sites and outperforms them"],
                    ["CRO pass", "Auto-fixes conversion issues after generation"],
                    ["Diff editing", "Change one section without regenerating the whole site"],
                    ["Live business data", "Your real reviews, leads, content in the site"],
                    ["Style cloning", "Paste any URL — we replicate its design language"],
                  ].map(([feat, desc]) => (
                    <div key={feat} className="flex items-start gap-2.5">
                      <span className="text-emerald-500 text-xs mt-0.5 shrink-0">✓</span>
                      <div>
                        <span className="text-xs text-gray-400 font-medium">{feat}</span>
                        <span className="text-xs text-gray-700"> — {desc}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
