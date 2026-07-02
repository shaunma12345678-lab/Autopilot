"use client"

// Rental Calculator — the numbers done for them. A clean interactive
// underwriting calculator: purchase + rehab + rent + financing + operating
// costs → cash flow, cap rate, cash-on-cash, DSCR, the 1% rule, and the BRRRR
// refinance. Pure math, no network — instant and error-proof.

import { useState } from "react"

const money = (n: number) => {
  if (!Number.isFinite(n)) return "—"
  const a = Math.abs(n), s = n < 0 ? "-" : ""
  if (a >= 1_000_000) return `${s}$${(a / 1_000_000).toFixed(2)}M`
  if (a >= 1_000) return `${s}$${Math.round(a / 1_000)}k`
  return `${s}$${Math.round(a)}`
}
const pct = (n: number) => (Number.isFinite(n) ? `${Math.round(n * 10) / 10}%` : "—")

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

export default function RentalCalculator() {
  // Acquisition
  const [purchase, setPurchase] = useState(200000)
  const [rehab, setRehab]       = useState(25000)
  const [arv, setArv]           = useState(275000)
  const [closingPct, setClosingPct] = useState(3)
  // Income
  const [rent, setRent]         = useState(2000)
  const [otherIncome, setOtherIncome] = useState(0)
  // Financing
  const [allCash, setAllCash]   = useState(false)
  const [downPct, setDownPct]   = useState(20)
  const [rate, setRate]         = useState(7.0)
  const [termYrs, setTermYrs]   = useState(30)
  // Operating (annual $ or %)
  const [taxYr, setTaxYr]       = useState(3000)
  const [insYr, setInsYr]       = useState(1500)
  const [vacancyPct, setVacancyPct] = useState(5)
  const [mgmtPct, setMgmtPct]   = useState(8)
  const [maintPct, setMaintPct] = useState(5)
  const [otherMo, setOtherMo]   = useState(0)

  // ── Math ────────────────────────────────────────────────────────────────
  const closingCosts = purchase * (closingPct / 100)
  const loan = allCash ? 0 : purchase * (1 - downPct / 100)
  const downPayment = allCash ? purchase : purchase * (downPct / 100)
  const cashInvested = downPayment + rehab + closingCosts

  const r = rate / 100 / 12, n = termYrs * 12
  const piMonthly = loan > 0 && r > 0 ? (loan * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1) : 0

  const grossMo = rent + otherIncome
  const vacancy = grossMo * (vacancyPct / 100)
  const mgmt = grossMo * (mgmtPct / 100)
  const maint = grossMo * (maintPct / 100)
  const taxIns = (taxYr + insYr) / 12
  const opExMo = vacancy + mgmt + maint + taxIns + otherMo
  const noiMo = grossMo - opExMo
  const noiYr = noiMo * 12
  const cashFlowMo = noiMo - piMonthly
  const cashFlowYr = cashFlowMo * 12

  const capRate = arv > 0 ? (noiYr / arv) * 100 : 0
  const cashOnCash = cashInvested > 0 ? (cashFlowYr / cashInvested) * 100 : 0
  const dscr = piMonthly > 0 ? noiMo / piMonthly : 0
  const grossYield = arv > 0 ? (grossMo * 12) / arv * 100 : 0
  const onePct = purchase > 0 ? (rent / purchase) * 100 : 0

  // BRRRR refi at 75% ARV
  const refiLoan = arv * 0.75
  const allIn = purchase + rehab + closingCosts
  const cashLeft = Math.max(0, allIn - refiLoan)
  const infinite = cashLeft <= 0

  const grade = cashOnCash >= 10 && cashFlowMo > 0 ? "A" : cashFlowMo > 0 && capRate >= 5 ? "B" : cashFlowMo > 0 ? "C" : "D"
  const gradeClr: Record<string, string> = { A: "text-emerald-300", B: "text-lime-300", C: "text-amber-300", D: "text-red-300" }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-bold text-white">🧮 Rental Calculator</h3>
        <p className="text-sm text-gray-400 mt-0.5">The numbers done for you — cash flow, cap rate, cash-on-cash, DSCR, the 1% rule, and the BRRRR refinance. Adjust anything and it recomputes instantly.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Inputs */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-gray-900/60 border border-gray-700/40 rounded-2xl p-4">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Acquisition</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Field label="Purchase" value={purchase} onChange={setPurchase} suffix="$" />
              <Field label="Rehab" value={rehab} onChange={setRehab} suffix="$" />
              <Field label="ARV" value={arv} onChange={setArv} suffix="$" />
              <Field label="Closing" value={closingPct} onChange={setClosingPct} suffix="%" />
            </div>
          </div>

          <div className="bg-gray-900/60 border border-gray-700/40 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Financing</p>
              <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
                <input type="checkbox" checked={allCash} onChange={(e) => setAllCash(e.target.checked)} className="accent-indigo-500" /> All cash
              </label>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Field label="Down" value={downPct} onChange={setDownPct} suffix="%" />
              <Field label="Rate" value={rate} onChange={setRate} suffix="%" />
              <Field label="Term" value={termYrs} onChange={setTermYrs} suffix="yr" />
            </div>
          </div>

          <div className="bg-gray-900/60 border border-gray-700/40 rounded-2xl p-4">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Income & Operating</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Field label="Rent /mo" value={rent} onChange={setRent} suffix="$" />
              <Field label="Other /mo" value={otherIncome} onChange={setOtherIncome} suffix="$" />
              <Field label="Tax /yr" value={taxYr} onChange={setTaxYr} suffix="$" />
              <Field label="Insurance /yr" value={insYr} onChange={setInsYr} suffix="$" />
              <Field label="Vacancy" value={vacancyPct} onChange={setVacancyPct} suffix="%" />
              <Field label="Mgmt" value={mgmtPct} onChange={setMgmtPct} suffix="%" />
              <Field label="Maintenance" value={maintPct} onChange={setMaintPct} suffix="%" />
              <Field label="Other /mo" value={otherMo} onChange={setOtherMo} suffix="$" />
            </div>
          </div>
        </div>

        {/* Results */}
        <div className="space-y-3">
          <div className="bg-gradient-to-b from-indigo-950/50 to-gray-900/60 border border-indigo-500/30 rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-indigo-200">Monthly cash flow</p>
              <span className={`text-2xl font-extrabold ${cashFlowMo >= 0 ? "text-emerald-300" : "text-red-300"}`}>{money(cashFlowMo)}</span>
            </div>
            <p className="text-[11px] text-gray-500 mt-1">{money(cashFlowYr)}/yr · Deal grade <b className={gradeClr[grade]}>{grade}</b></p>
          </div>

          <div className="bg-gray-900/60 border border-gray-700/40 rounded-2xl p-4 grid grid-cols-2 gap-3">
            {[
              ["Cash-on-cash", pct(cashOnCash)],
              ["Cap rate", pct(capRate)],
              ["DSCR", dscr ? dscr.toFixed(2) : "—"],
              ["Gross yield", pct(grossYield)],
              ["1% rule", `${onePct.toFixed(2)}%`],
              ["Cash invested", money(cashInvested)],
              ["Mortgage /mo", money(piMonthly)],
              ["NOI /yr", money(noiYr)],
            ].map(([k, v]) => (
              <div key={k}>
                <p className="text-[10px] text-gray-500 uppercase tracking-wide">{k}</p>
                <p className="text-sm font-bold text-white">{v}</p>
              </div>
            ))}
          </div>

          <div className="bg-emerald-950/20 border border-emerald-500/25 rounded-2xl p-4">
            <p className="text-sm font-semibold text-emerald-200 mb-1">BRRRR refinance (75% ARV)</p>
            <div className="grid grid-cols-2 gap-3">
              <div><p className="text-[10px] text-gray-500 uppercase">All-in</p><p className="text-sm font-bold text-white">{money(allIn)}</p></div>
              <div><p className="text-[10px] text-gray-500 uppercase">Refi pulls out</p><p className="text-sm font-bold text-white">{money(refiLoan)}</p></div>
              <div className="col-span-2"><p className="text-[10px] text-gray-500 uppercase">Cash left in deal</p><p className={`text-sm font-bold ${infinite ? "text-emerald-300" : "text-white"}`}>{money(cashLeft)}{infinite ? " ♾️ (capital fully recycled)" : ""}</p></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
