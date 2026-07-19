"use client"

// 🛑 Risk scan panel — the downside story: flood zone (FEMA, verified), law /
// rent-control / STR risk, lien-vs-equity landmines, market trend, timing.
// Click-to-run (one FEMA + market call per click, never bulk-fired). Every
// flag shows its source and whether it's verified record data or an estimate.

import { useState } from "react"
import type { ForeclosureLead } from "@/lib/agents/foreclosure-agent"
import type { RiskReport } from "@/lib/deal-risk"

const GRADE_CLS: Record<RiskReport["grade"], string> = {
  low: "bg-emerald-600 text-white",
  moderate: "bg-amber-500 text-black",
  elevated: "bg-orange-600 text-white",
  high: "bg-rose-600 text-white",
}
const SEV_CLS: Record<string, string> = {
  high: "bg-rose-950/50 border-rose-700/50",
  medium: "bg-amber-950/40 border-amber-700/40",
  low: "bg-gray-900/60 border-gray-700/50",
}

export default function DealRisk({ lead, apiHeaders }: { lead: ForeclosureLead; apiHeaders?: Record<string, string> }) {
  const [report, setReport] = useState<(RiskReport & { checked?: string[] }) | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const run = async () => {
    setBusy(true); setErr(null)
    try {
      const res = await fetch("/api/leads/risk", {
        method: "POST",
        headers: apiHeaders ?? { "Content-Type": "application/json" },
        body: JSON.stringify({ lead }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error ?? `Risk scan failed (${res.status})`)
      setReport(data)
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Risk scan failed — try again")
    }
    setBusy(false)
  }

  return (
    <div className="bg-rose-950/20 border border-rose-500/25 rounded-lg px-3 py-2.5 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-rose-300 font-bold uppercase tracking-wide">🛑 Risk scan — what could kill this deal</span>
        {report
          ? <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${GRADE_CLS[report.grade]}`}>risk {report.riskScore} · {report.grade}</span>
          : <button onClick={run} disabled={busy} className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-rose-700 hover:bg-rose-600 disabled:opacity-50 text-white">
              {busy ? "Scanning flood + law + market…" : "Run risk scan"}
            </button>}
      </div>

      {err && <p className="text-[10px] text-rose-300">{err}</p>}
      {!report && !err && <p className="text-[10px] text-gray-500">Checks FEMA flood zone, landlord law / rent control / STR rules, lien-vs-equity structure, metro price trend, and auction timing — each flag labeled verified or estimate.</p>}

      {report && (
        <>
          <p className="text-[11px] text-gray-200 leading-relaxed">{report.summary}</p>
          {report.flags.length > 0 && (
            <div className="space-y-1">
              {report.flags.map((f) => (
                <div key={f.key} className={`rounded-lg border px-2 py-1.5 ${SEV_CLS[f.severity]}`}>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-[11px] font-semibold text-white">{f.severity === "high" ? "⛔" : f.severity === "medium" ? "⚠️" : "▫️"} {f.label}</p>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${f.confidence === "verified" ? "bg-emerald-900/60 text-emerald-300" : "bg-gray-800 text-gray-400"}`}>{f.confidence}</span>
                  </div>
                  <p className="text-[10px] text-gray-300 mt-0.5">{f.detail}</p>
                  <p className="text-[9px] text-gray-500 mt-0.5">Source: {f.source}</p>
                </div>
              ))}
            </div>
          )}
          {report.clean.length > 0 && (
            <div className="space-y-0.5">
              {report.clean.map((c, i) => <p key={i} className="text-[10px] text-emerald-300/80">✓ {c}</p>)}
            </div>
          )}
          <button onClick={run} disabled={busy} className="text-[10px] text-gray-500 hover:text-gray-300">{busy ? "Re-scanning…" : "↻ Re-scan"}</button>
        </>
      )}
    </div>
  )
}
