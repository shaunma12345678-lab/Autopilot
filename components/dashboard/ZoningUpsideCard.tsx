"use client"

import { useState } from "react"

interface ZoningContext {
  covered: boolean
  usereg: string | null
  density: string | null
  lot: string | null
  height: string | null
  buildtype: string | null
  maxflr: string | null
  flrarearatio: string | null
  coverage: string | null
  narrative: string | null
}

export default function ZoningUpsideCard({ leadId }: { leadId: string }) {
  const [loading, setLoading] = useState(false)
  const [zoning, setZoning] = useState<ZoningContext | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function check() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/leads/${leadId}/zoning`)
      const data = await res.json()
      if (!res.ok) setError(data.error ?? "Lookup failed")
      else setZoning(data.zoning)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error")
    } finally {
      setLoading(false)
    }
  }

  if (!zoning && !error) {
    return (
      <button onClick={check} disabled={loading}
        className="px-4 py-2 bg-purple-600/80 hover:bg-purple-600 disabled:opacity-40 text-white text-xs font-semibold rounded-xl border border-purple-500/40 transition-all">
        {loading ? "Checking county zoning…" : "Check Zoning (SD unincorporated)"}
      </button>
    )
  }

  return (
    <div className="rounded-xl border border-purple-500/30 bg-purple-500/5 px-4 py-3 space-y-2">
      {error ? (
        <p className="text-xs text-red-300">{error}</p>
      ) : zoning && (
        <>
          <p className="text-xs font-semibold uppercase tracking-wide text-purple-300">Zoning Context</p>
          {!zoning.covered ? (
            <p className="text-xs text-gray-400">{zoning.narrative}</p>
          ) : (
            <>
              {zoning.narrative && <p className="text-xs text-gray-300">{zoning.narrative}</p>}
              <div className="flex flex-wrap gap-1.5 mt-1">
                {[
                  ["Use", zoning.usereg], ["Density", zoning.density], ["Lot", zoning.lot],
                  ["Height", zoning.height], ["Type", zoning.buildtype], ["Max FLR", zoning.maxflr],
                ].filter(([, v]) => v).map(([label, value]) => (
                  <span key={label} className="text-[10px] px-1.5 py-0.5 rounded bg-purple-900/40 text-purple-300 border border-purple-700/30">
                    {label}: {value}
                  </span>
                ))}
              </div>
              <p className="text-[10px] text-gray-600 mt-1">Raw San Diego County zoning codes — verify against the county ordinance before relying on this.</p>
            </>
          )}
        </>
      )}
    </div>
  )
}
