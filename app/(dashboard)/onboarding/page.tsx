"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

const PERSONALITY_OPTIONS = [
  "Professional", "Friendly", "Casual", "Authoritative", "Humorous",
  "Inspirational", "Educational", "Trustworthy", "Innovative", "Community-focused"
]

const PLATFORM_OPTIONS = ["Instagram", "Facebook", "Google Business", "LinkedIn", "TikTok", "Twitter/X"]

const BUSINESS_TYPES = [
  "Restaurant / Café", "Hair Salon / Barbershop", "Nail Salon / Spa",
  "Contractor / Tradesperson", "Auto Shop / Dealership", "Retail Store",
  "Medical / Dental Practice", "Fitness / Gym", "Real Estate",
  "Legal / Financial Services", "Cleaning / Home Services", "Other"
]

type Step = 1 | 2 | 3 | 4 | 5

interface FormData {
  name: string; type: string; location: string; phone: string; website: string
  description: string; personality: string[]; targetAudience: string
  uniqueSellingPoints: string; tone: string; emojiUsage: boolean
  goals: string; platforms: string[]; frequency: string
}

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [sampleContent, setSampleContent] = useState<Array<{ body: string; hashtags: string[] }>>([])
  const [businessId, setBusinessId] = useState("")

  const [form, setForm] = useState<FormData>({
    name: "", type: "", location: "", phone: "", website: "", description: "",
    personality: [], targetAudience: "", uniqueSellingPoints: "", tone: "friendly",
    emojiUsage: true, goals: "", platforms: [], frequency: "3x week"
  })

  function update(field: keyof FormData, value: unknown) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function toggleArrayItem(field: "personality" | "platforms", item: string) {
    setForm(prev => ({
      ...prev,
      [field]: prev[field].includes(item)
        ? prev[field].filter(i => i !== item)
        : [...prev[field], item]
    }))
  }

  async function handleGeneratePreview() {
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessInfo: form }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed to generate preview")
      setBusinessId(data.business.id)

      const contentRes = await fetch(`/api/agents/content?businessId=${data.business.id}&status=PENDING`)
      const contentData = await contentRes.json()
      setSampleContent(contentData.content?.slice(0, 3) ?? [])
      setStep(4)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  async function handleSelectPlan(plan: string) {
    if (plan === "FREE") {
      router.push("/dashboard")
      return
    }
    setLoading(true)
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      })
      const { url } = await res.json()
      if (url) window.location.href = url
    } catch {
      setError("Failed to start checkout")
    } finally {
      setLoading(false)
    }
  }

  const stepTitles = ["Business Info", "Brand Voice", "Goals", "Preview", "Choose Plan"]
  const progress = (step / 5) * 100

  return (
    <div className="min-h-screen bg-gray-950 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">AP</span>
            </div>
            <span className="text-white font-bold text-xl">AutoPilot</span>
          </div>
          <p className="text-gray-400 text-sm">Step {step} of 5 — {stepTitles[step - 1]}</p>
          <div className="mt-3 h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-600 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8">
          {error && (
            <div className="mb-4 bg-red-900/30 border border-red-700 rounded-lg px-4 py-3 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Step 1: Basic Info */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-white">Tell us about your business</h2>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Business name *</label>
                <input value={form.name} onChange={e => update("name", e.target.value)}
                  placeholder="e.g. Smith's Auto Repair"
                  className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Business type *</label>
                <select value={form.type} onChange={e => update("type", e.target.value)}
                  className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition">
                  <option value="">Select a type...</option>
                  {BUSINESS_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">City, State *</label>
                <input value={form.location} onChange={e => update("location", e.target.value)}
                  placeholder="e.g. Austin, TX"
                  className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Phone</label>
                  <input value={form.phone} onChange={e => update("phone", e.target.value)}
                    placeholder="(555) 000-0000"
                    className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Website</label>
                  <input value={form.website} onChange={e => update("website", e.target.value)}
                    placeholder="yoursite.com"
                    className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition" />
                </div>
              </div>
              <button
                disabled={!form.name || !form.type || !form.location}
                onClick={() => setStep(2)}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-semibold rounded-lg transition mt-2">
                Continue
              </button>
            </div>
          )}

          {/* Step 2: Brand Voice */}
          {step === 2 && (
            <div className="space-y-5">
              <h2 className="text-xl font-bold text-white">Define your brand voice</h2>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Personality traits (pick up to 4)</label>
                <div className="flex flex-wrap gap-2">
                  {PERSONALITY_OPTIONS.map(trait => (
                    <button key={trait} onClick={() => toggleArrayItem("personality", trait)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium border transition ${
                        form.personality.includes(trait)
                          ? "bg-indigo-600 border-indigo-600 text-white"
                          : "bg-gray-800 border-gray-700 text-gray-300 hover:border-indigo-500"
                      }`}>
                      {trait}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Who is your ideal customer?</label>
                <textarea value={form.targetAudience} onChange={e => update("targetAudience", e.target.value)}
                  rows={2} placeholder="e.g. Homeowners aged 35-60 in the suburbs who value quality work"
                  className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition resize-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">What makes you different?</label>
                <textarea value={form.uniqueSellingPoints} onChange={e => update("uniqueSellingPoints", e.target.value)}
                  rows={2} placeholder="e.g. Family-owned for 20 years, same-day service, lifetime warranty"
                  className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Content tone</label>
                  <select value={form.tone} onChange={e => update("tone", e.target.value)}
                    className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500 transition">
                    {["professional", "casual", "friendly", "authoritative"].map(t => (
                      <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Use emojis in posts?</label>
                  <select value={form.emojiUsage ? "yes" : "no"} onChange={e => update("emojiUsage", e.target.value === "yes")}
                    className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500 transition">
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setStep(1)} className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 font-semibold rounded-lg transition">Back</button>
                <button onClick={() => setStep(3)} className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg transition">Continue</button>
              </div>
            </div>
          )}

          {/* Step 3: Goals */}
          {step === 3 && (
            <div className="space-y-5">
              <h2 className="text-xl font-bold text-white">Set your goals</h2>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Primary goal right now</label>
                <select value={form.goals} onChange={e => update("goals", e.target.value)}
                  className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500 transition">
                  <option value="">Select your main goal...</option>
                  <option value="get more customers">Get more customers</option>
                  <option value="retain existing customers">Retain existing customers</option>
                  <option value="build online reputation">Build online reputation</option>
                  <option value="grow social media presence">Grow social media presence</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Which platforms are you on?</label>
                <div className="flex flex-wrap gap-2">
                  {PLATFORM_OPTIONS.map(p => (
                    <button key={p} onClick={() => toggleArrayItem("platforms", p)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium border transition ${
                        form.platforms.includes(p)
                          ? "bg-indigo-600 border-indigo-600 text-white"
                          : "bg-gray-800 border-gray-700 text-gray-300 hover:border-indigo-500"
                      }`}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">How often do you want to post?</label>
                <select value={form.frequency} onChange={e => update("frequency", e.target.value)}
                  className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500 transition">
                  <option value="daily">Daily</option>
                  <option value="3x week">3x per week</option>
                  <option value="weekly">Weekly</option>
                </select>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setStep(2)} className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 font-semibold rounded-lg transition">Back</button>
                <button
                  disabled={loading || !form.goals}
                  onClick={handleGeneratePreview}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-semibold rounded-lg transition">
                  {loading ? "Generating..." : "Generate Preview"}
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Preview */}
          {step === 4 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-bold text-white">Here&apos;s what your content will look like</h2>
                <p className="text-gray-400 text-sm mt-1">These are your first 3 posts. Does this sound like you?</p>
              </div>
              <div className="space-y-3">
                {sampleContent.map((post, i) => (
                  <div key={i} className="bg-gray-800 border border-gray-700 rounded-xl p-4">
                    <p className="text-white text-sm leading-relaxed">{post.body}</p>
                    {post.hashtags?.length > 0 && (
                      <p className="text-indigo-400 text-xs mt-2">{post.hashtags.map(h => `#${h}`).join(" ")}</p>
                    )}
                  </div>
                ))}
                {sampleContent.length === 0 && (
                  <div className="text-center py-8 text-gray-500">Loading sample content...</div>
                )}
              </div>
              <div className="flex gap-3">
                <button onClick={() => setStep(3)} className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 font-semibold rounded-lg transition">Adjust Voice</button>
                <button onClick={() => setStep(5)} className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg transition">Looks great!</button>
              </div>
            </div>
          )}

          {/* Step 5: Choose Plan */}
          {step === 5 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-bold text-white">Choose your plan</h2>
                <p className="text-gray-400 text-sm mt-1">Start free. Upgrade anytime.</p>
              </div>
              <div className="space-y-3">
                {[
                  { key: "FREE", price: "$0", label: "Free", desc: "5 posts/mo, review monitoring", highlight: false },
                  { key: "STARTER", price: "$49", label: "Starter", desc: "30 posts/mo, unlimited review responses", highlight: false },
                  { key: "GROWTH", price: "$99", label: "Growth", desc: "Unlimited posts, lead gen, 3 businesses", highlight: true },
                  { key: "PRO", price: "$199", label: "Pro", desc: "Everything + white-label + API access", highlight: false },
                ].map(plan => (
                  <button
                    key={plan.key}
                    disabled={loading}
                    onClick={() => handleSelectPlan(plan.key)}
                    className={`w-full text-left px-5 py-4 rounded-xl border transition ${
                      plan.highlight
                        ? "border-indigo-500 bg-indigo-600/10 hover:bg-indigo-600/20"
                        : "border-gray-700 bg-gray-800 hover:border-gray-600"
                    }`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-white font-semibold">{plan.label}</span>
                          {plan.highlight && <span className="text-xs bg-indigo-600 text-white px-2 py-0.5 rounded-full">Most popular</span>}
                        </div>
                        <p className="text-gray-400 text-sm mt-0.5">{plan.desc}</p>
                      </div>
                      <span className="text-white font-bold text-lg">{plan.price}<span className="text-gray-400 text-sm font-normal">/mo</span></span>
                    </div>
                  </button>
                ))}
              </div>
              <button onClick={() => setStep(4)} className="w-full py-2 text-sm text-gray-500 hover:text-gray-400 transition">Back</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
