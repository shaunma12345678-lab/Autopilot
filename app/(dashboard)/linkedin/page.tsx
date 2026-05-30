"use client"

import { useState } from "react"
import { ConnectBanner } from "@/components/ConnectBanner"

type Tab = "generate" | "post"
type PostType = "thought-leadership" | "company-update" | "case-study" | "hiring"

const TABS: { id: Tab; label: string }[] = [
  { id: "generate", label: "Generate Post" },
  { id: "post", label: "Post to LinkedIn" },
]

const POST_TYPES: { value: PostType; label: string }[] = [
  { value: "thought-leadership", label: "Thought Leadership" },
  { value: "company-update", label: "Company Update" },
  { value: "case-study", label: "Case Study" },
  { value: "hiring", label: "Hiring Announcement" },
]

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
        className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-600 text-sm focus:outline-none focus:border-cyan-500"
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
        className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-600 text-sm focus:outline-none focus:border-cyan-500 resize-none"
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
  options: { value: string; label: string }[]
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-400 mb-1.5">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500"
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
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
    <button onClick={copy} className="text-xs px-2.5 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition">
      {copied ? "Copied!" : "Copy"}
    </button>
  )
}

type GenerateResult = { post: string; hook: string; hashtags: string[]; estimatedReach: string; bestTime: string }
type PostResult = { success: boolean; postId?: string; error?: string }

export default function LinkedInPage() {
  const [tab, setTab] = useState<Tab>("generate")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  // Generate tab
  const [genBusiness, setGenBusiness] = useState("")
  const [genTopic, setGenTopic] = useState("")
  const [genType, setGenType] = useState<PostType>("thought-leadership")
  const [genResult, setGenResult] = useState<GenerateResult | null>(null)

  // Post tab
  const [postAccessToken, setPostAccessToken] = useState("")
  const [postPersonId, setPostPersonId] = useState("")
  const [profileName, setProfileName] = useState("")
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState("")
  const [postBusiness, setPostBusiness] = useState("")
  const [postTopic, setPostTopic] = useState("")
  const [postType, setPostType] = useState<PostType>("thought-leadership")
  const [postResult, setPostResult] = useState<{ generated: GenerateResult; post: PostResult } | null>(null)

  async function fetchProfile() {
    if (!postAccessToken) return
    setProfileLoading(true)
    setProfileError("")
    setProfileName("")
    try {
      const res = await fetch("/api/agents/linkedin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get-profile", accessToken: postAccessToken }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed")
      setPostPersonId(data.profile.id)
      setProfileName(data.profile.name)
    } catch (e) {
      setProfileError(e instanceof Error ? e.message : "Failed to load profile")
    } finally {
      setProfileLoading(false)
    }
  }

  async function handleGenerate() {
    setLoading(true)
    setError("")
    setGenResult(null)
    try {
      const res = await fetch("/api/agents/linkedin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate", businessDescription: genBusiness, topic: genTopic, postType: genType }),
      })
      if (!res.ok) throw new Error(await res.text())
      setGenResult(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed")
    } finally {
      setLoading(false)
    }
  }

  async function handlePost() {
    setLoading(true)
    setError("")
    setPostResult(null)
    try {
      const res = await fetch("/api/agents/linkedin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "post", accessToken: postAccessToken, personId: postPersonId, businessDescription: postBusiness, topic: postTopic, postType }),
      })
      if (!res.ok) throw new Error(await res.text())
      setPostResult(await res.json())
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
          <div className="w-9 h-9 rounded-xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-lg">💼</div>
          <h1 className="text-2xl font-bold">LinkedIn Auto-Poster</h1>
        </div>
        <p className="text-gray-400">Write and publish LinkedIn posts that drive real professional engagement.</p>
      </div>

      <ConnectBanner
        provider="linkedin"
        detail="Connect your LinkedIn profile or company page to post content with one click."
      />

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit mb-6">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); setError("") }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === t.id ? "bg-cyan-600 text-white" : "text-gray-400 hover:text-white"}`}
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

      {/* Generate Tab */}
      {tab === "generate" ? (
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
            <Textarea label="Business description" value={genBusiness} onChange={setGenBusiness} placeholder="e.g. B2B SaaS company helping HR teams automate onboarding. 50 employees, Series A." />
            <Field label="Topic / what to post about" value={genTopic} onChange={setGenTopic} placeholder="e.g. Lessons from our first 100 customers" />
            <SelectField label="Post type" value={genType} onChange={v => setGenType(v as PostType)} options={POST_TYPES} />
            <button
              onClick={handleGenerate}
              disabled={loading || !genBusiness || !genTopic}
              className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-semibold rounded-xl transition"
            >
              {loading ? "Writing…" : "Generate LinkedIn Post"}
            </button>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            {genResult ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-cyan-400">Your Post</h3>
                  <CopyButton text={genResult.post} />
                </div>
                <p className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">{genResult.post}</p>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div className="bg-gray-800 rounded-lg p-2.5">
                    <p className="text-xs text-gray-500 mb-0.5">Est. reach</p>
                    <p className="text-xs text-gray-200">{genResult.estimatedReach}</p>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-2.5">
                    <p className="text-xs text-gray-500 mb-0.5">Best time</p>
                    <p className="text-xs text-gray-200">{genResult.bestTime}</p>
                  </div>
                </div>
                {Array.isArray(genResult.hashtags) ? (
                  <div className="flex flex-wrap gap-1.5">
                    {genResult.hashtags.map((tag, i) => (
                      <span key={i} className="text-xs bg-cyan-900/30 text-cyan-300 border border-cyan-800/40 rounded-full px-2 py-0.5">#{tag.replace(/^#/, "")}</span>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="h-full flex items-center justify-center min-h-[200px]">
                {loading ? (
                  <div className="text-center">
                    <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-gray-400 text-sm">Writing your post…</p>
                  </div>
                ) : (
                  <p className="text-gray-600 text-sm text-center">Your post will appear here.</p>
                )}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* Post Tab */}
      {tab === "post" ? (
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Access Token</label>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={postAccessToken}
                  onChange={e => { setPostAccessToken(e.target.value); setProfileName(""); setPostPersonId("") }}
                  placeholder="Paste LinkedIn access token"
                  className="flex-1 px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-600 text-sm focus:outline-none focus:border-cyan-500"
                />
                <button
                  onClick={fetchProfile}
                  disabled={!postAccessToken || profileLoading}
                  className="px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition"
                >
                  {profileLoading ? "…" : "Verify"}
                </button>
              </div>
              {profileName ? (
                <p className="text-xs text-green-400 mt-1.5">Logged in as: <strong>{profileName}</strong></p>
              ) : null}
              {profileError ? (
                <p className="text-xs text-red-400 mt-1.5">{profileError}</p>
              ) : null}
            </div>
            <Textarea label="Business description" value={postBusiness} onChange={setPostBusiness} placeholder="e.g. B2B SaaS company helping HR teams automate onboarding." />
            <Field label="Topic / what to post about" value={postTopic} onChange={setPostTopic} placeholder="e.g. Lessons from our first 100 customers" />
            <SelectField label="Post type" value={postType} onChange={v => setPostType(v as PostType)} options={POST_TYPES} />
            <button
              onClick={handlePost}
              disabled={loading || !postAccessToken || !postPersonId || !postBusiness || !postTopic}
              className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-semibold rounded-xl transition"
            >
              {loading ? "Generating & Posting…" : "Generate & Post to LinkedIn"}
            </button>
            {!postPersonId && postAccessToken ? (
              <p className="text-xs text-amber-400">Click Verify to authenticate before posting.</p>
            ) : null}
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            {postResult ? (
              <div className="space-y-4">
                {postResult.post.success ? (
                  <div className="flex items-start gap-2 bg-green-900/20 border border-green-700/40 rounded-xl p-4">
                    <span className="text-green-400 shrink-0">✓</span>
                    <div>
                      <p className="text-sm font-semibold text-green-300">Posted to LinkedIn!</p>
                      {postResult.post.postId ? (
                        <p className="text-xs text-gray-400 mt-1">Post ID: {postResult.post.postId}</p>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2 bg-red-900/20 border border-red-700/40 rounded-xl p-4">
                    <span className="text-red-400 shrink-0">✕</span>
                    <p className="text-sm text-red-300">{postResult.post.error ?? "Post failed"}</p>
                  </div>
                )}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-gray-400">Published post</p>
                    <CopyButton text={postResult.generated.post} />
                  </div>
                  <p className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed bg-gray-800 rounded-lg p-3">{postResult.generated.post}</p>
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center min-h-[200px]">
                {loading ? (
                  <div className="text-center">
                    <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-gray-400 text-sm">Writing and posting…</p>
                  </div>
                ) : (
                  <p className="text-gray-600 text-sm text-center">Verify your token and fill in the form<br />to generate and post.</p>
                )}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
