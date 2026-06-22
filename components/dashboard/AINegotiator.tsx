"use client"

// AI Negotiator — an inline conversation coach for a single lead. Generates the
// opening message, and drafts the best next reply to whatever the homeowner
// said. The investor reviews + copies/sends; nothing is sent automatically.

import { useState } from "react"
import type { ForeclosureLead } from "@/lib/agents/foreclosure-agent"

interface Turn { who: "seller" | "you"; text: string; tips?: string[] }

export default function AINegotiator({ lead, password }: { lead: ForeclosureLead; password: string }) {
  const [turns, setTurns] = useState<Turn[]>([])
  const [sellerMsg, setSellerMsg] = useState("")
  const [loading, setLoading] = useState(false)

  const draft = async (sellerMessage?: string) => {
    setLoading(true)
    try {
      const history = turns.map((t) => `${t.who === "you" ? "Me" : "Them"}: ${t.text}`).join(" | ")
      const res = await fetch("/api/leads/converse", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify({ address: lead.address, city: lead.city, state: lead.state, ownerName: lead.ownerName, sellerMessage, history, channel: "text" }),
      })
      const data = await res.json()
      const next: Turn[] = []
      if (sellerMessage) next.push({ who: "seller", text: sellerMessage })
      if (data.reply) next.push({ who: "you", text: data.reply, tips: data.tips ?? [] })
      setTurns((prev) => [...prev, ...next])
      setSellerMsg("")
    } catch { /* non-fatal */ }
    setLoading(false)
  }

  const copy = (t: string) => { if (typeof navigator !== "undefined" && navigator.clipboard) navigator.clipboard.writeText(t).catch(() => {}) }

  return (
    <div className="mt-2.5 bg-violet-950/20 border border-violet-500/25 rounded-xl p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-violet-200">💬 AI Negotiator</p>
        {turns.length === 0 && (
          <button onClick={() => draft()} disabled={loading} className="text-xs font-semibold text-violet-300 hover:text-violet-200 disabled:opacity-50">
            {loading ? "Drafting…" : "Generate opener"}
          </button>
        )}
      </div>

      <div className="space-y-2">
        {turns.map((t, i) => (
          <div key={i} className={t.who === "you" ? "" : "opacity-80"}>
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">{t.who === "you" ? "Suggested message" : "Homeowner said"}</p>
            <div className={`text-xs rounded-lg px-2.5 py-1.5 ${t.who === "you" ? "bg-violet-900/40 text-violet-100" : "bg-gray-800/60 text-gray-300"}`}>{t.text}</div>
            {t.who === "you" && (
              <div className="flex items-center gap-2 mt-1">
                <button onClick={() => copy(t.text)} className="text-[10px] text-violet-400 hover:text-violet-300">📋 Copy</button>
                {t.tips && t.tips.length > 0 && <span className="text-[10px] text-gray-500">💡 {t.tips.join(" · ")}</span>}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-2 mt-2.5">
        <input value={sellerMsg} onChange={(e) => setSellerMsg(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sellerMsg.trim() && draft(sellerMsg.trim())} placeholder="Paste what the homeowner said → get the best reply" className="flex-1 bg-gray-900/60 border border-gray-700/50 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-500" />
        <button onClick={() => sellerMsg.trim() && draft(sellerMsg.trim())} disabled={loading || !sellerMsg.trim()} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white">Draft reply</button>
      </div>
    </div>
  )
}
