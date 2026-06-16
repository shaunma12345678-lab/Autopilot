"use client"

// Visual deal underwrite for a single lead: grade, MAO, wholesale spread, flip
// profit, an interactive repair-scope toggle that recomputes live, an equity
// position bar, the 5-factor score breakdown, exit strategy, and risk flags.
// Pure presentation over lib/deal-analysis (no network).

import { useEffect, useMemo, useState } from "react"
import type { ForeclosureLead } from "@/lib/agents/foreclosure-agent"
import {
  analyzeDeal, recommendedRepairLevel, REPAIR_LABEL, fmtMoney,
  type RepairLevel, type DealAnalysis as DealAnalysisType,
} from "@/lib/deal-analysis"
import { loadBuyers, matchBuyers, BUYERS_EVENT, type Buyer } from "@/lib/buyers"

// Shows which of your saved cash buyers fit this deal — instant disposition.
function BuyerMatch({ lead, a }: { lead: ForeclosureLead; a: DealAnalysisType }) {
  const [buyers, setBuyers] = useState<Buyer[]>([])
  useEffect(() => {
    const sync = () => setBuyers(loadBuyers())
    sync()
    window.addEventListener(BUYERS_EVENT, sync)
    return () => window.removeEventListener(BUYERS_EVENT, sync)
  }, [])
  if (!buyers.length) return null
  const fits = matchBuyers(lead, a, buyers)
  return (
    <div className="bg-cyan-950/30 border border-cyan-500/25 rounded-lg px-3 py-2">
      <div className="text-[10px] text-cyan-400 font-bold uppercase tracking-wide mb-1">💼 Cash buyers ({fits.length})</div>
      {fits.length === 0
        ? <div className="text-[11px] text-gray-500">No saved buyer fits this deal yet.</div>
        : <div className="flex flex-wrap gap-1.5">
            {fits.map((b) => <span key={b.id} className="text-[10px] px-2 py-0.5 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-200" title={b.contact}>{b.name}</span>)}
          </div>}
    </div>
  )
}

const GRADE_COLOR: Record<string, string> = {
  A: "bg-emerald-500 text-emerald-950",
  B: "bg-lime-500 text-lime-950",
  C: "bg-amber-500 text-amber-950",
  D: "bg-orange-500 text-orange-950",
  F: "bg-red-500 text-red-950",
}

export default function DealAnalysis({ lead }: { lead: ForeclosureLead }) {
  const [level, setLevel] = useState<RepairLevel>(() => recommendedRepairLevel(lead))
  const a = useMemo(() => analyzeDeal(lead, level), [lead, level])

  const stat = (label: string, value: string, accent?: string) => (
    <div className="bg-gray-900/50 rounded-lg px-2.5 py-1.5">
      <div className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</div>
      <div className={`text-sm font-bold ${accent ?? "text-white"}`}>{value}</div>
    </div>
  )

  // Equity bar: debt portion vs equity portion of ARV.
  const debtPct = a.arv > 0 ? Math.min(100, Math.round((a.totalDebt / a.arv) * 100)) : 100

  return (
    <div className="space-y-3">
      {/* Headline: grade + MAO + spread/profit */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-extrabold text-lg ${GRADE_COLOR[a.grade]}`}>{a.grade}</div>
        <div>
          <div className="text-[11px] text-gray-500">Max Allowable Offer (70% rule)</div>
          <div className="text-xl font-extrabold text-white">{a.hasValue ? fmtMoney(a.mao) : "—"}</div>
        </div>
        <div className="ml-auto text-right">
          <div className="text-[11px] text-gray-500">{a.headlineLabel}{a.headlineLabel === "Flip profit" && a.hasValue ? ` · ${a.roiPct}% ROI` : ""}</div>
          <div className={`text-lg font-bold ${a.headlineProfit > 0 ? "text-emerald-400" : "text-red-400"}`}>
            {a.hasValue ? fmtMoney(a.headlineProfit) : "—"}
          </div>
        </div>
      </div>

      {/* Distressed? */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-gray-500">Distressed:</span>
        {a.distressed
          ? <span className="text-red-300 font-semibold">✓ Yes — {a.distressType}</span>
          : <span className="text-gray-400">not flagged</span>}
      </div>

      {(a.chronic || a.debtEstimated) && (
        <div className="flex flex-wrap gap-1.5">
          {a.chronic && <span className="text-[10px] px-2 py-0.5 rounded-lg bg-fuchsia-500/15 border border-fuchsia-500/30 text-fuchsia-300">🔁 Repeat/chronic distress — highly motivated</span>}
          {a.debtEstimated && <span className="text-[10px] px-2 py-0.5 rounded-lg bg-sky-500/15 border border-sky-500/30 text-sky-300">≈ Debt estimated from mortgage payoff</span>}
        </div>
      )}

      {/* Why it's a good deal */}
      {a.whyGood.length > 0 && (
        <div className="bg-emerald-950/30 border border-emerald-500/25 rounded-lg px-3 py-2">
          <div className="text-[10px] text-emerald-400 font-bold uppercase tracking-wide mb-1">Why it&apos;s a good deal</div>
          <div className="space-y-0.5">
            {a.whyGood.map((w, i) => <div key={i} className="text-[11px] text-emerald-100/90">✓ {w}</div>)}
          </div>
        </div>
      )}

      {!a.hasValue && (
        <div className="text-[11px] text-amber-300/90 bg-amber-950/40 border border-amber-500/25 rounded-lg px-3 py-2">
          No value estimate for this property yet — numbers are partial. Run <span className="font-semibold">Live Valuation</span> to fully underwrite it.
        </div>
      )}

      {/* Repair scope toggle — recomputes MAO live */}
      <div>
        <div className="text-[11px] text-gray-500 mb-1">Rehab scope (drag the scope to re-underwrite):</div>
        <div className="flex gap-1.5">
          {(["light", "medium", "heavy"] as RepairLevel[]).map((lv) => (
            <button key={lv} onClick={() => setLevel(lv)} title={REPAIR_LABEL[lv]}
              className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${level === lv ? "bg-indigo-600 text-white" : "bg-gray-800/70 text-gray-400 hover:text-white"}`}>
              {lv}
            </button>
          ))}
        </div>
        <div className="text-[10px] text-gray-600 mt-1">{REPAIR_LABEL[level]} → {fmtMoney(a.repairCost)} estimated</div>
      </div>

      {/* Number grid */}
      <div className="grid grid-cols-3 gap-2">
        {stat(a.valueEstimated ? "ARV (est.)" : "ARV", a.hasValue ? fmtMoney(a.arv) : "—", a.valueEstimated ? "text-sky-300" : "text-white")}
        {stat("Repairs", fmtMoney(a.repairCost), "text-orange-300")}
        {stat("Total debt", fmtMoney(a.totalDebt), "text-red-300")}
        {stat("Equity", a.hasValue ? `${a.equityPercent}%` : "—", "text-emerald-300")}
        {stat("Flip ROI", a.hasValue ? `${a.roiPct}%` : "—", a.roiPct >= 15 ? "text-emerald-300" : "text-gray-300")}
        {stat("Motivation", `${a.motivation}/100`, a.motivation >= 70 ? "text-red-300" : a.motivation >= 45 ? "text-amber-300" : "text-gray-300")}
      </div>

      {/* Equity position bar */}
      {a.hasValue && (
        <div>
          <div className="flex justify-between text-[10px] text-gray-500 mb-1">
            <span>Debt {fmtMoney(a.totalDebt)}</span><span>Value {fmtMoney(a.arv)}</span>
          </div>
          <div className="h-3 rounded-full overflow-hidden bg-emerald-600/70 flex">
            <div className="h-full bg-red-500/80" style={{ width: `${debtPct}%` }} />
          </div>
          <div className="text-[10px] text-gray-600 mt-0.5">Green = your negotiating room (equity). Red = what&apos;s owed.</div>
        </div>
      )}

      {/* Exit strategy */}
      <div className="bg-indigo-950/40 border border-indigo-500/25 rounded-lg px-3 py-2">
        <div className="text-[11px] text-indigo-300 font-semibold">🎯 Best exit: {a.exit.strategy}</div>
        <div className="text-[11px] text-gray-400 mt-0.5">{a.exit.why}</div>
      </div>

      {/* Rental analysis (buy & hold) */}
      {a.rental && (
        <div className="bg-gray-900/50 rounded-lg px-3 py-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] text-gray-400 font-semibold">🏦 Rental (buy &amp; hold)</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${a.rental.onePercent ? "bg-emerald-500/20 text-emerald-300" : "bg-gray-700/50 text-gray-400"}`}>{a.rental.onePercent ? "✓ passes 1% rule" : "below 1% rule"}</span>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center">
            <div><div className="text-[9px] text-gray-500">Rent/mo</div><div className="text-xs font-bold text-white">{fmtMoney(a.rental.rent)}</div></div>
            <div><div className="text-[9px] text-gray-500">Cap rate</div><div className={`text-xs font-bold ${a.rental.capRate >= 6 ? "text-emerald-300" : "text-gray-300"}`}>{a.rental.capRate}%</div></div>
            <div><div className="text-[9px] text-gray-500">Cash flow</div><div className={`text-xs font-bold ${a.rental.cashFlowMo > 0 ? "text-emerald-300" : "text-red-300"}`}>{fmtMoney(a.rental.cashFlowMo)}</div></div>
            <div><div className="text-[9px] text-gray-500">DSCR</div><div className={`text-xs font-bold ${a.rental.dscr >= 1.2 ? "text-emerald-300" : "text-amber-300"}`}>{a.rental.dscr}</div></div>
          </div>
        </div>
      )}

      {/* Score breakdown */}
      <div>
        <div className="text-[11px] text-gray-500 mb-1.5">Why it scored {lead.score}/100:</div>
        <div className="space-y-1">
          {a.scoreParts.map((p) => (
            <div key={p.key} className="flex items-center gap-2">
              <span className="text-[10px] text-gray-400 w-28 shrink-0">{p.label}</span>
              <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-indigo-500" style={{ width: `${p.pct}%` }} />
              </div>
              <span className="text-[10px] text-gray-500 w-10 text-right tabular-nums">{p.value}/{p.max}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Risk flags */}
      {a.risks.length > 0 && (
        <div>
          <div className="text-[11px] text-gray-500 mb-1">⚠ Risks to verify:</div>
          <div className="flex flex-wrap gap-1.5">
            {a.risks.map((r, i) => (
              <span key={i} className={`text-[10px] px-2 py-0.5 rounded-lg border ${r.severity === "high" ? "bg-red-500/15 border-red-500/30 text-red-300" : "bg-amber-500/15 border-amber-500/30 text-amber-300"}`}>
                {r.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Cash-buyer matches */}
      <BuyerMatch lead={lead} a={a} />

      {/* Narrative */}
      <p className="text-[11px] text-gray-300 italic bg-gray-900/50 rounded-lg px-3 py-2">{a.narrative}</p>
    </div>
  )
}
