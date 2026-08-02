"use client"

import { useState } from "react"

interface FloodRisk {
  floodZone: string | null
  zoneSubtype: string | null
  inSpecialFloodHazardArea: boolean | null
  baseFloodElevationFt: number | null
  riskLevel: "high" | "moderate" | "minimal" | "unknown"
  summary: string
}

const RISK_STYLE: Record<string, string> = {
  high: "border-red-500/40 bg-red-500/10 text-red-300",
  moderate: "border-orange-500/40 bg-orange-500/10 text-orange-300",
  minimal: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  unknown: "border-gray-600/40 bg-gray-600/10 text-gray-400",
}

export default function FloodRiskCard({ leadId }: { leadId: string }) {
  const [loading, setLoading] = useState(false)
  const [risk, setRisk] = useState<FloodRisk | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function check() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/leads/${leadId}/flood-risk`)
      const data = await res.json()
      if (!res.ok) setError(data.error ?? "Lookup failed")
      else setRisk(data.floodRisk)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error")
    } finally {
      setLoading(false)
    }
  }

  if (!risk && !error) {
    return (
      <button onClick={check} disabled={loading}
        className="px-4 py-2 bg-blue-600/80 hover:bg-blue-600 disabled:opacity-40 text-white text-xs font-semibold rounded-xl border border-blue-500/40 transition-all">
        {loading ? "Checking FEMA flood maps…" : "Check Flood Risk"}
      </button>
    )
  }

  return (
    <div className={`rounded-xl border px-4 py-3 ${risk ? RISK_STYLE[risk.riskLevel] : "border-red-500/30 bg-red-500/10 text-red-300"}`}>
      {error ? (
        <p className="text-xs">{error}</p>
      ) : risk && (
        <>
          <p className="text-xs font-semibold uppercase tracking-wide opacity-70">
            Flood Risk — {risk.riskLevel}
          </p>
          <p className="text-xs mt-1">{risk.summary}</p>
        </>
      )}
    </div>
  )
}
