"use client"

import { useState, useEffect, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import { Suspense } from "react"

type ConnectedAccount = {
  provider:     string
  accountName:  string | null
  accountEmail: string | null
  updatedAt:    string
}

// ── Every connectable service ────────────────────────────────────────────────

type Field = { key: string; label: string; placeholder: string; secret?: boolean; hint?: string }

type Service = {
  id:        string
  name:      string
  logo:      string
  tagline:   string
  color:     string          // bg color key
  authType:  "gmail" | "oauth" | "key"
  oauthHref?: string
  fields?:   Field[]
  enables:   string[]
  getKeyUrl?: string
}

const SERVICES: Service[] = [
  {
    id: "gmail", name: "Gmail", logo: "📧", tagline: "Send emails from your real Gmail address",
    color: "red", authType: "gmail",
    fields: [
      { key: "email", label: "Your Gmail address", placeholder: "you@gmail.com" },
      { key: "appPassword", label: "App Password", placeholder: "xxxx xxxx xxxx xxxx", secret: true,
        hint: "myaccount.google.com → Security → App passwords → Create" },
    ],
    enables: ["Email campaigns from your Gmail", "Lands in Primary not Promotions", "Review request emails"],
    getKeyUrl: "https://myaccount.google.com/apppasswords",
  },
  {
    id: "google", name: "Google Account", logo: "🔵", tagline: "Google Business reviews + full Gmail OAuth",
    color: "blue", authType: "oauth", oauthHref: "/api/auth/google",
    enables: ["Reply to Google reviews", "Google Business posts", "Gmail via OAuth"],
  },
  {
    id: "facebook", name: "Facebook & Instagram", logo: "📘", tagline: "Post to your Page and Instagram Business",
    color: "indigo", authType: "key",
    fields: [
      { key: "pageAccessToken", label: "Page Access Token", placeholder: "EAAxxxxx", secret: true,
        hint: "Meta Business Suite → Settings → Page Access Tokens" },
      { key: "pageId", label: "Facebook Page ID", placeholder: "123456789",
        hint: "Found in your Page → About section" },
      { key: "instagramId", label: "Instagram Account ID (optional)", placeholder: "987654321" },
    ],
    enables: ["Auto-post to Facebook Page", "Auto-post to Instagram Business", "Schedule social content"],
    getKeyUrl: "https://business.facebook.com",
  },
  {
    id: "linkedin", name: "LinkedIn", logo: "💼", tagline: "Publish posts to your profile or company page",
    color: "cyan", authType: "key",
    fields: [
      { key: "accessToken", label: "Access Token", placeholder: "AQV...", secret: true,
        hint: "linkedin.com/developers → My Apps → OAuth 2.0 tools → Generate token" },
      { key: "personUrn", label: "Person URN", placeholder: "urn:li:person:abc123" },
      { key: "companyUrn", label: "Company URN (optional)", placeholder: "urn:li:organization:123" },
    ],
    enables: ["Publish posts to LinkedIn", "Company page management", "Thought leadership content"],
    getKeyUrl: "https://www.linkedin.com/developers/apps",
  },
  {
    id: "buffer", name: "Buffer", logo: "📅", tagline: "Schedule posts across every social channel",
    color: "orange", authType: "key",
    fields: [
      { key: "accessToken", label: "Buffer Access Token", placeholder: "Your Buffer access token", secret: true,
        hint: "buffer.com → Settings → Apps & Integrations → Access Token" },
    ],
    enables: ["Cross-platform post scheduling", "Optimal timing", "Multi-channel content calendar"],
    getKeyUrl: "https://buffer.com",
  },
  {
    id: "twilio", name: "Twilio SMS", logo: "📱", tagline: "Send SMS campaigns and automated texts",
    color: "red", authType: "key",
    fields: [
      { key: "accountSid", label: "Account SID", placeholder: "ACxxxxxxxxxxxxxxxx" },
      { key: "authToken", label: "Auth Token", placeholder: "Your auth token", secret: true },
      { key: "fromNumber", label: "From Number", placeholder: "+15551234567",
        hint: "Your Twilio phone number" },
    ],
    enables: ["SMS campaigns", "Review request texts", "Lead follow-up automation"],
    getKeyUrl: "https://console.twilio.com",
  },
  {
    id: "stripe", name: "Stripe", logo: "💳", tagline: "Revenue dashboards and payment intelligence",
    color: "violet", authType: "key",
    fields: [
      { key: "secretKey", label: "Secret Key", placeholder: "sk_live_...", secret: true,
        hint: "Stripe Dashboard → Developers → API Keys" },
    ],
    enables: ["Revenue analytics", "Churn detection", "Invoice automation", "Payment failure alerts"],
    getKeyUrl: "https://dashboard.stripe.com",
  },
  {
    id: "hubspot", name: "HubSpot CRM", logo: "🧡", tagline: "Sync leads and contacts automatically",
    color: "orange", authType: "key",
    fields: [
      { key: "apiKey", label: "Private App Token", placeholder: "pat-na1-xxxxxxxx", secret: true,
        hint: "HubSpot → Settings → Integrations → Private Apps → Create" },
    ],
    enables: ["Auto-sync new leads", "Deal stage updates", "Contact enrichment"],
    getKeyUrl: "https://app.hubspot.com",
  },
  {
    id: "yelp", name: "Yelp", logo: "⭐", tagline: "Monitor and respond to Yelp reviews",
    color: "red", authType: "key",
    fields: [
      { key: "apiKey", label: "Fusion API Key", placeholder: "Your API key", secret: true },
      { key: "businessId", label: "Business Alias", placeholder: "my-business-city" },
    ],
    enables: ["New review alerts", "AI response drafts", "Rating trend tracking"],
    getKeyUrl: "https://www.yelp.com/developers",
  },
  {
    id: "resend", name: "Resend", logo: "✉️", tagline: "Transactional email delivery at scale",
    color: "violet", authType: "key",
    fields: [
      { key: "apiKey", label: "API Key", placeholder: "re_xxxxxxxxxxxx", secret: true },
      { key: "fromEmail", label: "From Email", placeholder: "hello@yourdomain.com" },
    ],
    enables: ["Bulk email delivery", "Transactional emails", "Custom from address"],
    getKeyUrl: "https://resend.com",
  },
]

// ── Gmail OTP connect card ────────────────────────────────────────────────────

type GmailStep = "email" | "code" | "done"

function GmailCard({ connected, onDisconnect, onConnected }: {
  connected:   ConnectedAccount | undefined
  onDisconnect: () => Promise<void>
  onConnected:  (email: string) => void
}) {
  const [step,    setStep]    = useState<GmailStep>("email")
  const [email,   setEmail]   = useState("")
  const [code,    setCode]    = useState("")
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState("")
  const [devCode, setDevCode] = useState("")

  async function sendCode() {
    if (!email || !email.includes("@")) { setError("Enter a valid email address"); return }
    setLoading(true); setError(""); setDevCode("")
    try {
      const res  = await fetch("/api/integrations/gmail/verify", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed to send code")
      if (data.devCode) setDevCode(data.devCode)
      setStep("code")
    } catch (e) { setError(e instanceof Error ? e.message : "Failed") }
    finally { setLoading(false) }
  }

  async function verifyCode() {
    if (!code || code.length !== 6) { setError("Enter the 6-digit code from your email"); return }
    setLoading(true); setError("")
    try {
      const res  = await fetch("/api/integrations/gmail/confirm", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Verification failed")
      onConnected(email)
    } catch (e) { setError(e instanceof Error ? e.message : "Failed") }
    finally { setLoading(false) }
  }

  // Connected state
  if (connected) {
    return (
      <div className="bg-emerald-950/20 border border-emerald-800/30 rounded-2xl p-5 flex items-center gap-4">
        <span className="text-3xl">📧</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-bold text-white text-sm">Gmail</span>
            <span className="text-[10px] bg-emerald-900/60 text-emerald-400 border border-emerald-800/50 rounded-full px-2 py-0.5 font-bold uppercase">
              ✓ Connected
            </span>
          </div>
          <p className="text-xs text-gray-400">{connected.accountEmail}</p>
          <p className="text-xs text-gray-600 mt-0.5">Verified — email campaigns will send from this address</p>
        </div>
        <button onClick={onDisconnect}
          className="text-xs text-red-400 hover:text-red-300 border border-red-900/50 bg-red-950/30 px-3 py-2 rounded-xl transition">
          Disconnect
        </button>
      </div>
    )
  }

  return (
    <div className="bg-red-950/20 border border-red-800/30 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-4 px-5 pt-5 pb-4">
        <span className="text-3xl">📧</span>
        <div>
          <p className="font-bold text-white text-sm">Connect Gmail</p>
          <p className="text-xs text-gray-400 mt-0.5">Enter your Gmail → get a verification code → done</p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-0 px-5 mb-5">
        {(["email", "code"] as const).map((s, i) => (
          <div key={s} className="flex items-center gap-0">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
              step === s ? "bg-red-600 text-white" :
              (step === "code" && s === "email") || step === "done" ? "bg-emerald-600 text-white" :
              "bg-gray-800 text-gray-600"
            }`}>
              {(step === "code" && s === "email") || step === "done" ? "✓" : i + 1}
            </div>
            <span className={`ml-2 text-xs ${step === s ? "text-white font-semibold" : "text-gray-600"}`}>
              {s === "email" ? "Enter email" : "Enter code"}
            </span>
            {i < 1 && <span className="mx-3 text-gray-700 text-xs">→</span>}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="px-5 pb-5 space-y-3">
        {step === "email" && (
          <>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === "Enter" && sendCode()}
              placeholder="you@gmail.com"
              autoFocus
              className="w-full px-3 py-3 bg-gray-800/80 border border-gray-700 rounded-xl text-white placeholder-gray-500 text-sm focus:outline-none focus:border-red-500 transition"
            />
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <button onClick={sendCode} disabled={loading || !email}
              className="w-full py-3 bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white font-bold text-sm rounded-xl transition flex items-center justify-center gap-2">
              {loading
                ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Sending…</>
                : "Send Verification Code →"
              }
            </button>
          </>
        )}

        {step === "code" && (
          <>
            <div className="bg-gray-800/60 border border-gray-700/50 rounded-xl px-4 py-3">
              <p className="text-sm text-gray-300">
                A 6-digit code was sent to <span className="font-semibold text-white">{email}</span>
              </p>
              {devCode && (
                <p className="text-xs text-amber-400 mt-2 bg-amber-950/30 border border-amber-800/40 rounded-lg px-2 py-1">
                  ⚠ Email not configured — your code is: <span className="font-mono font-bold">{devCode}</span>
                </p>
              )}
            </div>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, ""))}
              onKeyDown={e => e.key === "Enter" && verifyCode()}
              placeholder="000000"
              autoFocus
              className="w-full px-3 py-3 bg-gray-800/80 border border-gray-700 rounded-xl text-white placeholder-gray-500 text-center text-2xl font-mono tracking-[12px] focus:outline-none focus:border-red-500 transition"
            />
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <div className="flex gap-2">
              <button onClick={() => { setStep("email"); setCode(""); setError("") }}
                className="px-4 py-2.5 border border-gray-700 text-gray-400 hover:text-white rounded-xl text-sm transition">
                ← Back
              </button>
              <button onClick={verifyCode} disabled={loading || code.length !== 6}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white font-bold text-sm rounded-xl transition flex items-center justify-center gap-2">
                {loading
                  ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Verifying…</>
                  : "Verify & Connect →"
                }
              </button>
            </div>
            <button onClick={sendCode} disabled={loading}
              className="w-full text-xs text-gray-500 hover:text-gray-300 transition py-1">
              Didn't get it? Resend code
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Colour palettes ──────────────────────────────────────────────────────────

const CARD: Record<string, string> = {
  red:    "bg-red-950/20 border-red-800/30",
  blue:   "bg-blue-950/20 border-blue-800/30",
  indigo: "bg-indigo-950/20 border-indigo-800/30",
  cyan:   "bg-cyan-950/20 border-cyan-800/30",
  orange: "bg-orange-950/20 border-orange-800/30",
  violet: "bg-violet-950/20 border-violet-800/30",
}

const BTN: Record<string, string> = {
  red:    "bg-red-600 hover:bg-red-500",
  blue:   "bg-blue-600 hover:bg-blue-500",
  indigo: "bg-indigo-600 hover:bg-indigo-500",
  cyan:   "bg-cyan-700 hover:bg-cyan-600",
  orange: "bg-orange-600 hover:bg-orange-500",
  violet: "bg-violet-600 hover:bg-violet-500",
}

// ── Single service card ──────────────────────────────────────────────────────

function ServiceCard({
  service, connected, onSave, onSaveGmail, onDisconnect, saving,
}: {
  service:      Service
  connected:    ConnectedAccount | undefined
  onSave:       (id: string, fields: Record<string, string>) => Promise<void>
  onSaveGmail:  (email: string, pw: string) => Promise<void>
  onDisconnect: (id: string) => Promise<void>
  saving:       boolean
}) {
  const [fields, setFields] = useState<Record<string, string>>({})
  const card = CARD[service.color] ?? CARD.blue
  const btn  = BTN[service.color] ?? BTN.blue

  function setField(key: string, val: string) {
    setFields(prev => ({ ...prev, [key]: val }))
  }

  async function handleSave() {
    if (service.authType === "gmail") {
      await onSaveGmail(fields.email ?? "", fields.appPassword ?? "")
    } else {
      await onSave(service.id, fields)
    }
  }

  const canSave = service.fields
    ? Object.values(fields).some(v => v.trim().length > 0)
    : false

  if (connected) {
    return (
      <div className="bg-emerald-950/20 border border-emerald-800/30 rounded-2xl p-4 flex items-center gap-3">
        <span className="text-2xl">{service.logo}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-white text-sm">{service.name}</span>
            <span className="text-[10px] bg-emerald-900/60 text-emerald-400 border border-emerald-800/50 rounded-full px-2 py-0.5 font-bold uppercase">
              ✓ Connected
            </span>
          </div>
          {connected.accountEmail && (
            <p className="text-xs text-gray-400 mt-0.5">{connected.accountEmail}</p>
          )}
        </div>
        <button
          onClick={() => onDisconnect(service.id)}
          disabled={saving}
          className="text-xs text-red-400 hover:text-red-300 border border-red-900/50 bg-red-950/30 px-3 py-1.5 rounded-lg transition disabled:opacity-50"
        >
          Disconnect
        </button>
      </div>
    )
  }

  return (
    <div className={`border rounded-2xl p-4 ${card}`}>
      {/* Header */}
      <div className="flex items-start gap-3 mb-4">
        <span className="text-2xl mt-0.5">{service.logo}</span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-white text-sm">{service.name}</p>
          <p className="text-xs text-gray-400 mt-0.5">{service.tagline}</p>
        </div>
        {service.getKeyUrl && (
          <a
            href={service.getKeyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-gray-500 hover:text-gray-300 whitespace-nowrap border border-gray-700/50 rounded-lg px-2 py-1 transition flex-shrink-0"
          >
            Get key ↗
          </a>
        )}
      </div>

      {/* OAuth button */}
      {service.authType === "oauth" && service.oauthHref && (
        <a
          href={service.oauthHref}
          className={`flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-bold text-white transition ${btn}`}
        >
          Connect {service.name} →
        </a>
      )}

      {/* Credential fields */}
      {(service.authType === "key" || service.authType === "gmail") && service.fields && (
        <div className="space-y-3">
          {service.fields.map(f => (
            <div key={f.key}>
              <label className="block text-[11px] font-medium text-gray-400 mb-1">{f.label}</label>
              <input
                type={f.secret ? "password" : "text"}
                value={fields[f.key] ?? ""}
                onChange={e => setField(f.key, e.target.value)}
                placeholder={f.placeholder}
                autoComplete="off"
                className="w-full px-3 py-2 bg-gray-800/80 border border-gray-700/60 rounded-xl text-white placeholder-gray-600 text-sm focus:outline-none focus:border-indigo-500 transition"
              />
              {f.hint && (
                <p className="text-[10px] text-gray-600 mt-1">{f.hint}</p>
              )}
            </div>
          ))}

          <button
            onClick={handleSave}
            disabled={saving || !canSave}
            className={`w-full py-2.5 rounded-xl text-sm font-bold text-white transition disabled:opacity-40 flex items-center justify-center gap-2 mt-1 ${btn}`}
          >
            {saving ? (
              <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Connecting…</>
            ) : `Connect ${service.name} →`}
          </button>
        </div>
      )}

      {/* What it enables */}
      <div className="flex flex-wrap gap-1.5 mt-3">
        {service.enables.map(e => (
          <span key={e} className="text-[10px] text-gray-500 bg-gray-800/40 border border-gray-700/30 rounded-full px-2 py-0.5">
            {e}
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────

function IntegrationsContent() {
  const searchParams = useSearchParams()
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([])
  const [saving,   setSaving]   = useState<string | null>(null)
  const [toast,    setToast]    = useState<{ msg: string; ok: boolean } | null>(null)

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 4000)
  }

  const load = useCallback(async () => {
    const res  = await fetch("/api/integrations")
    const data = await res.json()
    if (data.accounts) setAccounts(data.accounts as ConnectedAccount[])
  }, [])

  useEffect(() => {
    load()
    const c = searchParams.get("connected")
    const e = searchParams.get("error")
    if (c) showToast(`✓ ${c.charAt(0).toUpperCase() + c.slice(1)} connected successfully`)
    if (e === "google_denied")         showToast("Google sign-in was cancelled", false)
    if (e === "token_exchange_failed") showToast("OAuth failed — check your Google Cloud credentials", false)
  }, [searchParams, load])

  const getAccount = (id: string) => accounts.find(a => a.provider === id)
  const connectedCount   = accounts.length
  const disconnectedList = SERVICES.filter(s => !getAccount(s.id))

  async function disconnect(provider: string) {
    setSaving(provider)
    await fetch(`/api/integrations?provider=${provider}`, { method: "DELETE" })
    await load()
    setSaving(null)
    showToast("Disconnected")
  }

  async function gmailConnected(email: string) {
    await load()
    showToast(`✓ Gmail connected — ${email}`)
  }

  async function disconnectGmail() {
    setSaving("gmail")
    await fetch("/api/integrations?provider=gmail", { method: "DELETE" })
    await load()
    setSaving(null)
    showToast("Gmail disconnected")
  }

  async function saveCredentials(id: string, fields: Record<string, string>) {
    const firstValue = Object.values(fields).find(v => v.trim())
    if (!firstValue) { showToast("Fill in at least one field", false); return }
    setSaving(id)
    try {
      const res = await fetch("/api/integrations", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ provider: id, accessToken: firstValue, metadata: fields }),
      })
      if (!res.ok) throw new Error(await res.text())
      await load()
      showToast(`✓ ${SERVICES.find(s => s.id === id)?.name ?? id} connected`)
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed", false)
    } finally { setSaving(null) }
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-lg">🔌</div>
          <h1 className="text-2xl font-bold">Connect Your Accounts</h1>
        </div>
        <p className="text-gray-400 text-sm">
          Connect your tools below — once connected, AutoPilot agents act on your behalf automatically.
        </p>
      </div>

      {/* Progress bar */}
      <div className="mb-8 bg-gray-900 border border-gray-800 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-white">
            {connectedCount} of {SERVICES.length} connected
          </p>
          {connectedCount === SERVICES.length && (
            <span className="text-xs bg-emerald-900/50 text-emerald-400 border border-emerald-800/50 rounded-full px-2.5 py-1 font-bold">
              🎉 All connected!
            </span>
          )}
        </div>
        <div className="w-full bg-gray-800 rounded-full h-2">
          <div
            className="bg-gradient-to-r from-indigo-500 to-emerald-500 h-2 rounded-full transition-all duration-500"
            style={{ width: `${Math.max(4, (connectedCount / SERVICES.length) * 100)}%` }}
          />
        </div>
        {disconnectedList.length > 0 && (
          <p className="text-xs text-gray-500 mt-2">
            Still to connect: {disconnectedList.map(s => s.name).join(", ")}
          </p>
        )}
      </div>

      {/* Gmail — always shown at top, full OTP flow */}
      <div className="mb-6">
        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">Start Here</p>
        <GmailCard
          connected={getAccount("gmail")}
          onDisconnect={disconnectGmail}
          onConnected={gmailConnected}
        />
      </div>

      {/* Connected — compact row (non-Gmail) */}
      {SERVICES.filter(s => s.id !== "gmail" && getAccount(s.id)).length > 0 && (
        <div className="mb-8">
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">Connected</p>
          <div className="space-y-2">
            {SERVICES.filter(s => s.id !== "gmail" && getAccount(s.id)).map(service => (
              <ServiceCard
                key={service.id}
                service={service}
                connected={getAccount(service.id)}
                onSave={saveCredentials}
                onSaveGmail={async () => {}}
                onDisconnect={disconnect}
                saving={saving === service.id}
              />
            ))}
          </div>
        </div>
      )}

      {/* Not connected */}
      {SERVICES.filter(s => s.id !== "gmail" && !getAccount(s.id)).length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">
            Connect your accounts
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            {SERVICES.filter(s => s.id !== "gmail" && !getAccount(s.id)).map(service => (
              <ServiceCard
                key={service.id}
                service={service}
                connected={undefined}
                onSave={saveCredentials}
                onSaveGmail={async () => {}}
                onDisconnect={disconnect}
                saving={saving === service.id}
              />
            ))}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-3 rounded-xl text-sm font-semibold shadow-2xl z-50 ${
          toast.ok
            ? "bg-emerald-900 border border-emerald-700 text-emerald-100"
            : "bg-red-900 border border-red-700 text-red-100"
        }`}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}

export default function IntegrationsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-gray-400 text-sm">Loading…</div>}>
      <IntegrationsContent />
    </Suspense>
  )
}
