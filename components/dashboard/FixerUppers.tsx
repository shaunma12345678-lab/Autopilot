"use client"

// Fixer-Upper finder — search an area for houses that need work, comp the ARV,
// and run the explicit fix-&-flip MAO formula on each. Shows the full
// breakdown so the user sees exactly how the max offer is built.

import { useState } from "react"
import type { FixerDeal } from "@/lib/fixer"
import { fmtMoney } from "@/lib/deal-analysis"
import { openDealSheet } from "@/lib/deal-sheet"

const GRADE_CLR: Record<string, string> = {
  A: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  B: "bg-lime-500/15 text-lime-300 border-lime-500/40",
  C: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  D: "bg-orange-500/15 text-orange-300 border-orange-500/40",
  F: "bg-red-500/15 text-red-300 border-red-500/40",
}
const VERDICT_CLR: Record<string, string> = {
  Pursue: "text-emerald-300", Negotiate: "text-amber-300", Underwrite: "text-indigo-300", Pass: "text-red-300",
}
const m = (n: number | null | undefined) => (typeof n === "number" && Number.isFinite(n) ? fmtMoney(n) : "—")

type Mode = "city" | "county" | "zip"
const MODES: { id: Mode; label: string }[] = [
  { id: "city",   label: "🏙 City" },
  { id: "county", label: "🗺 County" },
  { id: "zip",    label: "📮 ZIP" },
]

export default function FixerUppers({ password }: { password: string }) {
  const [mode, setMode]   = useState<Mode>("city")
  const [city, setCity]   = useState("")
  const [county, setCounty] = useState("")
  const [state, setState] = useState("")
  const [zip, setZip]     = useState("")
  const [depth, setDepth] = useState(250)
  const [condition, setCondition] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fixers, setFixers] = useState<FixerDeal[] | null>(null)
  const [meta, setMeta]   = useState<{ total: number; scanned: number; area: string; exactCount: number; shown: number; fellBack: boolean; searchType: Mode } | null>(null)
  const [open, setOpen]   = useState<number | null>(null)

  const search = async () => {
    if (mode === "city" && !city.trim())   { setError("Enter a city."); return }
    if (mode === "county" && !county.trim()) { setError("Enter a county."); return }
    if (mode === "zip" && !zip.trim())     { setError("Enter a ZIP code."); return }
    setLoading(true); setError(null)
    try {
      const res = await fetch("/api/leads/fixers", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify({ searchType: mode, city: city.trim(), county: county.trim(), state: state.trim(), zip: zip.trim(), depth, condition }),
      })
      const data = await res.json()
      if (data?.error) { setError(data.error); setFixers(null) }
      else { setFixers(data.fixers ?? []); setMeta({ total: data.total ?? 0, scanned: data.scanned ?? 0, area: data.area ?? "", exactCount: data.exactCount ?? 0, shown: data.shown ?? (data.fixers?.length ?? 0), fellBack: !!data.fellBack, searchType: data.searchType ?? mode }) }
    } catch { setError("Search failed — try again."); setFixers(null) }
    setLoading(false)
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-bold text-white">🔧 Fixer-Upper Finder</h3>
        <p className="text-sm text-gray-400 mt-0.5">Finds distressed-condition houses, comps the after-repair value, and runs the full Max-Allowable-Offer formula (ARV − commission − closing − holding − renovation − profit) on each. Search a single city, a whole county, or one ZIP.</p>
      </div>

      <div className="bg-gray-900/60 border border-gray-700/40 rounded-2xl p-4 space-y-3">
        <div className="flex gap-1.5">
          {MODES.map((md) => (
            <button key={md.id} onClick={() => setMode(md.id)} className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${mode === md.id ? "bg-indigo-600 border-indigo-400 text-white" : "bg-gray-800/40 border-gray-700/50 text-gray-400 hover:text-white"}`}>{md.label}</button>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {mode === "city" && (
            <input value={city} onChange={(e) => setCity(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} placeholder="City (e.g. Temple City)" className="bg-gray-800/60 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 sm:col-span-2" />
          )}
          {mode === "county" && (
            <input value={county} onChange={(e) => setCounty(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} placeholder="County (e.g. Los Angeles)" className="bg-gray-800/60 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 sm:col-span-2" />
          )}
          {mode === "zip" && (
            <input value={zip} onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 5))} onKeyDown={(e) => e.key === "Enter" && search()} placeholder="ZIP (e.g. 91780)" className="bg-gray-800/60 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 sm:col-span-2" />
          )}
          <input value={state} onChange={(e) => setState(e.target.value.toUpperCase().slice(0, 2))} onKeyDown={(e) => e.key === "Enter" && search()} placeholder="State (e.g. CA)" className="bg-gray-800/60 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <select value={depth} onChange={(e) => setDepth(Number(e.target.value))} className="bg-gray-800/60 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-white">
            <option value={150}>Scan 150</option>
            <option value={250}>Scan 250</option>
            <option value={500}>Scan 500 (deep)</option>
            <option value={1000}>Scan 1000 (county-wide)</option>
          </select>
        </div>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
            <input type="checkbox" checked={condition} onChange={(e) => setCondition(e.target.checked)} className="accent-indigo-500" />
            Only show houses with explicit condition signals (as-is / TLC / needs work)
          </label>
          <button onClick={search} disabled={loading} className="text-sm font-semibold px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white">
            {loading ? "Searching…" : "🔍 Find fixer-uppers"}
          </button>
        </div>
        {error && <p className="text-xs text-red-300">{error}</p>}
      </div>

      {meta && fixers && (
        <p className="text-xs text-gray-500">
          {fixers.length} flip{fixers.length === 1 ? "" : "s"} in <span className="text-gray-300 font-semibold">{meta.area}</span> · {meta.scanned} scanned
          {meta.searchType === "city" && !meta.fellBack && <span className="text-emerald-400"> · {meta.exactCount} confirmed in {meta.area.split(",")[0]}{fixers.length > meta.exactCount ? ` (+${fixers.length - meta.exactCount} unconfirmed addresses)` : ""} — use County mode for more volume</span>}
          {meta.searchType === "city" && meta.fellBack && <span className="text-amber-400"> · none confirmed in {meta.area.split(",")[0]} this scan — showing nearby; try County mode</span>}
          {meta.searchType === "county" && <span className="text-emerald-400"> · spanning the whole county</span>}
        </p>
      )}

      {fixers && fixers.length === 0 && !loading && (
        <p className="text-sm text-gray-400">No underwritable fixers found here yet — try a larger scan, a nearby city, or turn off the condition filter.</p>
      )}

      <div className="space-y-3">
        {(fixers ?? []).map((f, i) => {
          const d = f.deal
          const mao = d.maoDetail
          return (
            <div key={`${f.lead.address}-${i}`} className="bg-gray-900/60 border border-gray-700/40 rounded-2xl p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white truncate">{f.lead.address || "Address pending"}</p>
                  <p className="text-xs text-gray-500">{[f.lead.city, f.lead.state, f.lead.zip].filter(Boolean).join(", ")}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] font-bold text-indigo-300">Fixer {f.fixerScore}/100</span>
                  <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded border ${GRADE_CLR[d.grade] ?? GRADE_CLR.C}`}>Grade {d.grade}</span>
                </div>
              </div>

              <p className={`text-xs font-semibold mt-1.5 ${VERDICT_CLR[d.verdict.call] ?? "text-gray-300"}`}>{d.verdict.call} — <span className="font-normal text-gray-400">{d.verdict.reason}</span></p>

              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mt-3">
                {[
                  ["ARV", m(d.arv)],
                  ["Rehab", `${m(d.repairCost)}`],
                  ["Max Offer", mao ? m(mao.mao) : "—"],
                  ["Profit", m(d.flipProfit)],
                  ["ROI", d.roiPct ? `${d.roiPct}%` : "—"],
                ].map(([k, v]) => (
                  <div key={k} className="bg-gray-800/50 border border-gray-700/40 rounded-lg px-2.5 py-1.5">
                    <p className="text-[9px] text-gray-500 uppercase tracking-wide">{k}</p>
                    <p className="text-sm font-bold text-white mt-0.5">{v}</p>
                  </div>
                ))}
              </div>

              {f.conditionSignals.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  {f.conditionSignals.map((s, j) => (
                    <span key={j} className="text-[10px] text-amber-200/90 bg-amber-950/30 border border-amber-500/20 rounded px-1.5 py-0.5">{s}</span>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-3 mt-3">
                <button onClick={() => setOpen(open === i ? null : i)} className="text-xs font-semibold text-indigo-400 hover:text-indigo-300">
                  {open === i ? "▲ Hide MAO math" : "▼ Show MAO math"}
                </button>
                <button onClick={() => openDealSheet(f.lead)} className="text-xs font-semibold text-emerald-400 hover:text-emerald-300">📄 Deal Sheet</button>
              </div>

              {open === i && mao && (
                <div className="mt-2.5 bg-blue-950/20 border border-blue-500/20 rounded-xl p-3">
                  <table className="w-full text-xs">
                    <tbody>
                      {mao.lines.map((ln, j) => {
                        const last = j === mao.lines.length - 1
                        return (
                          <tr key={j} className={last ? "border-t border-blue-500/30" : ""}>
                            <td className={`py-1 ${last || j === 0 ? "font-bold text-white" : "text-gray-400"}`}>{ln.label}</td>
                            <td className={`py-1 text-right font-semibold ${last ? "text-blue-300" : ln.deduction ? "text-red-300" : "text-white"}`}>{ln.deduction ? "− " : ""}{m(ln.amount)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  <p className="text-[10px] text-gray-500 mt-2">Offer at or below the MAO to keep the full projected profit. Holding assumes a {mao.holdMonths}-month flip; renovation = {d.repairLevel} rehab.</p>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
