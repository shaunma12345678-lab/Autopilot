"use client"

// Deal Simulator — runs thousands of negotiations in your browser to find the
// opening offer that maximizes your spread, the odds of a deal, and the likely
// settle range. Instant, pure math.

import { useState } from "react"
import { simulateNegotiation, type SimResult } from "@/lib/deal-simulator"

const money = (n: number) => (Number.isFinite(n) ? (Math.abs(n) >= 1000 ? `$${Math.round(n / 1000)}k` : `$${Math.round(n)}`) : "—")

function Field({ label, value, onChange, suffix }: { label: string; value: number; onChange: (n: number) => void; suffix?: string }) {
  return (
    <label className="block">
      <span className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</span>
      <div className="flex items-center bg-gray-800/60 border border-gray-700/50 rounded-lg mt-0.5">
        <input type="number" value={Number.isFinite(value) ? value : ""} onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))} className="w-full bg-transparent px-3 py-2 text-sm text-white outline-none" />
        {suffix && <span className="text-xs text-gray-500 pr-3">{suffix}</span>}
      </div>
    </label>
  )
}

export default function DealSimulator() {
  const [arv, setArv] = useState(300000)
  const [mao, setMao] = useState(180000)
  const [motivation, setMotivation] = useState(70)
  const [equity, setEquity] = useState(45)
  const [days, setDays] = useState(60)
  const [result, setResult] = useState<SimResult | null>(null)
  const [busy, setBusy] = useState(false)

  const run = () => {
    setBusy(true)
    // let the button state paint, then compute
    setTimeout(() => {
      setResult(simulateNegotiation({ arv, mao, motivation, equityPct: equity, daysToAuction: days }, 4000))
      setBusy(false)
    }, 20)
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-bold text-white">🎲 Deal Simulator</h3>
        <p className="text-sm text-gray-400 mt-0.5">Runs <b>thousands of simulated negotiations</b> against a modeled seller to find the opening offer that maximizes your spread — so you walk in already knowing the number. Practice the deal a few thousand times before you ever send a text.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-gray-900/60 border border-gray-700/40 rounded-2xl p-4 space-y-3">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">The deal</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="ARV" value={arv} onChange={setArv} suffix="$" />
            <Field label="Your max (MAO)" value={mao} onChange={setMao} suffix="$" />
            <Field label="Seller motivation" value={motivation} onChange={setMotivation} suffix="/100" />
            <Field label="Equity" value={equity} onChange={setEquity} suffix="%" />
            <Field label="Days to auction" value={days} onChange={setDays} suffix="d" />
          </div>
          <button onClick={run} disabled={busy} className="w-full text-sm font-semibold py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white">{busy ? "Simulating…" : "🎲 Run 4,000 negotiations"}</button>
        </div>

        <div className="bg-gradient-to-b from-violet-950/40 to-gray-900/60 border border-violet-500/30 rounded-2xl p-4">
          {!result ? (
            <p className="text-sm text-gray-500">Set the deal and run the simulation — the optimal opening offer and odds appear here.</p>
          ) : (
            <div className="space-y-3">
              <div>
                <p className="text-xs text-violet-200">Recommended opening offer</p>
                <p className="text-3xl font-extrabold text-white">{money(result.recommendedOpen)}</p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[
                  ["Deal odds", `${result.dealProb}%`],
                  ["Likely settle", money(result.expectedBuy)],
                  ["Range (p10–p90)", `${money(result.p10)}–${money(result.p90)}`],
                ].map(([k, v]) => (
                  <div key={k}><p className="text-[10px] text-gray-500 uppercase">{k}</p><p className="text-sm font-bold text-white">{v}</p></div>
                ))}
              </div>
              <p className="text-xs text-gray-300">{result.advice}</p>
              <p className="text-[10px] text-gray-500">Based on {result.runs.toLocaleString()} simulated negotiations. A modeled estimate — real sellers vary; confirm in conversation.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
