"use client"

import { useState } from "react"
import { ConnectBanner } from "@/components/ConnectBanner"

type Tab = "generate" | "post-facebook" | "post-instagram"

const TABS: { id: Tab; label: string }[] = [
  { id: "generate", label: "Generate Content" },
  { id: "post-facebook", label: "Post to Facebook" },
  { id: "post-instagram", label: "Post to Instagram" },
]

const TONES = ["Professional", "Casual", "Witty", "Urgent"]

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder: string
  type?: string
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-400 mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-600 text-sm focus:outline-none focus:border-blue-500"
      />
    </div>
  )
}

function Textarea({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder: string
  rows?: number
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-400 mb-1.5">{label}</label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-600 text-sm focus:outline-none focus:border-blue-500 resize-none"
      />
    </div>
  )
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: string[]
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-400 mb-1.5">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
      >
        {options.map(o => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </div>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <button
      onClick={copy}
      className="text-xs px-2.5 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  )
}

type FBResult = { post: string; hook: string; callToAction: string; bestPostTime: string; estimatedReach: string }
type IGResult = { caption: string; hashtags: string[]; bio_link_cta: boolean; story_companion: string }
type PostResult = { success: boolean; postId?: string; postUrl?: string; error?: string }

export default function MetaPosterPage() {
  const [tab, setTab] = useState<Tab>("generate")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  // Generate tab state
  const [genBusiness, setGenBusiness] = useState("")
  const [genTopic, setGenTopic] = useState("")
  const [genTone, setGenTone] = useState("Professional")
  const [genEmoji, setGenEmoji] = useState(true)
  const [fbResult, setFbResult] = useState<FBResult | null>(null)
  const [igResult, setIgResult] = useState<IGResult | null>(null)

  // Post to Facebook tab state
  const [fbPageToken, setFbPageToken] = useState("")
  const [fbPageId, setFbPageId] = useState("")
  const [fbBusiness, setFbBusiness] = useState("")
  const [fbTopic, setFbTopic] = useState("")
  const [fbTone, setFbTone] = useState("Professional")
  const [fbPostResult, setFbPostResult] = useState<{ generated: FBResult; post: PostResult } | null>(null)

  // Post to Instagram tab state
  const [igPageToken, setIgPageToken] = useState("")
  const [igUserId, setIgUserId] = useState("")
  const [igImageUrl, setIgImageUrl] = useState("")
  const [igBusiness, setIgBusiness] = useState("")
  const [igTopic, setIgTopic] = useState("")
  const [igTone, setIgTone] = useState("Professional")
  const [igHashtagsInput, setIgHashtagsInput] = useState("")
  const [igPostResult, setIgPostResult] = useState<{ generated: IGResult; post: PostResult } | null>(null)

  function reset() {
    setError("")
    setFbResult(null)
    setIgResult(null)
    setFbPostResult(null)
    setIgPostResult(null)
  }

  async function handleGenerate() {
    setLoading(true)
    reset()
    try {
      const [fbRes, igRes] = await Promise.all([
        fetch("/api/agents/meta-poster", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "generate-facebook", businessDescription: genBusiness, topic: genTopic, tone: genTone, includeEmoji: genEmoji }),
        }),
        fetch("/api/agents/meta-poster", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "generate-instagram", businessDescription: genBusiness, topic: genTopic, tone: genTone, hashtags: [] }),
        }),
      ])
      if (!fbRes.ok) throw new Error(await fbRes.text())
      if (!igRes.ok) throw new Error(await igRes.text())
      setFbResult(await fbRes.json())
      setIgResult(await igRes.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed")
    } finally {
      setLoading(false)
    }
  }

  async function handlePostFacebook() {
    setLoading(true)
    setError("")
    setFbPostResult(null)
    try {
      const res = await fetch("/api/agents/meta-poster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "post-facebook", pageId: fbPageId, pageAccessToken: fbPageToken, businessDescription: fbBusiness, topic: fbTopic, tone: fbTone, includeEmoji: true }),
      })
      if (!res.ok) throw new Error(await res.text())
      setFbPostResult(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed")
    } finally {
      setLoading(false)
    }
  }

  async function handlePostInstagram() {
    setLoading(true)
    setError("")
    setIgPostResult(null)
    try {
      const hashtags = igHashtagsInput.split(",").map(s => s.trim()).filter(Boolean)
      const res = await fetch("/api/agents/meta-poster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "post-instagram", igUserId, pageAccessToken: igPageToken, imageUrl: igImageUrl, businessDescription: igBusiness, topic: igTopic, tone: igTone, hashtags }),
      })
      if (!res.ok) throw new Error(await res.text())
      setIgPostResult(await res.json())
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
          <div className="w-9 h-9 rounded-xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-lg">📘</div>
          <h1 className="text-2xl font-bold">Facebook & Instagram Agent</h1>
        </div>
        <p className="text-gray-400">Post directly to your Facebook Page and Instagram — AI writes it, you approve it, one click sends it.</p>
      </div>

      <ConnectBanner
        provider="facebook"
        detail="Connect your Facebook Page and Instagram Business account so AutoPilot can post on your behalf."
      />

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit mb-6">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); reset() }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === t.id ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error ? (
        <div className="mb-4 flex items-center gap-2 bg-red-900/20 border border-red-700/40 rounded-xl p-4">
          <span className="text-red-400 shrink-0">✕</span>
          <p className="text-sm text-red-300">{error}</p>
        </div>
      ) : null}

      {/* Generate Content Tab */}
      {tab === "generate" ? (
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
            <Textarea label="Business description" value={genBusiness} onChange={setGenBusiness} placeholder="e.g. Family-owned Italian restaurant in Austin, TX. Known for homemade pasta and wood-fired pizza." />
            <Field label="Topic / what to post about" value={genTopic} onChange={setGenTopic} placeholder="e.g. New summer menu launch" />
            <SelectField label="Tone" value={genTone} onChange={setGenTone} options={TONES} />
            <div className="flex items-center gap-3">
              <input
                id="emoji-toggle"
                type="checkbox"
                checked={genEmoji}
                onChange={e => setGenEmoji(e.target.checked)}
                className="w-4 h-4 accent-blue-500"
              />
              <label htmlFor="emoji-toggle" className="text-sm text-gray-300">Include emoji</label>
            </div>
            <button
              onClick={handleGenerate}
              disabled={loading || !genBusiness || !genTopic}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold rounded-xl transition"
            >
              {loading ? "Generating…" : "Generate Facebook + Instagram Content"}
            </button>
          </div>

          <div className="space-y-4">
            {fbResult ? (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-blue-400">Facebook Post</h3>
                  <CopyButton text={fbResult.post} />
                </div>
                <p className="text-sm text-gray-200 whitespace-pre-wrap">{fbResult.post}</p>
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <div className="bg-gray-800 rounded-lg p-2.5">
                    <p className="text-xs text-gray-500 mb-0.5">Best time</p>
                    <p className="text-xs text-gray-200">{fbResult.bestPostTime}</p>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-2.5">
                    <p className="text-xs text-gray-500 mb-0.5">Est. reach</p>
                    <p className="text-xs text-gray-200">{fbResult.estimatedReach}</p>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-2.5 col-span-2">
                    <p className="text-xs text-gray-500 mb-0.5">CTA</p>
                    <p className="text-xs text-gray-200">{fbResult.callToAction}</p>
                  </div>
                </div>
              </div>
            ) : null}

            {igResult ? (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-pink-400">Instagram Caption</h3>
                  <CopyButton text={igResult.caption} />
                </div>
                <p className="text-sm text-gray-200 whitespace-pre-wrap">{igResult.caption}</p>
                {Array.isArray(igResult.hashtags) ? (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {igResult.hashtags.map((tag, i) => (
                      <span key={i} className="text-xs bg-pink-900/30 text-pink-300 border border-pink-800/40 rounded-full px-2 py-0.5">#{tag.replace(/^#/, "")}</span>
                    ))}
                  </div>
                ) : null}
                {igResult.story_companion ? (
                  <div className="bg-gray-800 rounded-lg p-2.5">
                    <p className="text-xs text-gray-500 mb-0.5">Story companion</p>
                    <p className="text-xs text-gray-200">{igResult.story_companion}</p>
                  </div>
                ) : null}
              </div>
            ) : null}

            {!fbResult && !igResult && !loading ? (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 flex items-center justify-center h-48">
                <p className="text-gray-600 text-sm text-center">Generated content will appear here.</p>
              </div>
            ) : null}

            {loading ? (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 flex items-center justify-center h-48">
                <div className="text-center">
                  <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-gray-400 text-sm">Writing your posts…</p>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Post to Facebook Tab */}
      {tab === "post-facebook" ? (
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
            <Field label="Page Access Token" value={fbPageToken} onChange={setFbPageToken} placeholder="Paste your Page Access Token from Meta Business Suite" type="password" />
            <Field label="Page ID" value={fbPageId} onChange={setFbPageId} placeholder="e.g. 123456789" />
            <Textarea label="Business description" value={fbBusiness} onChange={setFbBusiness} placeholder="e.g. Family-owned Italian restaurant in Austin, TX." />
            <Field label="Topic / what to post about" value={fbTopic} onChange={setFbTopic} placeholder="e.g. Weekend brunch special" />
            <SelectField label="Tone" value={fbTone} onChange={setFbTone} options={TONES} />
            <button
              onClick={handlePostFacebook}
              disabled={loading || !fbPageToken || !fbPageId || !fbBusiness || !fbTopic}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold rounded-xl transition"
            >
              {loading ? "Generating & Posting…" : "Generate & Post to Facebook"}
            </button>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
            {fbPostResult ? (
              <>
                {fbPostResult.post.success ? (
                  <div className="flex items-start gap-2 bg-green-900/20 border border-green-700/40 rounded-xl p-4">
                    <span className="text-green-400 shrink-0">✓</span>
                    <div>
                      <p className="text-sm font-semibold text-green-300">Posted successfully!</p>
                      {fbPostResult.post.postUrl ? (
                        <a href={fbPostResult.post.postUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 underline mt-1 block">View post →</a>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2 bg-red-900/20 border border-red-700/40 rounded-xl p-4">
                    <span className="text-red-400 shrink-0">✕</span>
                    <p className="text-sm text-red-300">{fbPostResult.post.error ?? "Post failed"}</p>
                  </div>
                )}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-gray-400">Generated post</p>
                    <CopyButton text={fbPostResult.generated.post} />
                  </div>
                  <p className="text-sm text-gray-200 whitespace-pre-wrap bg-gray-800 rounded-lg p-3">{fbPostResult.generated.post}</p>
                </div>
              </>
            ) : (
              <div className="h-full flex items-center justify-center min-h-[200px]">
                {loading ? (
                  <div className="text-center">
                    <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-gray-400 text-sm">Writing and posting…</p>
                  </div>
                ) : (
                  <p className="text-gray-600 text-sm text-center">Fill in your credentials and topic,<br />then click post.</p>
                )}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* Post to Instagram Tab */}
      {tab === "post-instagram" ? (
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
            <Field label="Page Access Token" value={igPageToken} onChange={setIgPageToken} placeholder="Paste your Page Access Token from Meta Business Suite" type="password" />
            <Field label="Instagram User ID" value={igUserId} onChange={setIgUserId} placeholder="e.g. 17841400458307511" />
            <Field label="Image URL (required for IG)" value={igImageUrl} onChange={setIgImageUrl} placeholder="https://your-cdn.com/image.jpg (publicly accessible)" />
            <Textarea label="Business description" value={igBusiness} onChange={setIgBusiness} placeholder="e.g. Family-owned Italian restaurant in Austin, TX." />
            <Field label="Topic / what to post about" value={igTopic} onChange={setIgTopic} placeholder="e.g. New pasta dish launch" />
            <SelectField label="Tone" value={igTone} onChange={setIgTone} options={TONES} />
            <Field label="Extra hashtags (comma-separated, optional)" value={igHashtagsInput} onChange={setIgHashtagsInput} placeholder="e.g. italianfood, pastalovers, austineats" />
            <button
              onClick={handlePostInstagram}
              disabled={loading || !igPageToken || !igUserId || !igImageUrl || !igBusiness || !igTopic}
              className="w-full py-3 bg-pink-600 hover:bg-pink-500 disabled:opacity-50 text-white font-semibold rounded-xl transition"
            >
              {loading ? "Generating & Posting…" : "Generate & Post to Instagram"}
            </button>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
            {igPostResult ? (
              <>
                {igPostResult.post.success ? (
                  <div className="flex items-start gap-2 bg-green-900/20 border border-green-700/40 rounded-xl p-4">
                    <span className="text-green-400 shrink-0">✓</span>
                    <div>
                      <p className="text-sm font-semibold text-green-300">Posted to Instagram!</p>
                      {igPostResult.post.postId ? (
                        <p className="text-xs text-gray-400 mt-1">Post ID: {igPostResult.post.postId}</p>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2 bg-red-900/20 border border-red-700/40 rounded-xl p-4">
                    <span className="text-red-400 shrink-0">✕</span>
                    <p className="text-sm text-red-300">{igPostResult.post.error ?? "Post failed"}</p>
                  </div>
                )}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-gray-400">Generated caption</p>
                    <CopyButton text={igPostResult.generated.caption} />
                  </div>
                  <p className="text-sm text-gray-200 whitespace-pre-wrap bg-gray-800 rounded-lg p-3">{igPostResult.generated.caption}</p>
                </div>
                {Array.isArray(igPostResult.generated.hashtags) ? (
                  <div className="flex flex-wrap gap-1.5">
                    {igPostResult.generated.hashtags.map((tag, i) => (
                      <span key={i} className="text-xs bg-pink-900/30 text-pink-300 border border-pink-800/40 rounded-full px-2 py-0.5">#{tag.replace(/^#/, "")}</span>
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="h-full flex items-center justify-center min-h-[200px]">
                {loading ? (
                  <div className="text-center">
                    <div className="w-8 h-8 border-2 border-pink-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-gray-400 text-sm">Writing and posting…</p>
                  </div>
                ) : (
                  <p className="text-gray-600 text-sm text-center">Fill in your credentials and topic,<br />then click post.</p>
                )}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
