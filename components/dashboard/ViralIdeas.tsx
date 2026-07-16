"use client"

// 🎬 Viral Ideas — content ideas for YOUR business and ITS market, grounded in
// real live numbers (median values, today's rate, rent trends, fresh local
// headlines) so every hook carries a receipt. Ideas are self-scored on hook
// strength / emotion / specificity / shareability; only the winners show.

import { useMemo, useState } from "react"

interface ViralIdea { hook: string; format: string; platform: string; score: number; whyItWorks: string; beats: string[]; caption: string; hashtags: string[] }
interface IdeasResult { ideas: ViralIdea[]; groundedOn: string[]; at: string }

const scoreCls = (s: number) => (s >= 75 ? "bg-emerald-600 text-white" : s >= 55 ? "bg-amber-600 text-white" : "bg-gray-700 text-gray-200")

export default function ViralIdeas({ password }: { password: string }) {
  const apiHeaders = useMemo(() => ({ "Content-Type": "application/json", "x-admin-password": password }), [password])
  const [city, setCity] = useState("")
  const [stateAbbr, setStateAbbr] = useState("")
  const [situation, setSituation] = useState("")
  const [loading, setLoading] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [result, setResult] = useState<IdeasResult | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  const [copied, setCopied] = useState<number | null>(null)

  const generate = async (fresh = false) => {
    if (!city.trim() || !stateAbbr.trim()) { setNote("Enter your market's city and state."); return }
    setLoading(true); setNote(null); if (fresh) setResult(null)
    try {
      const res = await fetch("/api/content/viral-ideas", {
        method: "POST", headers: apiHeaders,
        body: JSON.stringify({ city: city.trim(), state: stateAbbr.trim(), situation: situation.trim() || undefined, fresh }),
      })
      const data = await res.json()
      if (data.error) { setNote(data.error) } else { setResult(data); setOpen(0) }
    } catch { setNote("Generation failed — try again.") }
    setLoading(false)
  }

  const copyIdea = async (i: number, idea: ViralIdea) => {
    const text = `HOOK: ${idea.hook}\n\nSCRIPT:\n${idea.beats.map((b, k) => `${k + 1}. ${b}`).join("\n")}\n\nCAPTION: ${idea.caption}\n${idea.hashtags.map((h) => `#${h}`).join(" ")}`
    try { await navigator.clipboard.writeText(text); setCopied(i); setTimeout(() => setCopied(null), 1500) } catch { setNote("Copy failed — select the text manually.") }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-bold text-white">🎬 Viral Ideas</h3>
        <p className="text-sm text-gray-400 mt-0.5">Content ideas built on your market&apos;s <b className="text-gray-300">real numbers</b> — today&apos;s rate, actual rents, fresh local headlines — because hooks with receipts stop thumbs and vibes don&apos;t. Self-scored; only the winners show.</p>
      </div>

      <div className="bg-gray-900/60 border border-fuchsia-500/25 rounded-2xl p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <input value={city} onChange={(e) => setCity(e.target.value)} onKeyDown={(e) => e.key === "Enter" && generate()} placeholder="Your market — e.g. Riverside" className="bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-fuchsia-500 w-48" />
          <input value={stateAbbr} onChange={(e) => setStateAbbr(e.target.value.toUpperCase().slice(0, 2))} placeholder="ST" className="bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-fuchsia-500 w-16" />
          <button onClick={() => generate(false)} disabled={loading} className="bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-50 text-white text-sm font-bold px-5 py-2 rounded-lg">{loading ? "Cooking…" : "🎬 Generate ideas"}</button>
          {result && <button onClick={() => generate(true)} disabled={loading} className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 text-xs font-semibold px-3 py-2 rounded-lg disabled:opacity-50">🔄 Fresh batch</button>}
        </div>
        <textarea value={situation} onChange={(e) => setSituation(e.target.value)} rows={2}
          placeholder="Your situation (optional but sharpens everything) — e.g. “I wholesale in the Inland Empire, closed 3 deals this year, want inbound sellers and local credibility. I'm comfortable on camera.”"
          className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-fuchsia-500" />
        {note && <p className="text-xs text-amber-300">{note}</p>}
      </div>

      {result && result.groundedOn.length > 0 && (
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-3">
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">📊 Grounded on these real facts</p>
          <div className="flex flex-wrap gap-1.5">
            {result.groundedOn.map((f, i) => <span key={i} className="text-[10px] bg-gray-950/70 border border-gray-800 text-gray-400 px-2 py-0.5 rounded">{f}</span>)}
          </div>
        </div>
      )}

      <div className="space-y-2">
        {result?.ideas.map((idea, i) => (
          <div key={i} className="bg-gray-900/60 border border-gray-800 rounded-xl p-4">
            <button onClick={() => setOpen(open === i ? null : i)} className="w-full flex items-start gap-2 text-left">
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 ${scoreCls(idea.score)}`} title="Self-scored virality">{idea.score}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white">“{idea.hook}”</p>
                <p className="text-[11px] text-gray-500 mt-0.5">{idea.format} · {idea.platform} · {idea.whyItWorks}</p>
              </div>
              <span className="text-gray-600 text-xs shrink-0">{open === i ? "▾" : "▸"}</span>
            </button>
            {open === i && (
              <div className="mt-3 space-y-2">
                <div className="bg-gray-950/60 border border-gray-800 rounded-lg p-3">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Script beats</p>
                  {idea.beats.map((b, k) => <p key={k} className="text-[11px] text-gray-300">{k + 1}. {b}</p>)}
                </div>
                <p className="text-[11px] text-gray-400"><b className="text-gray-300">Caption:</b> {idea.caption}</p>
                <p className="text-[11px] text-fuchsia-300">{idea.hashtags.map((h) => `#${h}`).join(" ")}</p>
                <button onClick={() => copyIdea(i, idea)} className="bg-fuchsia-700/50 hover:bg-fuchsia-600 text-white text-[11px] font-semibold px-3 py-1.5 rounded-lg">{copied === i ? "✓ Copied" : "📋 Copy full script"}</button>
              </div>
            )}
          </div>
        ))}
      </div>
      {result && <p className="text-[10px] text-gray-600">Every hook uses your market&apos;s live data — refresh tomorrow and the numbers (and headlines) will have moved. New batch daily; 🔄 for a fresh take now.</p>}
    </div>
  )
}
