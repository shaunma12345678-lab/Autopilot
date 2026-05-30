"use client"
import { useState } from "react"
import { ConnectBanner, useConnection } from "@/components/ConnectBanner"

type Tab = "write" | "send"

export default function SmsPage() {
  const [tab, setTab] = useState<Tab>("write")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<unknown>(null)
  const [error, setError] = useState("")

  const twilio = useConnection("twilio")

  const [genForm, setGenForm] = useState({ businessDescription: "", campaignGoal: "", offer: "", tone: "friendly" })
  const [sendForm, setSendForm] = useState({ accountSid: "", authToken: "", fromNumber: "", toNumbers: "", message: "" })

  async function generate() {
    setLoading(true); setError(""); setResult(null)
    try {
      const res = await fetch("/api/agents/sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate", ...genForm }),
      })
      if (!res.ok) throw new Error(await res.text())
      setResult(await res.json())
    } catch (e) { setError(e instanceof Error ? e.message : "Failed") }
    finally { setLoading(false) }
  }

  async function send() {
    const toNumbersArr = sendForm.toNumbers.split(/[\n,]+/).map(n => n.trim()).filter(Boolean)
    if (toNumbersArr.length === 0) { setError("Enter at least one phone number"); return }
    if (!sendForm.accountSid || !sendForm.authToken || !sendForm.fromNumber) { setError("Enter all Twilio credentials"); return }
    if (!sendForm.message) { setError("Enter a message to send"); return }

    setLoading(true); setError(""); setResult(null)
    try {
      const action = toNumbersArr.length === 1 ? "send-single" : "send-bulk"
      const body =
        action === "send-single"
          ? { action, accountSid: sendForm.accountSid, authToken: sendForm.authToken, fromNumber: sendForm.fromNumber, toNumber: toNumbersArr[0], message: sendForm.message }
          : { action, accountSid: sendForm.accountSid, authToken: sendForm.authToken, fromNumber: sendForm.fromNumber, toNumbers: toNumbersArr, message: sendForm.message }

      const res = await fetch("/api/agents/sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
      setResult(await res.json())
    } catch (e) { setError(e instanceof Error ? e.message : "Failed") }
    finally { setLoading(false) }
  }

  const inputCls = "w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-600 text-sm focus:outline-none focus:border-green-500"
  const selectCls = "w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-green-500"
  const labelCls = "block text-xs font-medium text-gray-400 mb-1.5"

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-green-500/20 border border-green-500/30 flex items-center justify-center text-lg">💬</div>
          <h1 className="text-2xl font-bold">SMS Campaign Agent</h1>
        </div>
        <p className="text-gray-400">Write high-converting SMS campaigns and send them directly to your customers via Twilio.</p>
      </div>

      <ConnectBanner
        provider="twilio"
        detail="Connect once — AutoPilot will send SMS campaigns using your Twilio number automatically."
      />

      {twilio.connected && (
        <div className="mb-4 text-xs text-amber-400 bg-amber-950/30 border border-amber-800/40 rounded-lg px-3 py-2">
          ⚠ Only send to contacts who have opted in to receive SMS from your business.
        </div>
      )}

      <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit mb-6">
        {([["write", "Write Campaign"], ["send", "Send SMS"]] as const).map(([id, label]) => (
          <button key={id} onClick={() => { setTab(id); setResult(null) }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === id ? "bg-green-600 text-white" : "text-gray-400 hover:text-white"}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
          {tab === "write" ? (
            <>
              <p className="text-sm text-gray-400">Describe your business and goal to get a set of tested SMS messages.</p>
              <div>
                <label className={labelCls}>Business description</label>
                <input value={genForm.businessDescription} onChange={e => setGenForm(f => ({ ...f, businessDescription: e.target.value }))}
                  placeholder="e.g. Denver roofing company, residential & commercial" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Campaign goal</label>
                <input value={genForm.campaignGoal} onChange={e => setGenForm(f => ({ ...f, campaignGoal: e.target.value }))}
                  placeholder="e.g. Book free inspections, re-engage old leads" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Offer or hook (optional)</label>
                <input value={genForm.offer} onChange={e => setGenForm(f => ({ ...f, offer: e.target.value }))}
                  placeholder="e.g. Free estimate, 10% off, limited slots" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Tone</label>
                <select value={genForm.tone} onChange={e => setGenForm(f => ({ ...f, tone: e.target.value }))} className={selectCls}>
                  <option value="friendly">Friendly & conversational</option>
                  <option value="urgent">Urgent / time-limited</option>
                  <option value="professional">Professional</option>
                  <option value="casual">Casual & short</option>
                </select>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-400">Send a message to one or multiple phone numbers using your Twilio account.</p>

              {/* Only show credential fields when Twilio is NOT connected */}
              {!twilio.connected && (
                <>
                  <div>
                    <label className={labelCls}>Twilio Account SID</label>
                    <input value={sendForm.accountSid} onChange={e => setSendForm(f => ({ ...f, accountSid: e.target.value }))}
                      placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Twilio Auth Token</label>
                    <input type="password" value={sendForm.authToken} onChange={e => setSendForm(f => ({ ...f, authToken: e.target.value }))}
                      placeholder="Your auth token" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>From number (Twilio number)</label>
                    <input value={sendForm.fromNumber} onChange={e => setSendForm(f => ({ ...f, fromNumber: e.target.value }))}
                      placeholder="+1XXXXXXXXXX" className={inputCls} />
                  </div>
                </>
              )}
              {twilio.connected && (
                <div className="text-xs text-emerald-400 bg-emerald-950/20 border border-emerald-800/30 rounded-lg px-3 py-2">
                  ✓ Using your connected Twilio account
                </div>
              )}
              <div>
                <label className={labelCls}>To numbers (one per line or comma-separated)</label>
                <textarea value={sendForm.toNumbers} onChange={e => setSendForm(f => ({ ...f, toNumbers: e.target.value }))}
                  placeholder="+13035551234&#10;+17205559876" rows={3}
                  className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-600 text-sm focus:outline-none focus:border-green-500 resize-none" />
              </div>
              <div>
                <label className={labelCls}>Message</label>
                <textarea value={sendForm.message} onChange={e => setSendForm(f => ({ ...f, message: e.target.value }))}
                  placeholder="Hi [Name], it's AutoPilot Roofing. We have 2 spots left this week for free inspections. Reply YES to claim yours." rows={4}
                  className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-600 text-sm focus:outline-none focus:border-green-500 resize-none" />
                <p className="text-xs text-gray-600 mt-1">{sendForm.message.length}/160 characters</p>
              </div>
            </>
          )}

          {error ? <p className="text-red-400 text-sm">{error}</p> : null}
          <button onClick={tab === "write" ? generate : send} disabled={loading}
            className="w-full py-3 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-semibold rounded-xl transition">
            {loading ? (tab === "write" ? "Writing…" : "Sending…") : (tab === "write" ? "Write Campaign Messages" : "Send SMS")}
          </button>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 overflow-auto max-h-[650px]">
          {!result && !loading ? (
            <div className="h-full flex items-center justify-center">
              <p className="text-gray-600 text-sm text-center">{tab === "write" ? "Your SMS campaign messages will appear here." : "Send status will appear here."}</p>
            </div>
          ) : null}
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-gray-400 text-sm">{tab === "write" ? "Crafting your SMS campaign…" : "Sending messages…"}</p>
              </div>
            </div>
          ) : null}
          {result ? <SmsResult data={result} tab={tab} /> : null}
        </div>
      </div>
    </div>
  )
}

function SmsResult({ data, tab }: { data: unknown; tab: string }) {
  const d = data as Record<string, unknown>

  if (tab === "send") {
    const results = Array.isArray(d.results) ? (d.results as Array<Record<string, unknown>>) : []
    const sent = typeof d.sent === "number" ? d.sent : results.filter(r => r.success).length
    const failed = typeof d.failed === "number" ? d.failed : results.filter(r => !r.success).length
    return (
      <div className="space-y-4">
        <div className={`border rounded-lg p-4 ${failed === 0 ? "border-emerald-800/40 bg-emerald-950/20" : "border-amber-800/40 bg-amber-950/20"}`}>
          <p className={`text-sm font-bold ${failed === 0 ? "text-emerald-400" : "text-amber-400"}`}>
            {sent} sent{failed > 0 ? `, ${failed} failed` : " — all delivered"}
          </p>
        </div>
        {results.length > 0 ? (
          <div className="space-y-2">
            {results.map((r, i) => (
              <div key={i} className={`border rounded-lg p-3 ${r.success ? "border-gray-700" : "border-red-800/40"}`}>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-300">{String(r.to ?? r.number ?? "")}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${r.success ? "bg-emerald-900/50 text-emerald-400" : "bg-red-900/50 text-red-400"}`}>
                    {r.success ? "Sent" : "Failed"}
                  </span>
                </div>
                {r.error ? <p className="text-xs text-red-400 mt-0.5">{String(r.error)}</p> : null}
                {r.sid ? <p className="text-xs text-gray-600 mt-0.5">SID: {String(r.sid)}</p> : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    )
  }

  const messages = Array.isArray(d.messages) ? (d.messages as Array<Record<string, unknown>>) : []
  return (
    <div className="space-y-4">
      {d.campaignName ? <p className="text-sm font-bold text-white">{String(d.campaignName)}</p> : null}
      {d.strategy ? <p className="text-xs text-gray-400">{String(d.strategy)}</p> : null}
      {messages.length > 0 ? (
        <div className="space-y-3">
          {messages.map((msg, i) => (
            <div key={i} className="border border-gray-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-green-400">{String(msg.label ?? msg.type ?? `Message ${i + 1}`)}</p>
                <p className="text-xs text-gray-500">{String(msg.text ?? "").length}/160</p>
              </div>
              <p className="text-sm text-white bg-gray-800 rounded-lg p-3">{String(msg.text ?? "")}</p>
              {msg.bestTime ? <p className="text-xs text-gray-500 mt-1.5">Best time to send: {String(msg.bestTime)}</p> : null}
              {msg.expectedResponse ? <p className="text-xs text-gray-500">Expected response: {String(msg.expectedResponse)}</p> : null}
              <button onClick={() => navigator.clipboard.writeText(String(msg.text ?? ""))}
                className="mt-2 text-xs text-gray-500 hover:text-white border border-gray-700 rounded px-2 py-1">Copy</button>
            </div>
          ))}
        </div>
      ) : null}
      {d.complianceTips ? (
        <div className="border border-amber-800/30 bg-amber-950/10 rounded-lg p-3">
          <p className="text-xs font-bold text-amber-400 mb-1">Compliance Tips</p>
          <p className="text-xs text-gray-400">{String(d.complianceTips)}</p>
        </div>
      ) : null}
    </div>
  )
}
