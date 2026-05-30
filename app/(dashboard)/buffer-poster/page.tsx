"use client"
import { useState } from "react"
import { ConnectBanner, useConnection } from "@/components/ConnectBanner"

type Tab = "generate" | "schedule"
type Profile = { id: string; service: string; formatted_username: string }

export default function BufferPosterPage() {
  const [tab, setTab] = useState<Tab>("generate")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<unknown>(null)
  const [error, setError] = useState("")

  const buffer = useConnection("buffer")

  const [accessToken, setAccessToken] = useState("")
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loadingProfiles, setLoadingProfiles] = useState(false)

  const [genForm, setGenForm] = useState({ businessDescription: "", topic: "", platforms: ["twitter", "facebook", "instagram", "linkedin"] })
  const [schedForm, setSchedForm] = useState({ selectedProfileIds: [] as string[], text: "", scheduledAt: "" })

  async function loadProfiles() {
    if (!accessToken) { setError("Enter your Buffer access token first"); return }
    setLoadingProfiles(true); setError("")
    try {
      const res = await fetch("/api/agents/buffer-poster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get-profiles", accessToken }),
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setProfiles(data.profiles ?? [])
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load profiles") }
    finally { setLoadingProfiles(false) }
  }

  function togglePlatform(p: string) {
    setGenForm(f => ({
      ...f,
      platforms: f.platforms.includes(p) ? f.platforms.filter(x => x !== p) : [...f.platforms, p],
    }))
  }

  function toggleProfileId(id: string) {
    setSchedForm(f => ({
      ...f,
      selectedProfileIds: f.selectedProfileIds.includes(id) ? f.selectedProfileIds.filter(x => x !== id) : [...f.selectedProfileIds, id],
    }))
  }

  async function generate() {
    setLoading(true); setError(""); setResult(null)
    try {
      const res = await fetch("/api/agents/buffer-poster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate", ...genForm }),
      })
      if (!res.ok) throw new Error(await res.text())
      setResult(await res.json())
    } catch (e) { setError(e instanceof Error ? e.message : "Failed") }
    finally { setLoading(false) }
  }

  async function schedule() {
    if (!accessToken) { setError("Enter your Buffer access token"); return }
    if (schedForm.selectedProfileIds.length === 0) { setError("Select at least one profile"); return }
    if (!schedForm.text) { setError("Enter post text"); return }
    setLoading(true); setError(""); setResult(null)
    try {
      const res = await fetch("/api/agents/buffer-poster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "schedule",
          accessToken,
          profileIds: schedForm.selectedProfileIds,
          text: schedForm.text,
          scheduledAt: schedForm.scheduledAt || undefined,
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      setResult(await res.json())
    } catch (e) { setError(e instanceof Error ? e.message : "Failed") }
    finally { setLoading(false) }
  }

  const inputCls = "w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-600 text-sm focus:outline-none focus:border-orange-500"
  const labelCls = "block text-xs font-medium text-gray-400 mb-1.5"
  const platforms = ["twitter", "facebook", "instagram", "linkedin", "tiktok"]

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-orange-500/20 border border-orange-500/30 flex items-center justify-center text-lg">📅</div>
          <h1 className="text-2xl font-bold">Buffer Social Poster</h1>
        </div>
        <p className="text-gray-400">Generate platform-optimized content and schedule posts to all your social channels via Buffer.</p>
      </div>

      <ConnectBanner
        provider="buffer"
        detail="Connect once — AutoPilot auto-schedules approved content to all your social profiles."
      />

      {/* Only show token input when Buffer is not already connected */}
      {!buffer.connected && (
      <div className="mb-4 bg-gray-900 border border-gray-800 rounded-xl p-4">
        <label className={labelCls}>Buffer Access Token</label>
        <div className="flex gap-2">
          <input value={accessToken} onChange={e => setAccessToken(e.target.value)} type="password" placeholder="Get from buffer.com/developers" className={inputCls} />
          <button onClick={loadProfiles} disabled={loadingProfiles} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg whitespace-nowrap transition">
            {loadingProfiles ? "Loading…" : "Load Profiles"}
          </button>
        </div>
        {profiles.length > 0 ? (
          <div className="flex flex-wrap gap-2 mt-2">
            {profiles.map(p => (
              <span key={p.id} className="px-2 py-1 bg-orange-900/30 border border-orange-700/40 text-orange-300 text-xs rounded-full">
                {p.service}: {p.formatted_username}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      )}

      <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit mb-6">
        {([["generate", "Generate Content"], ["schedule", "Schedule Posts"]] as const).map(([id, label]) => (
          <button key={id} onClick={() => { setTab(id); setResult(null) }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === id ? "bg-orange-600 text-white" : "text-gray-400 hover:text-white"}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
          {tab === "generate" ? (
            <>
              <p className="text-sm text-gray-400">Generate tailored content for each platform based on your topic.</p>
              <div>
                <label className={labelCls}>Business description</label>
                <textarea value={genForm.businessDescription} onChange={e => setGenForm(f => ({ ...f, businessDescription: e.target.value }))}
                  placeholder="e.g. We're a local plumbing company serving Denver homeowners" rows={2}
                  className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-600 text-sm focus:outline-none focus:border-orange-500 resize-none" />
              </div>
              <div>
                <label className={labelCls}>Post topic / angle</label>
                <input value={genForm.topic} onChange={e => setGenForm(f => ({ ...f, topic: e.target.value }))}
                  placeholder="e.g. 5 signs you need a new water heater" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Platforms</label>
                <div className="flex flex-wrap gap-2">
                  {platforms.map(p => (
                    <button key={p} onClick={() => togglePlatform(p)}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition ${genForm.platforms.includes(p) ? "bg-orange-600 border-orange-500 text-white" : "border-gray-700 text-gray-400 hover:border-gray-500"}`}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-400">Schedule a post to your Buffer profiles. Load profiles above first.</p>
              {profiles.length > 0 ? (
                <div>
                  <label className={labelCls}>Select profiles</label>
                  <div className="space-y-2">
                    {profiles.map(p => (
                      <label key={p.id} className="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" checked={schedForm.selectedProfileIds.includes(p.id)} onChange={() => toggleProfileId(p.id)} className="w-4 h-4 rounded accent-orange-500" />
                        <span className="text-sm text-gray-300">{p.service}: {p.formatted_username}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-500">Load your Buffer profiles above to select them.</p>
              )}
              <div>
                <label className={labelCls}>Post text</label>
                <textarea value={schedForm.text} onChange={e => setSchedForm(f => ({ ...f, text: e.target.value }))}
                  placeholder="Write your post here…" rows={4}
                  className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-600 text-sm focus:outline-none focus:border-orange-500 resize-none" />
              </div>
              <div>
                <label className={labelCls}>Schedule time (optional — leave blank to add to queue)</label>
                <input type="datetime-local" value={schedForm.scheduledAt} onChange={e => setSchedForm(f => ({ ...f, scheduledAt: e.target.value }))} className={inputCls} />
              </div>
            </>
          )}

          {error ? <p className="text-red-400 text-sm">{error}</p> : null}
          <button onClick={tab === "generate" ? generate : schedule} disabled={loading}
            className="w-full py-3 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-semibold rounded-xl transition">
            {loading ? "Working…" : tab === "generate" ? "Generate Content" : "Schedule Post"}
          </button>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 overflow-auto max-h-[600px]">
          {!result && !loading ? (
            <div className="h-full flex items-center justify-center">
              <p className="text-gray-600 text-sm text-center">Generated content or schedule confirmation will appear here.</p>
            </div>
          ) : null}
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-gray-400 text-sm">{tab === "generate" ? "Generating platform content…" : "Scheduling post…"}</p>
              </div>
            </div>
          ) : null}
          {result ? <BufferResult data={result} tab={tab} /> : null}
        </div>
      </div>
    </div>
  )
}

function BufferResult({ data, tab }: { data: unknown; tab: string }) {
  const d = data as Record<string, unknown>

  if (tab === "schedule") {
    const updates = Array.isArray(d.updates) ? (d.updates as Array<Record<string, unknown>>) : []
    return (
      <div className="space-y-4">
        <div className="border border-emerald-800/40 bg-emerald-950/20 rounded-lg p-4">
          <p className="text-sm font-bold text-emerald-400">Post Scheduled Successfully</p>
          <p className="text-xs text-gray-400 mt-1">{String(d.message ?? `Queued to ${updates.length} profile(s)`)}</p>
        </div>
        {updates.length > 0 ? (
          <div className="space-y-2">
            {updates.map((u, i) => (
              <div key={i} className="border border-gray-700 rounded-lg p-3">
                <p className="text-xs font-semibold text-white">Profile: {String(u.profile_id ?? u.profileId ?? "")}</p>
                <p className="text-xs text-gray-400 mt-0.5">Status: {String(u.status ?? "queued")}</p>
                {u.due ? <p className="text-xs text-orange-400 mt-0.5">Due: {String(u.due)}</p> : null}
              </div>
            ))}
          </div>
        ) : null}
        <pre className="text-xs text-gray-500 whitespace-pre-wrap">{JSON.stringify(data, null, 2)}</pre>
      </div>
    )
  }

  const posts = d.posts as Record<string, unknown> | undefined
  if (posts) {
    const platformKeys = Object.keys(posts)
    return (
      <div className="space-y-4">
        {platformKeys.map(platform => {
          const post = posts[platform] as Record<string, unknown>
          return (
            <div key={platform} className="border border-gray-700 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold text-orange-400 uppercase">{platform}</span>
                {post.characterCount ? <span className="text-xs text-gray-500">{String(post.characterCount)} chars</span> : null}
              </div>
              <p className="text-sm text-white whitespace-pre-wrap">{String(post.text ?? post.content ?? "")}</p>
              {Array.isArray(post.hashtags) ? (
                <div className="flex flex-wrap gap-1 mt-2">
                  {(post.hashtags as string[]).map((tag, i) => (
                    <span key={i} className="text-xs text-orange-400">{tag.startsWith("#") ? tag : `#${tag}`}</span>
                  ))}
                </div>
              ) : null}
              {post.tip ? <p className="text-xs text-gray-500 mt-2 italic">{String(post.tip)}</p> : null}
              <button onClick={() => navigator.clipboard.writeText(String(post.text ?? post.content ?? ""))}
                className="mt-2 text-xs text-gray-500 hover:text-white border border-gray-700 rounded px-2 py-1">Copy</button>
            </div>
          )
        })}
      </div>
    )
  }

  return <pre className="text-xs text-gray-500 whitespace-pre-wrap">{JSON.stringify(data, null, 2)}</pre>
}
