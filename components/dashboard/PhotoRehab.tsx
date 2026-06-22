"use client"

// Photo rehab estimator — paste a property photo URL (from a listing) and Groq
// vision assesses condition + a fix-&-flip rehab scope and $/sqft. Collapsible
// tool; never blocks the page.

import { useState } from "react"

interface RehabResult { found: boolean; condition?: string; level?: string; psf?: number | null; issues?: string[]; summary?: string; note?: string; error?: string }

const LEVEL_CLR: Record<string, string> = {
  light: "text-emerald-300", medium: "text-amber-300", heavy: "text-red-300",
}

export default function PhotoRehab({ password }: { password: string }) {
  const [open, setOpen] = useState(false)
  const [url, setUrl]   = useState("")
  const [loading, setLoading] = useState(false)
  const [result, setResult]   = useState<RehabResult | null>(null)
  const [error, setError]     = useState<string | null>(null)

  const analyze = async () => {
    if (!url.trim()) { setError("Paste a property photo URL."); return }
    setLoading(true); setError(null); setResult(null)
    try {
      const res = await fetch("/api/leads/photo-rehab", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify({ imageUrl: url.trim() }),
      })
      const data = await res.json()
      if (data?.error) setError(data.error)
      else if (!data.found) setError(data.note ?? "Couldn't read that image.")
      else setResult(data)
    } catch { setError("Analysis failed — try again.") }
    setLoading(false)
  }

  return (
    <div className="bg-gray-900/60 border border-gray-700/40 rounded-2xl p-3">
      <button onClick={() => setOpen(!open)} className="text-sm font-semibold text-white flex items-center gap-2">
        📷 Estimate rehab from a photo <span className="text-xs text-gray-500">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-2">
          <div className="flex gap-2">
            <input value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && analyze()} placeholder="Paste a listing photo URL (https://…)" className="flex-1 bg-gray-800/60 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500" />
            <button onClick={analyze} disabled={loading} className="text-sm font-semibold px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white">{loading ? "Analyzing…" : "Analyze"}</button>
          </div>
          {error && <p className="text-xs text-red-300">{error}</p>}
          {result && (
            <div className="bg-gray-800/40 border border-gray-700/40 rounded-xl p-3">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm font-bold text-white">{result.condition}</span>
                <span className={`text-xs font-bold ${LEVEL_CLR[result.level ?? "medium"] ?? "text-amber-300"}`}>{result.level} rehab{result.psf ? ` · ~$${result.psf}/sqft` : ""}</span>
              </div>
              {result.summary && <p className="text-xs text-gray-300 mt-1.5">{result.summary}</p>}
              {result.issues && result.issues.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {result.issues.map((s, i) => <li key={i} className="text-[10px] text-amber-200/90 bg-amber-950/30 border border-amber-500/20 rounded px-1.5 py-0.5">{s}</li>)}
                </ul>
              )}
              <p className="text-[10px] text-gray-500 mt-2">AI visual estimate — confirm with an in-person inspection before offering.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
