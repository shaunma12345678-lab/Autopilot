"use client"

// 🚀 Acquisition — the section that turns found leads into contracts.
// Two tools in one place:
//   1. Acquisition Agent — a master ON/OFF switch. When ON, the daily AutoPilot
//      run enrolls the best new leads into a 7-touch outreach sequence, sends
//      intro emails automatically, and queues calls/texts/letters for you with
//      the scripts already written. Cold texts are never auto-sent (TCPA) —
//      they're one-tap sends from your phone.
//   2. Offer Engine — one-click printable Letters of Intent: single offers or
//      a batch LOI for every enrolled lead at your percentage of value.

import { useCallback, useEffect, useMemo, useState } from "react"
import { telHref, smsHref, mailtoHref, printLetter } from "@/lib/outreach-actions"
import { openOfferLetter, openOfferBatch, type OfferInput } from "@/lib/offer-letter"
import type { ForeclosureLead } from "@/lib/agents/foreclosure-agent"

interface Config { enabled: boolean; dailyLimit: number; minScore: number; fromName: string; fromPhone: string; autoEmail: boolean }
interface Touch { step: number; channel: string; at: string; status: string }
interface Enrolled { sig: string; addr: string; city: string; state: string; zip: string; owner: string; phone: string; email: string; score: number; enrolledAt: string; step: number; nextAt: string; paused: boolean; history: Touch[] }
interface ActionItem { id: string; sig: string; addr: string; owner: string; phone: string; email: string; channel: string; script: string; createdAt: string }
interface AgentState { enrolled: Record<string, Enrolled>; queue: ActionItem[]; totals: { enrolled: number; touches: number; emailsSent: number } }

const SEQUENCE_LABELS = ["Intro letter", "Intro email", "First text", "First call", "Follow-up letter", "Second call", "Final letter"]

const CHANNEL_META: Record<string, { icon: string; label: string }> = {
  letter: { icon: "📬", label: "Print & mail letter" },
  email:  { icon: "✉️", label: "Send email" },
  sms:    { icon: "💬", label: "Send text" },
  call:   { icon: "📞", label: "Make the call" },
}

export default function AcquisitionCenter({ password }: { password: string }) {
  const apiHeaders = useMemo(() => ({ "Content-Type": "application/json", "x-admin-password": password }), [password])
  const [config, setConfig] = useState<Config | null>(null)
  const [state, setState] = useState<AgentState | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [savingCfg, setSavingCfg] = useState(false)
  const [running, setRunning] = useState(false)
  const [runNote, setRunNote] = useState<string | null>(null)
  const [runArea, setRunArea] = useState({ city: "", state: "CA", zipCode: "" })
  const [openScript, setOpenScript] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/acquisition", { headers: apiHeaders })
      const data = await res.json()
      if (data.config) setConfig(data.config)
      if (data.state) setState(data.state)
      if (data.note) setNote(data.note)
    } catch { setNote("Couldn't load the agent — refresh to retry.") }
  }, [apiHeaders])

  // Deferred so the effect body itself never sets state synchronously.
  useEffect(() => {
    const t = setTimeout(() => { void load() }, 0)
    return () => clearTimeout(t)
  }, [load])

  const saveConfig = async (patch: Partial<Config>) => {
    if (!config) return
    const next = { ...config, ...patch }
    setConfig(next)
    setSavingCfg(true)
    try {
      await fetch("/api/acquisition", { method: "POST", headers: apiHeaders, body: JSON.stringify({ action: "config", config: next }) })
    } catch { setNote("Couldn't save settings — try again.") }
    setSavingCfg(false)
  }

  const runNow = async () => {
    setRunning(true); setRunNote(null)
    try {
      const area = runArea.zipCode
        ? { searchType: "zip", zipCode: runArea.zipCode, state: runArea.state }
        : runArea.city
          ? { searchType: "city", city: runArea.city, state: runArea.state }
          : undefined
      const res = await fetch("/api/acquisition", { method: "POST", headers: apiHeaders, body: JSON.stringify({ action: "run", area }) })
      const data = await res.json()
      if (data.error) { setRunNote(`⚠ ${data.error}`) }
      else {
        if (data.state) setState(data.state)
        const r = data.result ?? {}
        setRunNote(area
          ? `✓ ${data.candidates ?? 0} cached leads in that area · enrolled ${r.enrolledNew ?? 0} new · ${r.emailsSent ?? 0} emails sent · ${r.queuedActions ?? 0} actions queued`
          : `✓ Advanced due touches · ${r.emailsSent ?? 0} emails sent · ${r.queuedActions ?? 0} actions queued. (Add a city or ZIP to enroll new leads from that area's cache.)`)
      }
    } catch { setRunNote("⚠ Run failed — try again.") }
    setRunning(false)
  }

  const act = async (action: "done" | "pause" | "resume" | "remove", id: { actionId?: string; sig?: string }) => {
    try {
      const res = await fetch("/api/acquisition", { method: "POST", headers: apiHeaders, body: JSON.stringify({ action, ...id }) })
      const data = await res.json()
      if (data.state) setState(data.state)
    } catch { setNote("Action failed — refresh and retry.") }
  }

  const enrolled = useMemo(() => Object.values(state?.enrolled ?? {}).sort((a, b) => b.enrolledAt.localeCompare(a.enrolledAt)), [state])
  const queue = state?.queue ?? []

  // ── Offer Engine state ──────────────────────────────────────────────────────
  const [offer, setOffer] = useState({ ownerName: "", address: "", city: "", state: "CA", zip: "", offerPrice: "", emd: "2500", closeDays: "14", inspectionDays: "7", expireDays: "7", buyerEmail: "" })
  const [offerNote, setOfferNote] = useState<string | null>(null)
  const setO = (k: keyof typeof offer) => (e: React.ChangeEvent<HTMLInputElement>) => setOffer((f) => ({ ...f, [k]: e.target.value }))
  const num = (s: string) => parseInt(s.replace(/[^0-9]/g, ""), 10) || 0

  const baseOffer = (over: Partial<OfferInput>): OfferInput => ({
    ownerName: "", address: "", city: "", state: "CA", zip: "",
    offerPrice: 0,
    buyerName: config?.fromName ?? "",
    buyerPhone: config?.fromPhone ?? "",
    buyerEmail: offer.buyerEmail,
    emd: num(offer.emd) || 2500,
    closeDays: num(offer.closeDays) || 14,
    inspectionDays: num(offer.inspectionDays) || 7,
    expireDays: num(offer.expireDays) || 7,
    ...over,
  })

  const generateSingle = () => {
    if (!offer.address.trim() || !num(offer.offerPrice)) { setOfferNote("Enter at least the property address and an offer price."); return }
    setOfferNote(null)
    const ok = openOfferLetter(baseOffer({
      ownerName: offer.ownerName, address: offer.address, city: offer.city, state: offer.state, zip: offer.zip,
      offerPrice: num(offer.offerPrice),
    }))
    if (!ok) setOfferNote("Popup blocked — allow popups for this site to open the offer.")
  }

  const generateBatch = () => {
    const targets = enrolled.filter((l) => l.addr)
    if (targets.length === 0) { setOfferNote("No enrolled leads yet — turn the agent on or run it once, then batch offers."); return }
    setOfferNote(null)
    // Enrolled leads don't carry a valuation, so batch LOIs print a fill-in
    // price line — write the number in by hand, or use the single-offer form
    // (with the MAO from the lead's Deal tab) for exact printed prices.
    const offers = targets.slice(0, 25).map((l) => baseOffer({
      ownerName: l.owner, address: l.addr.split(",")[0] ?? l.addr, city: l.city, state: l.state, zip: l.zip,
      offerPrice: 0,
    }))
    const ok = openOfferBatch(offers)
    setOfferNote(ok ? `Generated ${offers.length} LOIs with a fill-in price line — write each number in before mailing.` : "Popup blocked — allow popups for this site to open the batch.")
  }

  const asLetterLead = (l: Enrolled): ForeclosureLead =>
    ({ address: l.addr.split(",")[0] ?? l.addr, city: l.city, state: l.state, zip: l.zip, ownerName: l.owner } as unknown as ForeclosureLead)

  // Same intro letter the agent drafts, built client-side for one-off prints.
  const introLetterBody = (l: Enrolled): string => {
    const name = (l.owner || "").trim().split(/\s+/)[0] || "there"
    const from = config?.fromName || "[Your Name]"
    const phone = config?.fromPhone || "[Your Phone]"
    const street = l.addr.split(",")[0] ?? l.addr
    return `Hi ${name},\n\nMy name is ${from}, a local buyer here in ${l.city || "the area"}. I'm reaching out about your property at ${street}.\n\nI buy houses as-is for cash — no repairs, no cleaning, no agent fees, and we close on your timeline. If selling has crossed your mind, I'd love to make you a fair, no-obligation offer.\n\nCall or text me anytime at ${phone}. Even if you're just weighing options, I'm happy to share what your home could sell for.`
  }

  if (!config) {
    return <div className="text-sm text-gray-500 py-10 text-center">{note ?? "Loading the acquisition agent…"}</div>
  }

  return (
    <div className="space-y-6">
      {/* ── Acquisition Agent ─────────────────────────────────────────────── */}
      <div className={`rounded-2xl border p-5 ${config.enabled ? "bg-gradient-to-b from-emerald-950/40 to-gray-900/60 border-emerald-500/40" : "bg-gray-900/60 border-gray-800"}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-white">🤖 Acquisition Agent {config.enabled ? <span className="text-xs align-middle bg-emerald-600 text-white px-2 py-0.5 rounded-full ml-1">ON — working daily</span> : <span className="text-xs align-middle bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full ml-1">OFF</span>}</h3>
            <p className="text-sm text-gray-400 mt-1 max-w-2xl">When ON, every daily AutoPilot run enrolls your best new leads into a 7-touch sequence ({SEQUENCE_LABELS.join(" → ")}), auto-sends the emails, and queues everything else below with the script written. Your Real Estate searches stay exactly as they are — this works on top of them.</p>
          </div>
          <button onClick={() => saveConfig({ enabled: !config.enabled })} disabled={savingCfg}
            className={`shrink-0 px-6 py-3 rounded-xl font-bold text-sm transition-colors disabled:opacity-50 ${config.enabled ? "bg-emerald-600 hover:bg-emerald-500 text-white" : "bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700"}`}>
            {config.enabled ? "⏻ Turn OFF" : "⏻ Turn ON"}
          </button>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 mt-4">
          <label className="block"><span className="text-[11px] text-gray-500">Your name (signs everything)</span>
            <input value={config.fromName} onChange={(e) => setConfig({ ...config, fromName: e.target.value })} onBlur={() => saveConfig({ fromName: config.fromName })} placeholder="e.g. Shaun M."
              className="mt-1 w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500" /></label>
          <label className="block"><span className="text-[11px] text-gray-500">Your phone (in every message)</span>
            <input value={config.fromPhone} onChange={(e) => setConfig({ ...config, fromPhone: e.target.value })} onBlur={() => saveConfig({ fromPhone: config.fromPhone })} placeholder="(555) 123-4567"
              className="mt-1 w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500" /></label>
          <label className="block"><span className="text-[11px] text-gray-500">New leads enrolled / day</span>
            <input value={String(config.dailyLimit)} onChange={(e) => setConfig({ ...config, dailyLimit: parseInt(e.target.value.replace(/\D/g, ""), 10) || 1 })} onBlur={() => saveConfig({ dailyLimit: config.dailyLimit })} inputMode="numeric"
              className="mt-1 w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500" /></label>
          <label className="block"><span className="text-[11px] text-gray-500">Min score to enroll</span>
            <input value={String(config.minScore)} onChange={(e) => setConfig({ ...config, minScore: parseInt(e.target.value.replace(/\D/g, ""), 10) || 0 })} onBlur={() => saveConfig({ minScore: config.minScore })} inputMode="numeric"
              className="mt-1 w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500" /></label>
          <label className="flex items-end gap-2 pb-2 cursor-pointer select-none"><input type="checkbox" checked={config.autoEmail} onChange={(e) => saveConfig({ autoEmail: e.target.checked })} className="accent-emerald-500" />
            <span className="text-[11px] text-gray-400">Auto-send intro emails (needs RESEND_API_KEY)</span></label>
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-4">
          <input value={runArea.city} onChange={(e) => setRunArea((a) => ({ ...a, city: e.target.value }))} placeholder="City (optional)" className="bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500 w-36" />
          <input value={runArea.zipCode} onChange={(e) => setRunArea((a) => ({ ...a, zipCode: e.target.value }))} placeholder="or ZIP" inputMode="numeric" className="bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500 w-24" />
          <input value={runArea.state} onChange={(e) => setRunArea((a) => ({ ...a, state: e.target.value.toUpperCase().slice(0, 2) }))} placeholder="ST" className="bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500 w-14" />
          <button onClick={runNow} disabled={running} className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold px-4 py-2 rounded-lg">{running ? "Running…" : "⚡ Run the agent now"}</button>
          {state && <span className="text-[11px] text-gray-500">All-time: {state.totals.enrolled} enrolled · {state.totals.touches} touches · {state.totals.emailsSent} emails sent</span>}
        </div>
        {runNote && <p className="text-xs text-emerald-200 mt-2">{runNote}</p>}
        <p className="text-[10px] text-gray-600 mt-3">Compliance by design: cold texts and calls are never fired automatically — they appear below as one-tap actions you send yourself. Check numbers against the federal DNC registry before calling, keep calls/texts to 8am–9pm local time, and honor every stop request.</p>
      </div>

      {/* ── Action queue ──────────────────────────────────────────────────── */}
      <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-5">
        <h4 className="font-bold text-white">📋 Today&apos;s action queue {queue.length ? <span className="text-xs bg-amber-600 text-white px-2 py-0.5 rounded-full ml-1 align-middle">{queue.length}</span> : null}</h4>
        <p className="text-xs text-gray-500 mt-0.5">Everything the agent prepared that needs your finger on the button. Scripts are pre-written — tap, send, mark done.</p>
        {queue.length === 0 && <p className="text-sm text-gray-600 mt-3">Queue is clear. {config.enabled ? "The agent adds actions as sequence touches come due." : "Turn the agent ON (or run it once) to fill this."}</p>}
        <div className="space-y-2 mt-3">
          {queue.map((q) => {
            const meta = CHANNEL_META[q.channel] ?? { icon: "•", label: q.channel }
            return (
              <div key={q.id} className="bg-gray-950/60 border border-gray-800 rounded-xl p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-white font-semibold">{meta.icon} {meta.label} — <span className="text-gray-300">{q.addr}</span>{q.owner ? <span className="text-gray-500"> · {q.owner}</span> : null}</p>
                  <div className="flex gap-1.5">
                    {q.channel === "call" && q.phone && <a href={telHref(q.phone)} className="bg-emerald-700/60 hover:bg-emerald-600 text-white text-[11px] font-semibold px-2.5 py-1.5 rounded-lg">📞 Call {q.phone}</a>}
                    {q.channel === "sms" && q.phone && <a href={smsHref(q.phone, q.script)} className="bg-sky-700/60 hover:bg-sky-600 text-white text-[11px] font-semibold px-2.5 py-1.5 rounded-lg">💬 Send text</a>}
                    {q.channel === "email" && q.email && <a href={mailtoHref(q.email, `About your property at ${q.addr}`, q.script)} className="bg-violet-700/60 hover:bg-violet-600 text-white text-[11px] font-semibold px-2.5 py-1.5 rounded-lg">✉️ Send email</a>}
                    {q.channel === "letter" && <button onClick={() => printLetter(({ address: q.addr.split(",")[0] ?? q.addr, city: "", state: "", zip: "", ownerName: q.owner } as unknown as ForeclosureLead), q.script, config.fromName, config.fromPhone)} className="bg-amber-700/60 hover:bg-amber-600 text-white text-[11px] font-semibold px-2.5 py-1.5 rounded-lg">🖨 Print letter</button>}
                    {(q.channel === "sms" || q.channel === "call") && !q.phone && <span className="text-[11px] text-gray-500 self-center">No phone yet — skip-trace this lead in Real Estate</span>}
                    <button onClick={() => setOpenScript(openScript === q.id ? null : q.id)} className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg">{openScript === q.id ? "Hide" : "📝 Script"}</button>
                    <button onClick={() => act("done", { actionId: q.id })} className="bg-gray-800 hover:bg-emerald-700 border border-gray-700 text-gray-300 hover:text-white text-[11px] font-semibold px-2.5 py-1.5 rounded-lg">✓ Done</button>
                  </div>
                </div>
                {openScript === q.id && <pre className="mt-2 text-[11px] text-gray-300 whitespace-pre-wrap bg-gray-900/70 border border-gray-800 rounded-lg p-3 font-sans">{q.script}</pre>}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Enrolled leads ────────────────────────────────────────────────── */}
      <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-5">
        <h4 className="font-bold text-white">🎯 In the sequence {enrolled.length ? <span className="text-xs text-gray-500 font-normal">· {enrolled.length} leads</span> : null}</h4>
        {enrolled.length === 0 && <p className="text-sm text-gray-600 mt-3">Nobody enrolled yet. Turn the agent ON and it starts with tomorrow&apos;s AutoPilot run — or enter a city/ZIP you&apos;ve searched and hit ⚡ Run now.</p>}
        <div className="space-y-1.5 mt-3">
          {enrolled.slice(0, 40).map((l) => (
            <div key={l.sig} className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 ${l.paused ? "bg-gray-950/40 border-gray-800 opacity-60" : "bg-gray-950/60 border-gray-800"}`}>
              <div className="min-w-0">
                <p className="text-xs text-white font-semibold truncate">{l.addr}{l.city ? `, ${l.city}` : ""} <span className="text-gray-600">· score {l.score}</span></p>
                <p className="text-[10px] text-gray-500">{l.owner || "Owner unknown"} · step {Math.min(l.step + 1, SEQUENCE_LABELS.length)}/{SEQUENCE_LABELS.length}{l.step < SEQUENCE_LABELS.length ? ` — next: ${SEQUENCE_LABELS[l.step]}` : " — sequence complete"} · {l.history.length} touches</p>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <button onClick={() => printLetter(asLetterLead(l), introLetterBody(l), config.fromName, config.fromPhone)} className="text-[10px] text-amber-300 hover:text-amber-200 font-semibold">🖨 Letter</button>
                <button onClick={() => act(l.paused ? "resume" : "pause", { sig: l.sig })} className="text-[10px] text-gray-400 hover:text-white font-semibold">{l.paused ? "▶ Resume" : "⏸ Pause"}</button>
                <button onClick={() => act("remove", { sig: l.sig })} className="text-[10px] text-rose-400 hover:text-rose-300 font-semibold">✕ Remove</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Offer Engine ──────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-b from-indigo-950/40 to-gray-900/60 border border-indigo-500/30 rounded-2xl p-5">
        <h4 className="font-bold text-white">✍️ Offer Engine — put a real number in writing</h4>
        <p className="text-xs text-gray-500 mt-0.5">Generates a clean, print-ready Letter of Intent (cash, as-is, your timeline). Non-binding by design — the binding contract stays with your state form + escrow. Sellers respond to written numbers.</p>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
          <input value={offer.ownerName} onChange={setO("ownerName")} placeholder="Owner name" className="bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500" />
          <input value={offer.address} onChange={setO("address")} placeholder="Property address *" className="bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500" />
          <input value={offer.city} onChange={setO("city")} placeholder="City" className="bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500" />
          <div className="grid grid-cols-2 gap-3">
            <input value={offer.state} onChange={setO("state")} placeholder="ST" maxLength={2} className="bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500" />
            <input value={offer.zip} onChange={setO("zip")} placeholder="ZIP" inputMode="numeric" className="bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500" />
          </div>
          <input value={offer.offerPrice} onChange={setO("offerPrice")} placeholder="Offer price * e.g. 285000" inputMode="numeric" className="bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500" />
          <input value={offer.emd} onChange={setO("emd")} placeholder="Earnest money" inputMode="numeric" className="bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500" />
          <div className="grid grid-cols-3 gap-2">
            <input value={offer.closeDays} onChange={setO("closeDays")} placeholder="Close (days)" inputMode="numeric" title="Days to close" className="bg-gray-950 border border-gray-700 rounded-lg px-2 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500" />
            <input value={offer.inspectionDays} onChange={setO("inspectionDays")} placeholder="Insp." inputMode="numeric" title="Inspection days" className="bg-gray-950 border border-gray-700 rounded-lg px-2 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500" />
            <input value={offer.expireDays} onChange={setO("expireDays")} placeholder="Valid" inputMode="numeric" title="Offer valid (days)" className="bg-gray-950 border border-gray-700 rounded-lg px-2 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500" />
          </div>
          <input value={offer.buyerEmail} onChange={setO("buyerEmail")} placeholder="Your email (on the letter)" inputMode="email" className="bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500" />
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-4">
          <button onClick={generateSingle} className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-4 py-2 rounded-lg">📄 Generate offer letter</button>
          <span className="text-gray-700 text-xs">|</span>
          <button onClick={generateBatch} className="bg-indigo-700/60 hover:bg-indigo-600 border border-indigo-500/50 text-white text-xs font-bold px-4 py-2 rounded-lg">🗂 Batch LOIs for all enrolled ({Math.min(enrolled.length, 25)})</button>
        </div>
        {offerNote && <p className="text-xs text-amber-300 mt-2">{offerNote}</p>}
        <p className="text-[10px] text-gray-600 mt-3">Tip: get the exact number from Real Estate → any lead → Deal tab (MAO), or 📥 Inbound Sellers → 🔎 Run the numbers. Have your purchase agreement reviewed by a local attorney once — then reuse it on every accepted LOI.</p>
      </div>

      {note && <p className="text-xs text-amber-300">{note}</p>}
    </div>
  )
}
