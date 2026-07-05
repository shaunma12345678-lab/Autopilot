"use client"

// Voice Assistant — talk to your business. Tap the mic, speak a command, and
// DealPilot answers out loud. Uses the browser's built-in speech recognition +
// synthesis (keyless) and the Groq voice endpoint. Degrades gracefully where
// the browser doesn't support speech.

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

interface Turn { you: string; ai: string }

export default function VoiceAssistant({ password }: { password: string }) {
  const [listening, setListening] = useState(false)
  const [thinking, setThinking] = useState(false)
  const [turns, setTurns] = useState<Turn[]>([])
  const [note, setNote] = useState<string | null>(null)
  const recRef = useRef<SpeechRecognitionLike | null>(null)
  const supported = getSR() !== null

  const speak = (text: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return
    try { window.speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.rate = 1.02; window.speechSynthesis.speak(u) } catch { /* ignore */ }
  }

  const ask = async (transcript: string) => {
    setThinking(true)
    try {
      const res = await fetch("/api/voice", { method: "POST", headers: { "Content-Type": "application/json", "x-admin-password": password }, body: JSON.stringify({ transcript }) })
      const data = await res.json()
      const ai = data.answer || "Sorry, I didn't get that."
      setTurns((p) => [{ you: transcript, ai }, ...p])
      speak(ai)
    } catch { setNote("Couldn't reach the assistant — try again.") }
    setThinking(false)
  }

  const start = () => {
    const SR = getSR()
    if (!SR) { setNote("Voice isn't supported in this browser — try Chrome."); return }
    setNote(null)
    const rec = new SR()
    rec.lang = "en-US"; rec.interimResults = false; rec.continuous = false
    rec.onresult = (e) => { const t = e.results?.[0]?.[0]?.transcript ?? ""; if (t) ask(t) }
    rec.onerror = () => setListening(false)
    rec.onend = () => setListening(false)
    recRef.current = rec
    try { rec.start(); setListening(true) } catch { setListening(false) }
  }
  const stop = () => { try { recRef.current?.stop() } catch { /* ignore */ } setListening(false) }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-bold text-white">🎙 Voice Assistant</h3>
        <p className="text-sm text-gray-400 mt-0.5">Talk to your business. Tap the mic and ask anything — <i>&quot;What should I offer on a $300k ARV with 45% equity?&quot;</i>, <i>&quot;How do I find cash buyers?&quot;</i>, <i>&quot;Explain BRRRR.&quot;</i> — and DealPilot answers out loud.</p>
      </div>

      <div className="bg-gradient-to-b from-violet-950/40 to-gray-900/60 border border-violet-500/30 rounded-2xl p-6 flex flex-col items-center gap-3">
        <button onClick={listening ? stop : start} disabled={thinking || !supported}
          className={`w-24 h-24 rounded-full flex items-center justify-center text-4xl transition-all disabled:opacity-50 ${listening ? "bg-red-600 animate-pulse" : "bg-violet-600 hover:bg-violet-500"}`}>
          🎙
        </button>
        <p className="text-sm font-semibold text-white">{listening ? "Listening… tap to stop" : thinking ? "Thinking…" : supported ? "Tap to speak" : "Voice not supported here"}</p>
        {note && <p className="text-xs text-amber-300">{note}</p>}
        {!supported && <p className="text-[11px] text-gray-500">Speech recognition needs Chrome/Edge. You can still read answers.</p>}
      </div>

      <div className="space-y-2">
        {turns.map((t, i) => (
          <div key={i} className="bg-gray-900/60 border border-gray-700/40 rounded-xl p-3">
            <p className="text-xs text-gray-500">🗣 {t.you}</p>
            <p className="text-sm text-violet-100 mt-1">🤖 {t.ai}</p>
            <button onClick={() => speak(t.ai)} className="text-[11px] text-violet-400 hover:text-violet-300 mt-1">🔊 Replay</button>
          </div>
        ))}
      </div>
    </div>
  )
}
