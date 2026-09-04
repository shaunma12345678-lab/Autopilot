"use client"

// Renovation ROI calculator — which improvements pay on THIS property, and how
// much to actually spend.
//
// The neighbourhood ceiling is a required input rather than a defaulted one on
// purpose (see lib/renovation-roi.ts): without it any renovation can be made to
// look profitable on paper, which is the exact error the tool exists to prevent.
import { useState } from "react"

interface RoiLine {
  key: string; label: string; cost: number; costLow: number; costHigh: number
  valueAdded: number; valueLostToCeiling: number; holdingCost: number
  netGain: number; roiPct: number; riskAdjustedRoiPct: number
  weeks: number; confidence: string; verdict: string; reasoning: string[]
}
interface Budget {
  maxRecoverableSpend: number; recommendedSpend: number; recommendedItems: string[]
  cutItems: Array<{ label: string; reason: string }>
  recommendedNetGain: number; fullPlanNetGain: number; guidance: string
}
interface Report {
  ok: boolean; error?: string
  asIsValue: number; neighborhoodCeiling: number; headroom: number; headroomPct: number
  lines: RoiLine[]; totalCost: number; totalValueAdded: number; totalNetGain: number
  projectedValue: number; exceedsCeiling: boolean; budget: Budget
  summary: string; warnings: string[]; ceilingSource?: string
}

const money = (n: number) => `$${Math.round(n).toLocaleString()}`

const VERDICT_STYLE: Record<string, string> = {
  do_first:     "text-emerald-400 border-emerald-600/50 bg-emerald-950/40",
  worth_doing:  "text-blue-300 border-blue-600/50 bg-blue-950/40",
  marginal:     "text-yellow-300 border-yellow-600/50 bg-yellow-950/40",
  avoid:        "text-red-400 border-red-600/50 bg-red-950/40",
}

export default function RenovationCalculator() {
  const [asIsValue, setAsIsValue] = useState("410000")
  const [sqft, setSqft] = useState("1500")
  const [ceiling, setCeiling] = useState("450000")
  const [condition, setCondition] = useState("dated")
  const [description, setDescription] = useState("kitchen and bathroom")
  const [costMultiplier, setCostMultiplier] = useState("1.0")
  const [monthlyCarry, setMonthlyCarry] = useState("0")
  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(false)

  async function run() {
    setLoading(true)
    try {
      const res = await fetch("/api/renovation-roi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asIsValue: Number(asIsValue), sqft: Number(sqft),
          neighborhoodCeiling: Number(ceiling), condition, description,
          costMultiplier: Number(costMultiplier), monthlyCarry: Number(monthlyCarry),
        }),
      })
      setReport(await res.json())
    } catch (err) {
      setReport({ ok: false, error: err instanceof Error ? err.message : "Request failed" } as Report)
    } finally { setLoading(false) }
  }

  const field = "w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
  const label = "block text-[10px] uppercase tracking-wide text-gray-500 mb-1 font-semibold"

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-white">Renovation ROI</h2>
        <p className="text-[11px] text-gray-500 mt-1 max-w-3xl">
          Which renovations pay on this specific property, and how much to spend. Return is treated as a property of
          the renovation <em>and</em> the house <em>and</em> the street — not a national lookup table, which is what
          every other calculator uses.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div><label className={label}>Current value (as-is)</label>
          <input className={field} value={asIsValue} onChange={e => setAsIsValue(e.target.value)} inputMode="numeric" /></div>
        <div><label className={label}>Square feet</label>
          <input className={field} value={sqft} onChange={e => setSqft(e.target.value)} inputMode="numeric" /></div>
        <div>
          <label className={label}>Neighbourhood ceiling</label>
          <input className={field} value={ceiling} onChange={e => setCeiling(e.target.value)} inputMode="numeric" />
          <p className="text-[9px] text-gray-600 mt-1">Best price the street supports. This decides everything.</p>
        </div>
        <div><label className={label}>Condition of the areas</label>
          <select className={field} value={condition} onChange={e => setCondition(e.target.value)}>
            <option value="poor">Poor — broken or unusable</option>
            <option value="dated">Dated — works but visibly old</option>
            <option value="average">Average — serviceable</option>
            <option value="good">Good — already in order</option>
          </select></div>
        <div className="col-span-2"><label className={label}>What are you considering?</label>
          <input className={field} value={description} onChange={e => setDescription(e.target.value)}
            placeholder="kitchen, add a bathroom, roof, flooring…" /></div>
        <div><label className={label}>Regional cost multiplier</label>
          <input className={field} value={costMultiplier} onChange={e => setCostMultiplier(e.target.value)} inputMode="decimal" /></div>
        <div><label className={label}>Monthly carry (if financed)</label>
          <input className={field} value={monthlyCarry} onChange={e => setMonthlyCarry(e.target.value)} inputMode="numeric" /></div>
      </div>

      <button onClick={run} disabled={loading}
        className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg text-sm font-semibold text-white transition-colors">
        {loading ? "Analysing…" : "Analyse"}
      </button>

      {report && !report.ok && (
        <div className="rounded-xl border border-red-700/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">{report.error}</div>
      )}

      {report?.ok && (
        <div className="space-y-4">
          <div className="rounded-xl border border-indigo-600/40 bg-indigo-950/20 px-4 py-3">
            <p className="text-sm text-gray-200">{report.summary}</p>
            <p className="text-[11px] text-gray-500 mt-2">
              Headroom to the ceiling: <span className="text-gray-300 font-semibold">{money(report.headroom)}</span> ({report.headroomPct}%)
              {report.ceilingSource ? ` · ceiling ${report.ceilingSource}` : ""}
            </p>
          </div>

          <div className="rounded-xl border border-emerald-700/40 bg-emerald-950/20 px-4 py-3">
            <p className="text-[10px] uppercase tracking-wide text-emerald-400 font-bold mb-1">How much to put in</p>
            <p className="text-sm text-gray-200">{report.budget.guidance}</p>
            <div className="grid grid-cols-3 gap-3 mt-3 text-center">
              <div><p className="text-[9px] uppercase text-gray-500">Max recoverable</p>
                <p className="text-sm font-bold text-white">{money(report.budget.maxRecoverableSpend)}</p></div>
              <div><p className="text-[9px] uppercase text-gray-500">Recommended spend</p>
                <p className="text-sm font-bold text-emerald-400">{money(report.budget.recommendedSpend)}</p></div>
              <div><p className="text-[9px] uppercase text-gray-500">Net if recommended</p>
                <p className={`text-sm font-bold ${report.budget.recommendedNetGain >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {money(report.budget.recommendedNetGain)}</p></div>
            </div>
            {report.budget.cutItems.length > 0 && (
              <div className="mt-3 space-y-1">
                <p className="text-[10px] uppercase tracking-wide text-red-400 font-bold">Cut these</p>
                {report.budget.cutItems.map((c, i) => (
                  <p key={i} className="text-[11px] text-gray-400"><span className="text-red-300">{c.label}</span> — {c.reason}</p>
                ))}
              </div>
            )}
          </div>

          {report.warnings.map((w, i) => (
            <div key={i} className="rounded-lg border border-yellow-700/40 bg-yellow-950/20 px-3 py-2 text-[11px] text-yellow-300">{w}</div>
          ))}

          <div className="space-y-2">
            {report.lines.map(l => (
              <div key={l.key} className="rounded-xl border border-gray-700/50 bg-gray-900/50 px-4 py-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded border uppercase ${VERDICT_STYLE[l.verdict] ?? ""}`}>
                      {l.verdict.replace(/_/g, " ")}
                    </span>
                    <span className="text-sm font-semibold text-white">{l.label}</span>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-bold ${l.netGain >= 0 ? "text-emerald-400" : "text-red-400"}`}>{money(l.netGain)}</p>
                    <p className="text-[10px] text-gray-500">ROI {l.roiPct}% · risk-adj {l.riskAdjustedRoiPct}%</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 text-[10px] text-gray-500">
                  <span>Cost {money(l.cost)} <span className="text-gray-600">({money(l.costLow)}–{money(l.costHigh)})</span></span>
                  <span>Adds {money(l.valueAdded)}</span>
                  <span>{l.weeks}w · carry {money(l.holdingCost)}</span>
                  <span>confidence {l.confidence}</span>
                </div>
                {l.valueLostToCeiling > 0 && (
                  <p className="text-[11px] text-red-300 mt-1.5">⚠ {money(l.valueLostToCeiling)} of this cannot be recovered — it pushes past the ceiling.</p>
                )}
                <div className="mt-2 space-y-0.5">
                  {l.reasoning.slice(0, 3).map((r, i) => <p key={i} className="text-[11px] text-gray-400">· {r}</p>)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
