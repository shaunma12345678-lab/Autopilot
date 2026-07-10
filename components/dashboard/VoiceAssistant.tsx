"use client"

// Voice Assistant — talk (or type) to your business. Every question gets a
// short spoken reply AND a full detailed written answer below it. Uses the
// browser's built-in speech recognition + synthesis (keyless) and the Groq
// voice endpoint. Degrades gracefully where the browser doesn't support speech.

import { useState, useRef } from "react"

// Minimal typing for the (webkit) SpeechRecognition API.
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

interface Turn { you: string; ai: string; detail: string }

export default function VoiceAssistant({ password }: { password: string }) {
  const [listening, setListening] = useState(false)
  const [thinking, setThinking] = useState(false)
  const [typed, setTyped] = useState("")
  const [turns, setTurns] = useState<Turn[]>([])
  const [note, setNote] = useState<string | null>(null)
  const [muted, setMuted] = useState(false)
  const recRef = useRef<SpeechRecognitionLike | null>(null)
  const supported = getSR() !== null

  const speak = (text: string) => {
    if (muted || typeof window === "undefined" || !window.speechSynthesis) return
    try { window.speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.rate = 1.02; window.speechSynthesis.speak(u) } catch { /* ignore */ }
  }

  const ask = async (question: string) => {
    const q = question.trim()
    if (!q || thinking) return
    setThinking(true)
    setNote(null)
    try {
      const res = await fetch("/api/voice", { method: "POST", headers: { "Content-Type": "application/json", "x-admin-password": password }, body: JSON.stringify({ transcript: q }) })
      const data = await res.json()
      const ai = data.answer || "Sorry, I didn't get that."
      const detail = typeof data.detail === "string" && data.detail.trim() ? data.detail.trim() : ai
      setTurns((p) => [{ you: q, ai, detail }, ...p])
      speak(ai)
    } catch { setNote("Couldn't reach the assistant — try again.") }
    setThinking(false)
  }

  const submitTyped = () => { const q = typed; setTyped(""); void ask(q) }

  const start = () => {
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
  const stop = () => { try { recRef.current?.stop() } catch { /* ignore */ } setListening(false) }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-bold text-white">🎙 Assistant</h3>
        <p className="text-sm text-gray-400 mt-0.5">Speak or type any question — <i>&quot;What should I offer on a $300k ARV with 45% equity?&quot;</i>, <i>&quot;Write my cold-call script for a pre-foreclosure owner.&quot;</i> You get a short spoken reply plus the full written breakdown.</p>
      </div>

      <div className="bg-gradient-to-b from-violet-950/40 to-gray-900/60 border border-violet-500/30 rounded-2xl p-6 flex flex-col items-center gap-3">
        <button onClick={listening ? stop : start} disabled={thinking || !supported}
          className={`w-20 h-20 rounded-full flex items-center justify-center text-3xl transition-all disabled:opacity-50 ${listening ? "bg-red-600 animate-pulse" : "bg-violet-600 hover:bg-violet-500"}`}>
          🎙
        </button>
        <p className="text-sm font-semibold text-white">{listening ? "Listening… tap to stop" : thinking ? "Thinking…" : supported ? "Tap to speak — or type below" : "Voice not supported here — type below"}</p>

        <div className="w-full flex gap-2">
          <input value={typed} onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submitTyped() }}
            placeholder="Type a question…" disabled={thinking}
            className="flex-1 bg-gray-950/70 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-violet-500 disabled:opacity-50" />
          <button onClick={submitTyped} disabled={thinking || !typed.trim()}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-50">
            {thinking ? "…" : "Ask"}
          </button>
        </div>

        <label className="flex items-center gap-1.5 text-[11px] text-gray-500 cursor-pointer select-none">
          <input type="checkbox" checked={muted} onChange={(e) => setMuted(e.target.checked)} className="accent-violet-500" />
          Mute spoken replies (text only)
        </label>
        {note && <p className="text-xs text-amber-300">{note}</p>}
      </div>

      <div className="space-y-2">
        {turns.map((t, i) => (
          <div key={i} className="bg-gray-900/60 border border-gray-700/40 rounded-xl p-4">
            <p className="text-xs text-gray-500">🗣 {t.you}</p>
            {t.detail !== t.ai && <p className="text-sm font-semibold text-violet-200 mt-2">🤖 {t.ai}</p>}
            <p className="text-sm text-gray-200 mt-2 whitespace-pre-wrap leading-relaxed">{t.detail}</p>
            <button onClick={() => speak(t.ai)} className="text-[11px] text-violet-400 hover:text-violet-300 mt-2">🔊 Replay</button>
          </div>
        ))}
      </div>
    </div>
  )
}
