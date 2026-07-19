"use client"

// 💳 Deal Financing panel — every realistic way to FUND this purchase, ranked
// by fit, with down payment / monthly / cash-to-close at today's real rate.
// Sits beside the Exit Playbook (which covers how you MAKE money).

import { useEffect, useMemo, useState } from "react"
import type { ForeclosureLead } from "@/lib/agents/foreclosure-agent"
import { financingPlan } from "@/lib/deal-financing"

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

const fitCls = (f: number) => (f >= 60 ? "bg-emerald-600 text-white" : f >= 40 ? "bg-amber-600 text-white" : "bg-gray-700 text-gray-300")
const money = (n: number) => `$${Math.round(n).toLocaleString()}`

export default function DealFinancing({ lead }: { lead: ForeclosureLead }) {
  const [rate, setRate] = useState<number | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    const t = setTimeout(() => { void fetchTodayRate().then((r) => { if (alive) setRate(r) }) }, 0)
    return () => { alive = false; clearTimeout(t) }
  }, [])
  const plan = useMemo(() => financingPlan(lead, { todayRate: rate }), [lead, rate])

  return (
    <div className="bg-sky-950/25 border border-sky-500/25 rounded-lg px-3 py-2.5 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-sky-300 font-bold uppercase tracking-wide">💳 Financing — how to fund this deal{plan.todayRate != null ? ` (today: ${plan.todayRate}%)` : ""}</span>
      </div>
      <p className="text-[11px] text-gray-200">{plan.headline}</p>

      <div className="space-y-1">
        {plan.options.map((o) => (
          <div key={o.key} className={`rounded-lg border px-2.5 py-1.5 ${o.viable ? "bg-gray-950/50 border-gray-800" : "bg-gray-950/30 border-gray-900 opacity-60"}`}>
            <button onClick={() => setOpen(open === o.key ? null : o.key)} className="w-full flex items-center gap-2 text-left">
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${fitCls(o.fit)}`} title="How well this funding fits this deal">{o.fit}</span>
              <span className="text-[11px] font-semibold text-white shrink-0">{o.emoji} {o.name}</span>
              <span className="text-[11px] text-sky-200 truncate flex-1">{o.headline}</span>
              {o.cashToClose != null && <span className="text-[10px] text-gray-500 shrink-0">{money(o.cashToClose)} in</span>}
              {!o.viable && <span className="text-[9px] text-gray-600 shrink-0">not viable</span>}
              <span className="text-gray-600 text-[10px] shrink-0">{open === o.key ? "▾" : "▸"}</span>
            </button>
            {open === o.key && (
              <div className="mt-1.5 pl-1 space-y-0.5">
                <p className="text-[10px] text-gray-500">Best for: {o.bestFor}{o.monthly != null ? ` · ~${money(o.monthly)}/mo` : ""}{o.ratePct != null ? ` @ ~${o.ratePct}%` : ""}</p>
                {o.numbers.map((n, i) => <p key={i} className="text-[10px] text-gray-400">· {n}</p>)}
                <p className="text-[10px] text-gray-500 italic">{o.why}</p>
                {o.caution && <p className="text-[10px] text-amber-300">⚠ {o.caution}</p>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
