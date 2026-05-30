"use client"
import { useState } from "react"
import { Field, Input, AgentCard, OutputPanel, RunButton } from "@/components/ui/AgentInput"

type Tab = "google" | "facebook" | "landing-page"

const TABS: { id: Tab; label: string; description: string; icon: string }[] = [
  { id: "google",       label: "Google Ads",         icon: "🔍", description: "Search campaigns with headlines, descriptions, and bid strategy" },
  { id: "facebook",     label: "Facebook/Instagram",  icon: "📘", description: "Campaign creative for all 3 funnel stages with audience targeting" },
  { id: "landing-page", label: "Landing Page",        icon: "🖥️", description: "Full Pain-Agitate-Solve landing page copy that converts" },
]

export default function AdsPage() {
  const [tab,    setTab]    = useState<Tab>("google")
  const [loading, setLoading] = useState(false)
  const [result,  setResult]  = useState<unknown>(null)
  const [error,   setError]   = useState("")

  const [googleForm,  setGoogleForm]  = useState({ service: "", targetKeywords: "", uvp: "", offer: "" })
  const [facebookForm, setFacebookForm] = useState({ service: "", targetAudience: "", offer: "", budget: "" })
  const [landingForm,  setLandingForm]  = useState({ service: "", targetAudience: "", painPoints: "", offer: "", guarantee: "" })

  async function generate() {
    setLoading(true); setError(""); setResult(null)
    try {
      let body: Record<string, unknown> = { action: tab }
      if (tab === "google")       body = { ...body, ...googleForm,  targetKeywords: googleForm.targetKeywords.split(",").map(s => s.trim()).filter(Boolean) }
      if (tab === "facebook")     body = { ...body, ...facebookForm }
      if (tab === "landing-page") body = { ...body, ...landingForm, painPoints: landingForm.painPoints.split(",").map(s => s.trim()).filter(Boolean) }

      const res = await fetch("/api/agents/ads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      if (!res.ok) throw new Error(await res.text())
      setResult(await res.json())
    } catch (e) { setError(e instanceof Error ? e.message : "Failed") }
    finally { setLoading(false) }
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-7">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-2xl bg-orange-500/15 border border-orange-500/25 flex items-center justify-center text-xl">📢</div>
          <div>
            <h1 className="text-2xl font-bold">Ad Copy Agent</h1>
            <p className="text-gray-500 text-xs mt-0.5">Iterates until output meets professional standard</p>
          </div>
        </div>
        <p className="text-gray-400 text-sm">High-converting Google, Facebook, and landing page copy — the agent keeps refining until it&apos;s genuinely good.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-900/60 border border-gray-800 rounded-2xl p-1.5 w-fit mb-6">
        {TABS.map(t => (
          <button key={t.id} onClick={() => { setTab(t.id); setResult(null) }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              tab === t.id
                ? "bg-gradient-to-r from-orange-600 to-red-600 text-white shadow-lg shadow-orange-900/20"
                : "text-gray-400 hover:text-white hover:bg-gray-800/60"
            }`}>
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        {/* Form */}
        <AgentCard>
          <p className="text-xs text-gray-500 leading-relaxed border-b border-gray-800/60 pb-4">{TABS.find(t => t.id === tab)?.description}</p>

          {tab === "google" && (
            <>
              <Field label="Service to advertise" required>
                <Input value={googleForm.service} onChange={e => setGoogleForm(f => ({ ...f, service: e.target.value }))} placeholder="e.g. HVAC Repair, Dental Cleanings" accent="orange" />
              </Field>
              <Field label="Target keywords" hint="Separate with commas">
                <Input value={googleForm.targetKeywords} onChange={e => setGoogleForm(f => ({ ...f, targetKeywords: e.target.value }))} placeholder="e.g. plumber near me, emergency plumbing" accent="orange" />
              </Field>
              <Field label="Unique value proposition">
                <Input value={googleForm.uvp} onChange={e => setGoogleForm(f => ({ ...f, uvp: e.target.value }))} placeholder="e.g. Same-day service, licensed, upfront pricing" accent="orange" />
              </Field>
              <Field label="Current offer (optional)">
                <Input value={googleForm.offer} onChange={e => setGoogleForm(f => ({ ...f, offer: e.target.value }))} placeholder="e.g. Free estimate, 20% off first visit" accent="orange" />
              </Field>
            </>
          )}

          {tab === "facebook" && (
            <>
              <Field label="Service to promote" required>
                <Input value={facebookForm.service} onChange={e => setFacebookForm(f => ({ ...f, service: e.target.value }))} placeholder="e.g. Personal training, Tax preparation" accent="orange" />
              </Field>
              <Field label="Target audience">
                <Input value={facebookForm.targetAudience} onChange={e => setFacebookForm(f => ({ ...f, targetAudience: e.target.value }))} placeholder="e.g. Local homeowners 35–55 interested in home improvement" accent="orange" />
              </Field>
              <Field label="Offer / CTA">
                <Input value={facebookForm.offer} onChange={e => setFacebookForm(f => ({ ...f, offer: e.target.value }))} placeholder="e.g. Free consultation, limited spots" accent="orange" />
              </Field>
              <Field label="Monthly budget (optional)">
                <Input value={facebookForm.budget} onChange={e => setFacebookForm(f => ({ ...f, budget: e.target.value }))} placeholder="e.g. $500/month" accent="orange" />
              </Field>
            </>
          )}

          {tab === "landing-page" && (
            <>
              <Field label="Service / product" required>
                <Input value={landingForm.service} onChange={e => setLandingForm(f => ({ ...f, service: e.target.value }))} placeholder="e.g. Teeth whitening, Business coaching" accent="orange" />
              </Field>
              <Field label="Target audience">
                <Input value={landingForm.targetAudience} onChange={e => setLandingForm(f => ({ ...f, targetAudience: e.target.value }))} placeholder="e.g. Busy professionals 30–50" accent="orange" />
              </Field>
              <Field label="Pain points" hint="Separate with commas">
                <Input value={landingForm.painPoints} onChange={e => setLandingForm(f => ({ ...f, painPoints: e.target.value }))} placeholder="e.g. Too busy, afraid of cost, tried before" accent="orange" />
              </Field>
              <Field label="Your offer">
                <Input value={landingForm.offer} onChange={e => setLandingForm(f => ({ ...f, offer: e.target.value }))} placeholder="e.g. Full whitening kit + 2 touch-ups for $199" accent="orange" />
              </Field>
              <Field label="Guarantee (optional)">
                <Input value={landingForm.guarantee} onChange={e => setLandingForm(f => ({ ...f, guarantee: e.target.value }))} placeholder="e.g. 30-day money back" accent="orange" />
              </Field>
            </>
          )}

          {error && (
            <div className="bg-red-950/30 border border-red-800/50 rounded-xl px-3 py-2.5 text-red-400 text-sm">{error}</div>
          )}

          <RunButton
            loading={loading}
            accent="orange"
            label="Generate Ad Copy →"
            loadingLabel="Agent refining until satisfied…"
            onClick={generate}
          />
        </AgentCard>

        {/* Output */}
        <OutputPanel
          loading={loading}
          accent="orange"
          empty={
            <div className="text-center">
              <div className="text-3xl mb-3">📢</div>
              <p className="text-gray-500 text-sm">Your ad copy will appear here.</p>
              <p className="text-gray-600 text-xs mt-1">The agent iterates until it meets quality standard.</p>
            </div>
          }
        >
          {result && <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono leading-relaxed">{JSON.stringify(result, null, 2)}</pre>}
        </OutputPanel>
      </div>
    </div>
  )
}
