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
import { predictPreForeclosure } from "@/lib/predictive"
import { fuseSignals } from "@/lib/signal-fusion"
import { exitOptions } from "@/lib/exit-options"
import { dealBrief } from "@/lib/deal-brief"
import DealFinancing from "@/components/dashboard/DealFinancing"
import DealRisk from "@/components/dashboard/DealRisk"

// Today's 30-yr rate — fetched once per session (module cache), null until it lands.
let ratePromise: Promise<number | null> | null = null
function fetchTodayRate(): Promise<number | null> {
  if (!ratePromise) {
    ratePromise = fetch("/api/market/rate")
      .then((r) => r.json())
      .then((d) => (typeof d.rate30 === "number" ? d.rate30 : null))
      .catch(() => null)
  }
  return ratePromise
}

const chanceCls = (c: number) => (c >= 60 ? "bg-emerald-600 text-white" : c >= 40 ? "bg-amber-600 text-white" : "bg-gray-700 text-gray-300")

// 🧭 The per-property playbook: every way to make money on this one, ranked by
// the chance it actually pays — plus the refinance angle (seller's est. rate vs
// today's) that tells you whether the LOAN is the asset or the relief.
function ExitPlaybook({ lead }: { lead: ForeclosureLead }) {
  const [rate, setRate] = useState<number | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    const t = setTimeout(() => { void fetchTodayRate().then((r) => { if (alive) setRate(r) }) }, 0)
    return () => { alive = false; clearTimeout(t) }
  }, [])
  const pb = useMemo(() => exitOptions(lead, { todayRate: rate }), [lead, rate])
  const refi = pb.refi

  return (
    <div className="bg-indigo-950/25 border border-indigo-500/25 rounded-lg px-3 py-2.5 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-indigo-300 font-bold uppercase tracking-wide">🧭 Exit playbook — every way to make money here</span>
        {pb.best && <span className="text-[10px] font-bold text-emerald-300">Best: {pb.best.emoji} {pb.best.name}</span>}
      </div>

      <div className="space-y-1">
        {pb.options.map((o) => (
          <div key={o.key} className={`rounded-lg border px-2.5 py-1.5 ${o.viable ? "bg-gray-950/50 border-gray-800" : "bg-gray-950/30 border-gray-900 opacity-60"}`}>
            <button onClick={() => setOpen(open === o.key ? null : o.key)} className="w-full flex items-center gap-2 text-left">
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${chanceCls(o.moneyChance)}`} title="Chance this play makes money here">{o.moneyChance}%</span>
              <span className="text-[11px] font-semibold text-white shrink-0">{o.emoji} {o.name}</span>
              <span className="text-[11px] text-emerald-300 truncate flex-1">{o.headline}</span>
              {!o.viable && <span className="text-[9px] text-gray-600 shrink-0">not viable</span>}
              <span className="text-gray-600 text-[10px] shrink-0">{open === o.key ? "▾" : "▸"}</span>
            </button>
            {open === o.key && (
              <div className="mt-1.5 pl-1 space-y-0.5">
                {o.numbers.map((n, i) => <p key={i} className="text-[10px] text-gray-400">· {n}</p>)}
                <p className="text-[10px] text-gray-500 italic">{o.why}</p>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className={`rounded-lg border px-2.5 py-2 ${refi.direction === "locked-in" ? "bg-fuchsia-950/30 border-fuchsia-700/40" : refi.direction === "refi-relief" ? "bg-sky-950/30 border-sky-700/40" : "bg-gray-950/40 border-gray-800"}`}>
        <p className="text-[10px] font-bold uppercase tracking-wide mb-1 text-gray-300">
          💰 Refinance angle{refi.available && refi.sellerRate != null ? ` — seller ~${refi.sellerRate}% vs today ${refi.todayRate}%` : ""}
        </p>
        <p className="text-[10px] text-gray-300 leading-relaxed">{refi.angle}</p>
        {refi.available && (
          <p className="text-[10px] text-gray-500 mt-1">
            Est. balance {fmtMoney(refi.estBalance ?? 0)} · payment {fmtMoney(refi.currentPayment ?? 0)}/mo → {fmtMoney(refi.refiPayment ?? 0)}/mo refi
            {refi.cashOutAvailable != null && refi.cashOutAvailable > 0 ? ` · cash-out headroom ${fmtMoney(refi.cashOutAvailable)}` : ""}
            {refi.breakEvenMonths ? ` · breaks even ~${refi.breakEvenMonths}mo` : ""}
          </p>
        )}
        {refi.buyerNote && <p className="text-[10px] text-gray-500 mt-0.5">{refi.buyerNote}</p>}
      </div>
    </div>
  )
}

const SEV_CLS: Record<string, string> = {
  high: "bg-rose-950/50 border-rose-700/50 text-rose-200",
  medium: "bg-amber-950/40 border-amber-700/40 text-amber-200",
  low: "bg-gray-900/60 border-gray-700/50 text-gray-300",
}

// 🔬 Due diligence: what we know, every gap (with its dollar consequence and
// the exact button that fills it), the pre-offer checklist, and a plain-English
// explanation — deterministic from the numbers, nothing invented.
function DueDiligence({ lead, a }: { lead: ForeclosureLead; a: DealAnalysisType }) {
  const [expanded, setExpanded] = useState(false)
  const brief = useMemo(() => dealBrief(lead, a), [lead, a])
  const highGaps = brief.gaps.filter((g) => g.severity === "high").length

  return (
    <div className="bg-gray-900/60 border border-gray-700/50 rounded-lg px-3 py-2.5 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-gray-300 font-bold uppercase tracking-wide">🔬 Due diligence — what we know, what we don&apos;t</span>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${brief.confidence >= 70 ? "bg-emerald-600 text-white" : brief.confidence >= 45 ? "bg-amber-600 text-white" : "bg-gray-700 text-gray-200"}`} title={brief.confidenceLabel}>
          {brief.confidence}% verified
        </span>
      </div>

      {/* The explanation, in plain English */}
      <p className="text-[11px] text-gray-200 leading-relaxed">{brief.explanation}</p>
      <p className="text-[10px] text-gray-500 italic">{brief.sensitivity}</p>

      {/* Gaps — severity-ranked, each with the fix */}
      {brief.gaps.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Gaps {highGaps ? `· ${highGaps} high` : ""}</p>
          {brief.gaps.map((g) => (
            <div key={g.key} className={`rounded-lg border px-2 py-1.5 ${SEV_CLS[g.severity]}`}>
              <p className="text-[11px] font-semibold">{g.severity === "high" ? "⛔" : g.severity === "medium" ? "⚠️" : "▫️"} {g.label}</p>
              <p className="text-[10px] opacity-90">{g.why}</p>
              <p className="text-[10px] font-semibold mt-0.5">Fix: {g.fillWith}</p>
            </div>
          ))}
        </div>
      )}
      {brief.gaps.length === 0 && <p className="text-[10px] text-emerald-300">No data gaps — every core fact on this lead is filled.</p>}

      <button onClick={() => setExpanded((v) => !v)} className="text-[10px] text-indigo-300 hover:text-indigo-200 font-semibold">
        {expanded ? "Hide" : "Show"} verified facts ({brief.knowns.length}) &amp; pre-offer checklist ({brief.checklist.length})
      </button>
      {expanded && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div className="bg-gray-950/50 border border-gray-800 rounded-lg px-2 py-1.5">
            <p className="text-[10px] font-bold text-emerald-300 uppercase tracking-wide mb-1">✓ What we know</p>
            {brief.knowns.map((k) => (
              <p key={k.label} className="text-[10px] text-gray-300"><span className="text-gray-500">{k.label}:</span> {k.value}</p>
            ))}
            {brief.knowns.length === 0 && <p className="text-[10px] text-gray-600">Almost nothing yet — enrich this lead first.</p>}
          </div>
          <div className="bg-gray-950/50 border border-gray-800 rounded-lg px-2 py-1.5">
            <p className="text-[10px] font-bold text-sky-300 uppercase tracking-wide mb-1">☑ Before you offer</p>
            {brief.checklist.map((c) => (
              <p key={c.item} className="text-[10px] text-gray-300" title={c.because}>• {c.item} <span className="text-gray-600">— {c.because}</span></p>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

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

export default function DealAnalysis({ lead, apiHeaders }: { lead: ForeclosureLead; apiHeaders?: Record<string, string> }) {
  const [level, setLevel] = useState<RepairLevel>(() => recommendedRepairLevel(lead))
  // MAO target % is investor preference (spec: configurable, 70% rule default).
  const [maoPct, setMaoPct] = useState<number>(() => {
    if (typeof window === "undefined") return 0.7
    const saved = Number(window.localStorage.getItem("ap_mao_pct"))
    return saved >= 0.6 && saved <= 0.85 ? saved : 0.7
  })
  const pickMaoPct = (p: number) => {
    setMaoPct(p)
    try { window.localStorage.setItem("ap_mao_pct", String(p)) } catch { /* preference only */ }
  }
  const a = useMemo(() => analyzeDeal(lead, level, { maoPct }), [lead, level, maoPct])

  const stat = (label: string, value: string, accent?: string) => (
    <div className="bg-gray-900/50 rounded-lg px-2.5 py-1.5">
      <div className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</div>
      <div className={`text-sm font-bold ${accent ?? "text-white"}`}>{value}</div>
    </div>
  )

  // Equity bar: debt portion vs equity portion of ARV.
  const debtPct = a.arv > 0 ? Math.min(100, Math.round((a.totalDebt / a.arv) * 100)) : 100

  const pred = predictPreForeclosure(lead)
  const fusion = fuseSignals(lead)
  const FUSION_CLR: Record<string, string> = {
    verified: "bg-emerald-500/15 border-emerald-500/40 text-emerald-200",
    strong:   "bg-lime-500/15 border-lime-500/40 text-lime-200",
    single:   "bg-amber-500/10 border-amber-500/30 text-amber-200",
    thin:     "bg-gray-700/30 border-gray-600/40 text-gray-300",
  }
  const VERDICT_CLR: Record<string, string> = {
    Pursue: "bg-emerald-500/20 border-emerald-500/40 text-emerald-200",
    Negotiate: "bg-amber-500/20 border-amber-500/40 text-amber-200",
    Pass: "bg-red-500/15 border-red-500/40 text-red-300",
    Underwrite: "bg-sky-500/15 border-sky-500/40 text-sky-300",
  }

  return (
    <div className="space-y-3">
      {/* The verdict — "would a pro buy this?" */}
      <div className={`rounded-lg px-3 py-2 border ${VERDICT_CLR[a.verdict.call]}`}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-extrabold">{a.verdict.call === "Pursue" ? "✅" : a.verdict.call === "Negotiate" ? "🤝" : a.verdict.call === "Pass" ? "🛑" : "🔎"} {a.verdict.call}</span>
          {a.hasValue && <span className="text-[11px]">Profit ~{fmtMoney(a.profitRange.likely)} <span className="opacity-70">({fmtMoney(a.profitRange.low)}–{fmtMoney(a.profitRange.high)})</span></span>}
        </div>
        <div className="text-[11px] opacity-90 mt-0.5">{a.verdict.reason}</div>
      </div>

      {/* Predicted pre-foreclosure — clearly OUR forecast, not a filed case */}
      {pred.predicted && (
        <div className="bg-fuchsia-950/40 border border-fuchsia-500/30 rounded-lg px-3 py-2">
          <div className="text-[11px] font-extrabold text-fuchsia-300">🔮 PREDICTED PRE-FORECLOSURE</div>
          <div className="text-[11px] text-fuchsia-100 mt-0.5">{pred.probability}% likely · {pred.timeframe} · {pred.confidence} confidence</div>
          <div className="text-[10px] text-fuchsia-200/80 mt-1">Signals: {pred.factors.join(", ")}</div>
          <div className="text-[9.5px] text-fuchsia-300/70 italic mt-1">⚠ Our forecast from early-warning signals — NOT a filed foreclosure. Verify before acting.</div>
        </div>
      )}

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

      {/* Signal-fusion confidence — cross-source corroboration */}
      {fusion.count > 0 && (
        <div className={`rounded-lg px-3 py-2 border ${FUSION_CLR[fusion.level]}`}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold">🧬 Signal confidence: {fusion.confidence}%{fusion.corroborated ? " · corroborated" : ""}</span>
            <span className="text-[10px] opacity-80">{fusion.count} independent signal{fusion.count === 1 ? "" : "s"}</span>
          </div>
          <div className="text-[10px] opacity-90 mt-0.5">{fusion.categories.join(" · ")}</div>
          {fusion.corroborated && <div className="text-[9.5px] opacity-70 mt-0.5">Multiple independent sources agree — far more certain than a single list.</div>}
        </div>
      )}

      {/* Value provenance — be transparent about where the number came from */}
      <div className="flex items-center gap-1.5 text-[10px]">
        <span className="text-gray-600">Value source:</span>
        <span className={lead.avmValue ? "text-emerald-300" : a.valueEstimated ? "text-sky-300" : "text-gray-400"}>
          {lead.avmValue ? "Live AVM" : (lead.valuationSource || (a.valueEstimated ? "Computed estimate" : "Search estimate"))}
        </span>
        {lead.avmConfidence ? <span className="text-gray-600">· {lead.avmConfidence}% conf</span> : a.valueEstimated ? <span className="text-gray-600">· ~est</span> : null}
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
        <div className="flex items-center gap-1.5 mt-2">
          <span className="text-[11px] text-gray-500">MAO rule:</span>
          {[0.65, 0.7, 0.75, 0.8].map((p) => (
            <button key={p} onClick={() => pickMaoPct(p)} title={`MAO = ARV × ${Math.round(p * 100)}% − repairs − fee`}
              className={`px-2 py-1 rounded-lg text-[11px] font-semibold ${maoPct === p ? "bg-indigo-600 text-white" : "bg-gray-800/70 text-gray-400 hover:text-white"}`}>
              {Math.round(p * 100)}%
            </button>
          ))}
          <span className="text-[10px] text-gray-600">competitive markets run 75-80%, thin ones 65-70%</span>
        </div>
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

      {/* Comparable properties (our own comp engine) */}
      {lead.comps && lead.comps.length > 0 && (
        <div>
          <div className="text-[11px] text-gray-500 mb-1">📊 Comparable properties ({lead.comps.length})</div>
          <div className="space-y-0.5">
            {lead.comps.slice(0, 5).map((c, i) => (
              <div key={i} className="flex justify-between text-[11px]">
                <span className="text-gray-400 truncate max-w-[200px]">{c.address}</span>
                <span className="text-gray-300">{fmtMoney(c.price)}{c.sqft ? ` · ${c.sqft} sqft` : ""}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cash-buyer matches */}
      <BuyerMatch lead={lead} a={a} />

      {/* 🔬 What we know, the gaps, and the pre-offer checklist */}
      <DueDiligence lead={lead} a={a} />

      {/* 🧭 Every exit, ranked by chance of profit + the refinance angle */}
      <ExitPlaybook lead={lead} />

      {/* 💳 Every way to fund the purchase, ranked by fit */}
      <DealFinancing lead={lead} />

      {/* 🛑 The downside story: flood, law, title, market, timing */}
      <DealRisk lead={lead} apiHeaders={apiHeaders} />

      {/* Narrative */}
      <p className="text-[11px] text-gray-300 italic bg-gray-900/50 rounded-lg px-3 py-2">{a.narrative}</p>
    </div>
  )
}
