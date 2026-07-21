"use client"

// 🎬 Content Engine (general business) — the spec'd ideation system: reads the
// brand profile first, takes an optional area + free-text description, runs the
// multi-stage pipeline (wide generation → harsh critique → per-dimension
// scoring → competing hooks), and returns as many ranked ideas as asked for.
// Feed supports one-click triage (every kill is training data) and <30s outcome
// logging — the feedback loop that makes runs smarter over time.

import { useCallback, useEffect, useMemo, useState } from "react"

interface Profile { id: string; name: string; niche: string; platforms: string[] }
interface Idea {
  id: string; platform: string; format: string; title: string; premise: string
  hooks: string[]; angle: string; whyItTravels: string
  viralityScore: number; scoreBreakdown: { dimensions?: Record<string, number>; rationales?: Record<string, string> }
  confidence: number; status: string
}

const DIM_LABEL: Record<string, string> = {
  hook: "Hook", share: "Share", save: "Save", novelty: "Novelty", trendTiming: "Trend timing",
  audienceFit: "Audience fit", voiceFit: "Voice fit", productionCost: "Cheap to make", downsideRisk: "Safe",
  retention: "Gets stuck", conversion: "Converts",
}
const scoreCls = (s: number) => (s >= 70 ? "bg-emerald-600 text-white" : s >= 55 ? "bg-amber-600 text-white" : "bg-gray-700 text-gray-200")

export default function ContentEngine({ password }: { password?: string }) {
  const headers = useMemo(() => ({ "Content-Type": "application/json", ...(password ? { "x-admin-password": password } : {}) }), [password])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [profileId, setProfileId] = useState("")
  const [description, setDescription] = useState("")
  const [mode, setMode] = useState<"business" | "individual" | "skit" | "ad">("business")
  const [city, setCity] = useState("")
  const [stateAbbr, setStateAbbr] = useState("")
  const [count, setCount] = useState(10)
  // ── Advanced steering ──
  const [showSteer, setShowSteer] = useState(false)
  const [goal, setGoal] = useState("")
  const [formats, setFormats] = useState<string[]>([])
  const [audience, setAudience] = useState("")
  const [tone, setTone] = useState<string[]>([])
  const [avoid, setAvoid] = useState("")
  const [reference, setReference] = useState("")
  const [cta, setCta] = useState("")
  const [offer, setOffer] = useState("")
  const [series, setSeries] = useState(0)
  const [durationSec, setDurationSec] = useState(0)
  const [running, setRunning] = useState(false)
  const [stageNote, setStageNote] = useState<string | null>(null)
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [open, setOpen] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [expansions, setExpansions] = useState<Record<string, string>>({})
  const [logFor, setLogFor] = useState<string | null>(null)
  const [logForm, setLogForm] = useState({ views: "", likes: "", shares: "", saves: "", url: "" })

  const loadProfiles = useCallback(async () => {
    try {
      const r = await fetch("/api/content/profiles", { headers })
      const d = await r.json()
      const list: Profile[] = d.profiles ?? []
      setProfiles(list)
      if (list.length && !profileId) setProfileId(list[0].id)
    } catch { /* empty state shown */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headers])

  const loadFeed = useCallback(async (pid: string) => {
    if (!pid) return
    try {
      const r = await fetch(`/api/content/ideas?profileId=${encodeURIComponent(pid)}`, { headers })
      const d = await r.json()
      setIdeas((d.ideas ?? []).filter((i: Idea) => i.status !== "killed"))
    } catch { /* keep current */ }
  }, [headers])

  useEffect(() => {
    const t = setTimeout(() => { void loadProfiles() }, 0)
    return () => clearTimeout(t)
  }, [loadProfiles])
  useEffect(() => {
    if (!profileId) return
    const t = setTimeout(() => { void loadFeed(profileId) }, 0)
    return () => clearTimeout(t)
  }, [profileId, loadFeed])

  const generate = async () => {
    setRunning(true); setNote(null)
    setStageNote("Reading your business profile, area data & trends…")
    const stages = ["Generating wide (30+ raw premises)…", "Killing the derivative ones…", "Scoring every dimension…", "Writing competing hooks…"]
    let si = 0
    const timer = setInterval(() => { if (si < stages.length) setStageNote(stages[si++]) }, 9000)
    try {
      const r = await fetch("/api/content/generate", {
        method: "POST", headers,
        body: JSON.stringify({
          profileId: profileId || undefined, description: description.trim() || undefined,
          city: city.trim() || undefined, state: stateAbbr.trim() || undefined, count, mode,
          goal: goal || undefined,
          formats: formats.length ? formats : undefined,
          audience: audience.trim() || undefined,
          tone: tone.length ? tone : undefined,
          avoid: avoid.trim() || undefined,
          reference: reference.trim() || undefined,
          cta: cta.trim() || undefined,
          offer: offer.trim() || undefined,
          series: series > 1 ? series : undefined,
          durationSec: durationSec > 0 ? durationSec : undefined,
        }),
      })
      const d = await r.json()
      if (d.error) setNote(d.error)
      else {
        setNote(`✓ ${d.ideas.length} ideas survived from ${d.stages.divergent} raw premises (${d.stages.survivors} passed critique).`)
        if (profileId) await loadFeed(profileId)
        else setIdeas(d.ideas.map((i: Idea) => ({ ...i, status: "new" })))
      }
    } catch { setNote("Run failed — try again.") }
    clearInterval(timer); setStageNote(null); setRunning(false)
  }

  const triage = async (id: string, status: string) => {
    setIdeas((p) => status === "killed" ? p.filter((i) => i.id !== id) : p.map((i) => (i.id === id ? { ...i, status } : i)))
    try { await fetch("/api/content/ideas", { method: "PATCH", headers, body: JSON.stringify({ id, status }) }) } catch { /* optimistic */ }
  }

  const expand = async (id: string, kind: string) => {
    setExpansions((e) => ({ ...e, [id]: "…writing…" }))
    try {
      const r = await fetch("/api/content/expand", { method: "POST", headers, body: JSON.stringify({ ideaId: id, kind }) })
      const d = await r.json()
      setExpansions((e) => ({ ...e, [id]: d.body ?? d.error ?? "failed" }))
    } catch { setExpansions((e) => ({ ...e, [id]: "failed — try again" })) }
  }

  const logOutcome = async (id: string) => {
    const n = (s: string) => (s.trim() ? Number(s.replace(/[^0-9]/g, "")) : undefined)
    try {
      const r = await fetch("/api/content/outcomes", {
        method: "POST", headers,
        body: JSON.stringify({ ideaId: id, views: n(logForm.views), likes: n(logForm.likes), shares: n(logForm.shares), saves: n(logForm.saves), postUrl: logForm.url.trim() || undefined }),
      })
      const d = await r.json()
      setNote(d.ok ? `✓ Logged — that post ranks in the top ${100 - (d.percentile ?? 50)}% of this account's results. The engine just got smarter.` : "Logging failed — try again.")
      setLogFor(null); setLogForm({ views: "", likes: "", shares: "", saves: "", url: "" })
      void triage(id, "published")
    } catch { setNote("Logging failed — try again.") }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-bold text-white">🎬 Content Engine <span className="text-xs font-normal text-gray-500">— general business</span></h3>
        <p className="text-sm text-gray-400 mt-0.5">Reads your business first, grounds in your area&apos;s real numbers and live trends, generates wide, kills the derivative, scores every dimension, and learns from what you actually publish.</p>
      </div>

      {/* The brief: who, where, and describe-it — plus how many ideas you want */}
      <div className="bg-gray-900/60 border border-fuchsia-500/25 rounded-2xl p-4 space-y-3">
        {/* Section picker — changes the GOAL the whole pipeline optimizes for */}
        <div className="flex flex-wrap items-center gap-2">
          {([
            ["business", "🏪 Business"],
            ["individual", "👤 Individual"],
            ["skit", "🎭 Skits"],
            ["ad", "📣 Ads"],
          ] as const).map(([m, label]) => (
            <button key={m} onClick={() => setMode(m)}
              className={`text-xs font-bold px-3 py-1.5 rounded-lg border ${mode === m ? "bg-fuchsia-600 border-fuchsia-500 text-white" : "bg-gray-950 border-gray-700 text-gray-400 hover:text-white"}`}>
              {label}
            </button>
          ))}
          <span className="text-[11px] text-gray-500">
            {mode === "business" && "Every idea is a post YOUR business publishes to pull in paying customers."}
            {mode === "individual" && "Every idea grows YOUR audience — personality and expertise are the product."}
            {mode === "skit" && "Viral Reels/TikTok-style comedy skits set in YOUR business — the engine tracks what formats are going viral right now and adapts."}
            {mode === "ad" && "Advertisements built to convert — hook, offer shown vividly, reason to act now, one CTA."}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={profileId} onChange={(e) => setProfileId(e.target.value)} className="bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-fuchsia-500">
            <option value="">Ad-hoc (no saved profile)</option>
            {profiles.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.niche.slice(0, 40)}</option>)}
          </select>
          <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Area city (optional)" className="bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-fuchsia-500 w-44" />
          <input value={stateAbbr} onChange={(e) => setStateAbbr(e.target.value.toUpperCase().slice(0, 2))} placeholder="ST" className="bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-fuchsia-500 w-16" />
          <label className="flex items-center gap-1.5 text-xs text-gray-400">Ideas:
            <select value={count} onChange={(e) => setCount(Number(e.target.value))} className="bg-gray-950 border border-gray-700 rounded-lg px-2 py-2 text-sm text-white focus:outline-none focus:border-fuchsia-500">
              {[6, 10, 16, 24].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <button onClick={generate} disabled={running} className="bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-50 text-white text-sm font-bold px-5 py-2 rounded-lg">{running ? "Running pipeline…" : "🎬 Generate"}</button>
        </div>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
          placeholder="Describe the business / this week's situation in your own words — this DEFINES what the ideas are about. Ask for formats too (“skits”, “reels”, “talking videos”). e.g. “Local coffee shop looking to bring in new customers — give me skits and talking videos.”"
          className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-fuchsia-500" />

        {/* Advanced steering — command exactly what you want */}
        <button onClick={() => setShowSteer((v) => !v)} className="text-xs font-semibold text-fuchsia-300 hover:text-fuchsia-200">
          {showSteer ? "▾" : "▸"} 🎯 Advanced steering — command exactly what you want{!showSteer && (goal || formats.length || audience || tone.length || avoid || reference || cta || offer || series > 1 || durationSec > 0) ? " (active)" : ""}
        </button>
        {showSteer && (
          <div className="border border-gray-800 rounded-xl p-3 space-y-3 bg-gray-950/40">
            <div className="grid md:grid-cols-2 gap-3">
              {/* #1 Objective */}
              <label className="text-[11px] text-gray-400 space-y-1 block">Objective — what a “win” is
                <select value={goal} onChange={(e) => setGoal(e.target.value)} className="w-full bg-gray-950 border border-gray-700 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-fuchsia-500">
                  <option value="">Auto (from mode)</option>
                  <option value="customers">Bring in customers</option>
                  <option value="awareness">Maximize reach / awareness</option>
                  <option value="appointments">Booked appointments</option>
                  <option value="sell-item">Sell a specific item/listing</option>
                  <option value="leads">Capture leads (DM/form)</option>
                  <option value="loyalty">Repeat business / loyalty</option>
                </select>
              </label>
              {/* #10 Platform length */}
              <label className="text-[11px] text-gray-400 space-y-1 block">Target length
                <select value={durationSec} onChange={(e) => setDurationSec(Number(e.target.value))} className="w-full bg-gray-950 border border-gray-700 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-fuchsia-500">
                  <option value={0}>Any</option>
                  <option value={15}>~15s (TikTok/Reel)</option>
                  <option value={30}>~30s</option>
                  <option value={60}>~60s (Short)</option>
                  <option value={90}>~90s</option>
                  <option value={180}>~3 min (long)</option>
                </select>
              </label>
            </div>

            {/* #2 Formats */}
            <div className="space-y-1">
              <p className="text-[11px] text-gray-400">Force formats (leave empty for auto)</p>
              <div className="flex flex-wrap gap-1.5">
                {["skit", "talking-head", "voiceover-broll", "greenscreen-react", "carousel", "duet-stitch", "tutorial", "listicle"].map((f) => (
                  <button key={f} onClick={() => setFormats((p) => p.includes(f) ? p.filter((x) => x !== f) : [...p, f])}
                    className={`text-[11px] px-2 py-1 rounded-lg border ${formats.includes(f) ? "bg-fuchsia-600 border-fuchsia-500 text-white" : "bg-gray-950 border-gray-700 text-gray-400 hover:text-white"}`}>{f}</button>
                ))}
              </div>
            </div>

            {/* #4 Tone */}
            <div className="space-y-1">
              <p className="text-[11px] text-gray-400">Tone</p>
              <div className="flex flex-wrap gap-1.5">
                {["funny", "authoritative", "heartfelt", "bold", "educational", "luxury", "edgy", "wholesome"].map((t) => (
                  <button key={t} onClick={() => setTone((p) => p.includes(t) ? p.filter((x) => x !== t) : [...p, t])}
                    className={`text-[11px] px-2 py-1 rounded-lg border ${tone.includes(t) ? "bg-fuchsia-600 border-fuchsia-500 text-white" : "bg-gray-950 border-gray-700 text-gray-400 hover:text-white"}`}>{t}</button>
                ))}
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-3">
              {/* #3 Audience */}
              <input value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="#3 Target audience (e.g. first-time buyers, busy parents)" className="bg-gray-950 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-fuchsia-500" />
              {/* #8 Offer */}
              <input value={offer} onChange={(e) => setOffer(e.target.value)} placeholder="#8 Offer to feature (e.g. $500 off, free valuation)" className="bg-gray-950 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-fuchsia-500" />
              {/* #8 CTA */}
              <input value={cta} onChange={(e) => setCta(e.target.value)} placeholder="#8 Call to action (e.g. DM 'HOME', book online)" className="bg-gray-950 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-fuchsia-500" />
              {/* #6 Avoid */}
              <input value={avoid} onChange={(e) => setAvoid(e.target.value)} placeholder="#6 Never do / avoid (e.g. no dancing, don't mention price)" className="bg-gray-950 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-fuchsia-500" />
            </div>

            {/* #7 Reference */}
            <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="#7 Reverse-engineer a reference — paste a link or describe a video you loved (copies its STRUCTURE, not its topic)" className="w-full bg-gray-950 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-fuchsia-500" />

            {/* #9 Series */}
            <label className="flex items-center gap-2 text-[11px] text-gray-400">#9 Make it a connected series:
              <select value={series} onChange={(e) => setSeries(Number(e.target.value))} className="bg-gray-950 border border-gray-700 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-fuchsia-500">
                <option value={0}>No — standalone ideas</option>
                {[3, 4, 5, 6, 8, 10].map((n) => <option key={n} value={n}>{n}-part series</option>)}
              </select>
              <span className="text-gray-600">(overrides Ideas count)</span>
            </label>
          </div>
        )}

        {stageNote && <p className="text-xs text-fuchsia-300 flex items-center gap-2"><span className="w-3.5 h-3.5 border-2 border-gray-600 border-t-fuchsia-400 rounded-full animate-spin" />{stageNote}</p>}
        {note && <p className="text-xs text-emerald-200">{note}</p>}
      </div>

      {/* Ranked feed with always-visible reasoning */}
      <div className="space-y-2">
        {ideas.map((idea) => {
          const dims = idea.scoreBreakdown?.dimensions ?? {}
          return (
            <div key={idea.id} className="bg-gray-900/60 border border-gray-800 rounded-xl p-4">
              <button onClick={() => setOpen(open === idea.id ? null : idea.id)} className="w-full flex items-start gap-2 text-left">
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 ${scoreCls(idea.viralityScore)}`} title={`confidence ${(idea.confidence * 100).toFixed(0)}%`}>{Math.round(idea.viralityScore)}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white">“{idea.hooks?.[0] ?? idea.title}”</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">{idea.platform} · {idea.format} · {idea.title}{idea.status !== "new" ? ` · ${idea.status}` : ""}{idea.confidence < 0.5 && idea.viralityScore >= 65 ? " · ⚠ high score, low confidence — your judgment" : ""}</p>
                </div>
                <span className="text-gray-600 text-xs shrink-0">{open === idea.id ? "▾" : "▸"}</span>
              </button>

              {open === idea.id && (
                <div className="mt-3 space-y-2">
                  <p className="text-[11px] text-gray-300">{idea.premise}</p>
                  <p className="text-[11px] text-fuchsia-200"><b>Why it travels:</b> {idea.whyItTravels}</p>
                  {idea.hooks?.length > 1 && (
                    <div><p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Competing hooks</p>
                      {idea.hooks.map((h, i) => <p key={i} className="text-[11px] text-gray-300">{i + 1}. “{h}”</p>)}</div>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(dims).map(([k, v]) => (
                      <span key={k} className={`text-[10px] px-1.5 py-0.5 rounded border ${v >= 70 ? "bg-emerald-950/50 border-emerald-700/40 text-emerald-200" : v >= 50 ? "bg-gray-800 border-gray-700 text-gray-300" : "bg-rose-950/40 border-rose-800/40 text-rose-200"}`} title={idea.scoreBreakdown?.rationales?.[k] ?? ""}>{DIM_LABEL[k] ?? k}: {v}</span>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {["outline", "script", "caption", "shotlist"].map((k) => (
                      <button key={k} onClick={() => expand(idea.id, k)} className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg capitalize">📝 {k}</button>
                    ))}
                    <button onClick={() => triage(idea.id, "saved")} className="bg-emerald-700/60 hover:bg-emerald-600 text-white text-[11px] font-semibold px-2.5 py-1.5 rounded-lg">💾 Save</button>
                    <button onClick={() => setLogFor(logFor === idea.id ? null : idea.id)} className="bg-sky-700/60 hover:bg-sky-600 text-white text-[11px] font-semibold px-2.5 py-1.5 rounded-lg">📈 I posted this</button>
                    <button onClick={() => triage(idea.id, "killed")} className="bg-rose-900/60 hover:bg-rose-800 text-rose-100 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg">✕ Kill</button>
                  </div>
                  {expansions[idea.id] && <pre className="text-[11px] text-gray-300 whitespace-pre-wrap bg-gray-950/60 border border-gray-800 rounded-lg p-3 font-sans max-h-72 overflow-y-auto">{expansions[idea.id]}</pre>}
                  {logFor === idea.id && (
                    <div className="flex flex-wrap items-center gap-1.5 bg-gray-950/60 border border-sky-800/40 rounded-lg p-2">
                      {(["views", "likes", "shares", "saves"] as const).map((k) => (
                        <input key={k} value={logForm[k]} onChange={(e) => setLogForm((f) => ({ ...f, [k]: e.target.value }))} placeholder={k} inputMode="numeric" className="bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-[11px] text-white placeholder-gray-600 w-20 focus:outline-none focus:border-sky-500" />
                      ))}
                      <input value={logForm.url} onChange={(e) => setLogForm((f) => ({ ...f, url: e.target.value }))} placeholder="post URL (optional)" className="bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-[11px] text-white placeholder-gray-600 flex-1 min-w-[120px] focus:outline-none focus:border-sky-500" />
                      <button onClick={() => logOutcome(idea.id)} className="bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-bold px-3 py-1.5 rounded">Log it</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
        {!ideas.length && !running && <p className="text-sm text-gray-600 text-center py-8">No ideas yet — pick a profile (or just describe the business) and hit 🎬 Generate. Every result comes with its reasoning; every kill teaches the engine.</p>}
      </div>
    </div>
  )
}
