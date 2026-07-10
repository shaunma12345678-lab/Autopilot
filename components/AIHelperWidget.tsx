"use client"

// Floating AI helper — a chat bubble available on every page it's mounted on.
// Sends the question to the given endpoint ({ transcript } → { answer, detail })
// and renders the detailed written reply. Used three ways: the investor copilot
// in the admin console, the customer helper in the dashboard, and the homeowner
// helper on the public /sell pages (different endpoint + tone).

import { useEffect, useRef, useState } from "react"

interface Msg { role: "you" | "ai"; text: string }

export default function AIHelperWidget({
  endpoint,
  headers,
  title,
  intro,
  placeholder = "Ask me anything…",
  suggestions = [],
}: {
  endpoint: string
  headers?: Record<string, string>
  title: string
  intro: string
  placeholder?: string
  suggestions?: string[]
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [thinking, setThinking] = useState(false)
  const bodyRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" })
  }, [msgs, thinking])

  const ask = async (question: string) => {
    const text = question.trim()
    if (!text || thinking) return
    setQ("")
    setMsgs((m) => [...m, { role: "you", text }])
    setThinking(true)
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(headers ?? {}) },
        body: JSON.stringify({ transcript: text, question: text }),
      })
      const data = await res.json()
      const reply = (typeof data.detail === "string" && data.detail.trim()) || (typeof data.answer === "string" && data.answer.trim()) || "Sorry — I couldn't answer that. Try rephrasing."
      setMsgs((m) => [...m, { role: "ai", text: reply }])
    } catch {
      setMsgs((m) => [...m, { role: "ai", text: "I couldn't reach the assistant — please try again in a moment." }])
    }
    setThinking(false)
  }

  return (
    <div className="fixed bottom-5 right-5 z-[60]">
      {open && (
        <div className="mb-3 w-[min(94vw,380px)] h-[min(70vh,520px)] bg-gray-950 border border-violet-500/40 rounded-2xl shadow-2xl shadow-violet-950/50 flex flex-col overflow-hidden">
          <div className="px-4 py-3 bg-gradient-to-r from-violet-950 to-gray-900 border-b border-violet-500/30 flex items-center justify-between">
            <p className="text-sm font-bold text-white">🤖 {title}</p>
            <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-white text-sm" aria-label="Close helper">✕</button>
          </div>

          <div ref={bodyRef} className="flex-1 overflow-y-auto p-3 space-y-2">
            <div className="bg-violet-950/40 border border-violet-500/20 rounded-xl p-3 text-xs text-violet-100 leading-relaxed">{intro}</div>
            {msgs.length === 0 && suggestions.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((s) => (
                  <button key={s} onClick={() => void ask(s)} className="text-[11px] bg-gray-900 border border-gray-700 hover:border-violet-500 text-gray-300 px-2 py-1 rounded-lg text-left">{s}</button>
                ))}
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={`rounded-xl p-3 text-xs leading-relaxed whitespace-pre-wrap ${m.role === "you" ? "bg-violet-600/25 border border-violet-500/30 text-white ml-6" : "bg-gray-900 border border-gray-800 text-gray-200 mr-2"}`}>
                {m.text}
              </div>
            ))}
            {thinking && <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 text-xs text-gray-500 mr-2">Thinking…</div>}
          </div>

          <div className="p-3 border-t border-gray-800 flex gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void ask(q) }}
              placeholder={placeholder}
              className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-violet-500"
            />
            <button onClick={() => void ask(q)} disabled={thinking || !q.trim()} className="bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-bold px-3.5 rounded-lg">Ask</button>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close AI helper" : "Open AI helper"}
        className="ml-auto flex w-14 h-14 rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-2xl items-center justify-center shadow-lg shadow-violet-950/60 transition-transform hover:scale-105"
      >
        {open ? "✕" : "🤖"}
      </button>
    </div>
  )
}
