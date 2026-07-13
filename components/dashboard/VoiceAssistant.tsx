"use client"

// Voice Assistant — a real conversation that DOES things. Speak or type; when
// you ask it to find deals ("vacant houses in Riverside", then "now just the
// probate ones") it runs the actual deep search and shows the deals inline,
// remembering the thread so every follow-up builds on the last one. Set a
// saved focus ("I wholesale sub-$300k SFRs in the Inland Empire") and every
// answer respects it. Conversation mode keeps the mic open hands-free.
// Browser speech APIs (keyless) + the Groq voice endpoint; degrades gracefully.

import { useEffect, useRef, useState } from "react"
import type { ForeclosureLead } from "@/lib/agents/foreclosure-agent"
import { openDealSheet } from "@/lib/deal-sheet"

interface SpeechRecognitionLike {
  lang: string; interimResults: boolean; continuous: boolean
  start(): void; stop(): void
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
}
type SRCtor = new () => SpeechRecognitionLike
function getSR(): SRCtor | null {
  if (typeof window === "undefined") return null
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

interface Turn { you: string; ai: string; detail: string; results?: ForeclosureLead[]; area?: string; grounded?: { kind: string; label: string } | null }
interface SearchAction { searchType: "city" | "zip" | "county"; city?: string; state?: string; zip?: string; county?: string; leadType?: string; maxLeads?: number }

const CUSTOM_KEY = "ap_voice_custom_v1"
const money = (n: number | null | undefined) => (n ? `$${Math.round(n / 1000)}k` : "—")

export default function VoiceAssistant({ password }: { password: string }) {
  const [listening, setListening] = useState(false)
  const [thinking, setThinking] = useState(false)
  const [searching, setSearching] = useState<string | null>(null)
  const [typed, setTyped] = useState("")
  const [turns, setTurns] = useState<Turn[]>([])
  const [note, setNote] = useState<string | null>(null)
  const [muted, setMuted] = useState(false)
  const [convo, setConvo] = useState(false)          // hands-free back-and-forth
  // Lazy init reads the saved focus without a set-state-in-effect.
  const [custom, setCustom] = useState(() => {
    if (typeof window === "undefined") return ""
    try { return window.localStorage.getItem(CUSTOM_KEY) ?? "" } catch { return "" }
  })
  const [showCustom, setShowCustom] = useState(false)
  const recRef = useRef<SpeechRecognitionLike | null>(null)
  const convoRef = useRef(false)
  const supported = getSR() !== null

  useEffect(() => { convoRef.current = convo }, [convo])

  const saveCustom = (v: string) => {
    setCustom(v)
    try { window.localStorage.setItem(CUSTOM_KEY, v) } catch { /* quota */ }
  }

  const startListening = () => {
    const SR = getSR()
    if (!SR) { setNote("Voice isn't supported in this browser — type your question below instead."); return }
    setNote(null)
    const rec = new SR()
    rec.lang = "en-US"; rec.interimResults = false; rec.continuous = false
    rec.onresult = (e) => { const t = e.results?.[0]?.[0]?.transcript ?? ""; if (t) void ask(t) }
    rec.onerror = () => setListening(false)
    rec.onend = () => setListening(false)
    recRef.current = rec
    try { rec.start(); setListening(true) } catch { setListening(false) }
  }
  const stopListening = () => { try { recRef.current?.stop() } catch { /* ignore */ } setListening(false) }

  // Speak, then (in conversation mode) reopen the mic when the sentence ends.
  const speak = (text: string) => {
    if (muted || typeof window === "undefined" || !window.speechSynthesis) {
      if (convoRef.current) startListening()
      return
    }
    try {
      window.speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(text)
      u.rate = 1.02
      u.onend = () => { if (convoRef.current) startListening() }
      window.speechSynthesis.speak(u)
    } catch { if (convoRef.current) startListening() }
  }

  const runSearch = async (s: SearchAction): Promise<{ leads: ForeclosureLead[]; area: string } | null> => {
    const area = s.searchType === "zip" ? `ZIP ${s.zip}` : s.searchType === "county" ? `${s.county} County, ${s.state ?? ""}` : `${s.city}, ${s.state ?? ""}`
    setSearching(area.trim())
    try {
      const res = await fetch("/api/leads/deep-search", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify({
          searchType: s.searchType, city: s.city, state: s.state, zipCode: s.zip, county: s.county,
          maxLeads: s.maxLeads ?? 100, leadType: s.leadType, businessId: "voice",
        }),
      })
      const data = await res.json()
      const leads: ForeclosureLead[] = Array.isArray(data.leads) ? data.leads : []
      return { leads, area: area.trim() }
    } catch { return null } finally { setSearching(null) }
  }

  const summarize = (leads: ForeclosureLead[], area: string, leadType?: string): string => {
    if (!leads.length) return `No ${leadType ?? ""} deals surfaced in ${area} right now — try the county view or a deeper search in the Real Estate tab.`
    const hot = leads.filter((l) => l.priority === "HOT").length
    const top = leads[0]
    const topBit = top ? ` Top deal: ${top.address}${top.city ? `, ${top.city}` : ""}, score ${top.score ?? 0}${top.estimatedValue ? `, about ${money(top.estimatedValue)}` : ""}.` : ""
    return `Found ${leads.length}${leadType ? ` ${leadType}` : ""} deals in ${area} — ${hot} hot.${topBit} They're listed below; ask me to refine them.`
  }

  const ask = async (question: string) => {
    const q = question.trim()
    if (!q || thinking) return
    setThinking(true)
    setNote(null)
    try {
      const lastWithResults = [...turns].reverse().find((t) => t.results)
      const res = await fetch("/api/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify({
          transcript: q,
          custom,
          history: turns.slice(-8).map((t) => ({ you: t.you, ai: t.ai })),
          lastSearch: lastWithResults ? { area: lastWithResults.area, count: lastWithResults.results?.length ?? 0 } : undefined,
        }),
      })
      const data = await res.json()
      const ai = data.answer || "Sorry, I didn't get that."
      const detail = typeof data.detail === "string" && data.detail.trim() ? data.detail.trim() : ai
      const search: SearchAction | undefined = data.action?.search

      if (search) {
        // Speak the acknowledgement, run the REAL search, then report results.
        speakOnce(ai)
        setTurns((p) => [{ you: q, ai, detail }, ...p])
        const r = await runSearch(search)
        const summary = r ? summarize(r.leads, r.area, search.leadType) : "The search failed — try again in a moment."
        setTurns((p) => [{ you: "(search)", ai: summary, detail: summary, results: r?.leads.slice(0, 10) ?? [], area: r?.area }, ...p])
        speak(summary)
      } else {
        setTurns((p) => [{ you: q, ai, detail, grounded: data.grounded ?? null }, ...p])
        speak(ai)
      }
    } catch { setNote("Couldn't reach the assistant — try again.") }
    setThinking(false)
  }

  // Speak without triggering the conversation-mode mic (a follow-up is coming).
  const speakOnce = (text: string) => {
    if (muted || typeof window === "undefined" || !window.speechSynthesis) return
    try { window.speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.rate = 1.02; window.speechSynthesis.speak(u) } catch { /* ignore */ }
  }

  const submitTyped = () => { const q = typed; setTyped(""); void ask(q) }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-bold text-white">🎙 Assistant</h3>
        <p className="text-sm text-gray-400 mt-0.5">Talk to it like a partner — <i>&quot;find vacant houses in Riverside&quot;</i>, then <i>&quot;now just the ones with high equity&quot;</i>. It runs the real searches, shows the deals, and remembers the thread.</p>
      </div>

      <div className="bg-gradient-to-b from-violet-950/40 to-gray-900/60 border border-violet-500/30 rounded-2xl p-6 flex flex-col items-center gap-3">
        <button onClick={listening ? stopListening : startListening} disabled={thinking || !supported}
          className={`w-20 h-20 rounded-full flex items-center justify-center text-3xl transition-all disabled:opacity-50 ${listening ? "bg-red-600 animate-pulse" : "bg-violet-600 hover:bg-violet-500"}`}>
          🎙
        </button>
        <p className="text-sm font-semibold text-white">
          {listening ? "Listening… tap to stop" : searching ? `Searching ${searching}…` : thinking ? "Thinking…" : supported ? "Tap to speak — or type below" : "Voice not supported here — type below"}
        </p>

        <div className="w-full flex gap-2">
          <input value={typed} onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submitTyped() }}
            placeholder="Type anything — questions or “find me deals in …”" disabled={thinking}
            className="flex-1 bg-gray-950/70 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-violet-500 disabled:opacity-50" />
          <button onClick={submitTyped} disabled={thinking || !typed.trim()}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-50">
            {thinking ? "…" : "Ask"}
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-4">
          <label className="flex items-center gap-1.5 text-[11px] text-gray-400 cursor-pointer select-none" title="After each answer the mic reopens so you can keep talking hands-free">
            <input type="checkbox" checked={convo} onChange={(e) => setConvo(e.target.checked)} className="accent-violet-500" />
            🔁 Conversation mode (hands-free)
          </label>
          <label className="flex items-center gap-1.5 text-[11px] text-gray-500 cursor-pointer select-none">
            <input type="checkbox" checked={muted} onChange={(e) => setMuted(e.target.checked)} className="accent-violet-500" />
            Mute spoken replies
          </label>
          <button onClick={() => setShowCustom((v) => !v)} className="text-[11px] text-violet-300 hover:text-violet-200 font-semibold">🎯 {custom ? "Edit" : "Set"} your assistant&apos;s focus</button>
        </div>

        {showCustom && (
          <div className="w-full">
            <textarea value={custom} onChange={(e) => saveCustom(e.target.value)} rows={2}
              placeholder="Tell it what you're about — e.g. “I wholesale single-family homes under $300k in the Inland Empire; I care about equity and vacant properties.” Every answer and search respects this."
              className="w-full bg-gray-950/70 border border-violet-500/30 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-violet-500" />
            <p className="text-[10px] text-gray-600 mt-1">Saved automatically on this device — sent with every question so the assistant always knows your buy-box.</p>
          </div>
        )}
        {note && <p className="text-xs text-amber-300">{note}</p>}
      </div>

      <div className="space-y-2">
        {turns.map((t, i) => (
          <div key={i} className="bg-gray-900/60 border border-gray-700/40 rounded-xl p-4">
            {t.you !== "(search)" && <p className="text-xs text-gray-500">🗣 {t.you}</p>}
            {t.detail !== t.ai && <p className="text-sm font-semibold text-violet-200 mt-2">🤖 {t.ai}</p>}
            {t.grounded && <p className="text-[10px] font-semibold text-emerald-300 bg-emerald-950/40 border border-emerald-800/40 rounded-full px-2 py-0.5 inline-block mt-2">📊 Answered from live {t.grounded.kind === "market" ? "market data" : "property records"}: {t.grounded.label}</p>}
            <p className="text-sm text-gray-200 mt-2 whitespace-pre-wrap leading-relaxed">{t.detail}</p>
            {t.results && t.results.length > 0 && (
              <div className="mt-3 space-y-1">
                {t.results.map((l) => (
                  <div key={l.attomId} className="flex items-center gap-2 bg-gray-950/60 border border-gray-800 rounded-lg px-2.5 py-1.5">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${(l.score ?? 0) >= 70 ? "bg-rose-600 text-white" : (l.score ?? 0) >= 50 ? "bg-amber-600 text-white" : "bg-gray-700 text-gray-200"}`}>{l.score ?? 0}</span>
                    <p className="text-xs text-white truncate flex-1">{l.address}{l.city ? `, ${l.city}` : ""} {l.zip ?? ""}</p>
                    <span className="text-[11px] text-gray-500 shrink-0">{money(l.estimatedValue ?? l.avmValue)}</span>
                    <button onClick={() => openDealSheet(l)} className="text-[11px] font-semibold text-indigo-300 hover:text-indigo-200 shrink-0">📄</button>
                  </div>
                ))}
                <p className="text-[10px] text-gray-600">Full table, map, skip-trace &amp; outreach: 🏚 Real Estate tab{t.area ? ` → search “${t.area}”` : ""}. Or just tell me how to refine these.</p>
              </div>
            )}
            <button onClick={() => speakOnce(t.ai)} className="text-[11px] text-violet-400 hover:text-violet-300 mt-2">🔊 Replay</button>
          </div>
        ))}
      </div>
    </div>
  )
}
