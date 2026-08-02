"use client"

import { useState, useMemo } from "react"

interface CreDealCalcInputs {
  purchasePrice: number
  grossAnnualIncome: number
  vacancyPct: number
  opexPct: number
  loanAmount: number
  interestRate: number
  amortizationYears: number
  closingCostsPct: number
}

interface CreDealResult {
  effectiveGrossIncome: number
  opex: number
  noi: number
  capRate: number
  annualDebtService: number
  dscr: number
  closingCosts: number
  totalCashInvested: number
  annualCashFlow: number
  cashOnCash: number
  dealGrade: "A" | "B" | "C" | "D" | "F"
  gradeColor: string
  gradeLabel: string
  flags: string[]
}

const INPUT = "w-full bg-gray-900/80 border border-gray-700/50 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/20"
const LABEL = "block text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1"

function fmt(n: number, pre = "$") {
  if (!isFinite(n)) return "—"
  return `${pre}${Math.round(n).toLocaleString()}`
}

function fmtDscr(dscr: number) {
  return isFinite(dscr) ? `${dscr.toFixed(2)}x` : "N/A (all-cash)"
}

const GRADE_COLORS: Record<string, string> = {
  A: "text-emerald-400 border-emerald-500/40 bg-emerald-500/10",
  B: "text-blue-300 border-blue-500/40 bg-blue-500/10",
  C: "text-yellow-300 border-yellow-500/40 bg-yellow-500/10",
  D: "text-orange-300 border-orange-500/40 bg-orange-500/10",
  F: "text-red-400 border-red-500/40 bg-red-500/10",
}

const GRADE_LABELS: Record<string, string> = {
  A: "Excellent Deal",
  B: "Good Deal",
  C: "Marginal Deal",
  D: "Thin Deal",
  F: "Pass",
}

// DSCR < 1.0 is an automatic F — lenders decline loans below 1.0 outright,
// so no cap-rate strength can offset it.
function grade(dscr: number, capRate: number): CreDealResult["dealGrade"] {
  if (isFinite(dscr) && dscr < 1.0) return "F"
  const dscrOk15 = !isFinite(dscr) || dscr >= 1.5
  const dscrOk125 = !isFinite(dscr) || dscr >= 1.25
  const dscrOk11 = !isFinite(dscr) || dscr >= 1.1
  if (dscrOk15 && capRate >= 8) return "A"
  if (dscrOk125 && capRate >= 6.5) return "B"
  if (dscrOk11 && capRate >= 5) return "C"
  return "D"
}

function annualDebtServiceFor(loanAmount: number, interestRate: number, amortizationYears: number): number {
  if (loanAmount <= 0) return 0
  const monthlyRate = interestRate / 100 / 12
  const n = amortizationYears * 12
  if (monthlyRate <= 0 || n <= 0) return loanAmount / Math.max(amortizationYears, 1)
  const monthlyPayment = (loanAmount * monthlyRate * Math.pow(1 + monthlyRate, n)) / (Math.pow(1 + monthlyRate, n) - 1)
  return monthlyPayment * 12
}

function calculate(inputs: CreDealCalcInputs): CreDealResult {
  const { purchasePrice, grossAnnualIncome, vacancyPct, opexPct, loanAmount, interestRate, amortizationYears, closingCostsPct } = inputs

  const effectiveGrossIncome = grossAnnualIncome * (1 - vacancyPct / 100)
  const opex = effectiveGrossIncome * (opexPct / 100)
  const noi = effectiveGrossIncome - opex
  const capRate = purchasePrice > 0 ? (noi / purchasePrice) * 100 : 0

  const annualDebtService = annualDebtServiceFor(loanAmount, interestRate, amortizationYears)
  const dscr = annualDebtService > 0 ? noi / annualDebtService : Infinity

  const closingCosts = purchasePrice * (closingCostsPct / 100)
  const downPayment = Math.max(purchasePrice - loanAmount, 0)
  const totalCashInvested = downPayment + closingCosts
  const annualCashFlow = noi - annualDebtService
  const cashOnCash = totalCashInvested > 0 ? (annualCashFlow / totalCashInvested) * 100 : 0

  const flags: string[] = []
  if (isFinite(dscr) && dscr < 1.0) flags.push("⚠ DSCR below 1.0 — lender will likely decline this loan")
  else if (isFinite(dscr) && dscr < 1.25) flags.push("⚠ Thin DSCR cushion — little room for vacancy or expense surprises")
  if (capRate < 5) flags.push(`⚠ Cap rate ${capRate.toFixed(1)}% is low for most commercial lenders' comfort zone`)
  if (vacancyPct < 3) flags.push("⚠ Vacancy assumption looks optimistic — verify against submarket data")
  if (cashOnCash < 6 && isFinite(dscr)) flags.push("⚠ Cash-on-cash below 6% — thin leveraged return")

  const g = grade(dscr, capRate)
  return {
    effectiveGrossIncome, opex, noi, capRate, annualDebtService, dscr,
    closingCosts, totalCashInvested, annualCashFlow, cashOnCash, flags,
    dealGrade: g, gradeColor: GRADE_COLORS[g], gradeLabel: GRADE_LABELS[g],
  }
}

interface Props {
  prefillAddress?: string
  prefillPurchasePrice?: number
  prefillNoi?: number
}

export default function CREDealCalculator({ prefillAddress, prefillPurchasePrice, prefillNoi }: Props) {
  const [inputs, setInputs] = useState<CreDealCalcInputs>({
    purchasePrice: prefillPurchasePrice ?? 0,
    grossAnnualIncome: prefillNoi ?? 0,
    vacancyPct: prefillNoi ? 0 : 5,
    opexPct: prefillNoi ? 0 : 35,
    loanAmount: 0,
    interestRate: 7,
    amortizationYears: 25,
    closingCostsPct: 3,
  })

  const result = useMemo(() => {
    if (inputs.purchasePrice <= 0 || inputs.grossAnnualIncome <= 0) return null
    return calculate(inputs)
  }, [inputs])

  function set<K extends keyof CreDealCalcInputs>(k: K, v: CreDealCalcInputs[K]) {
    setInputs(prev => ({ ...prev, [k]: v }))
  }

  return (
    <div className="bg-gray-900/60 border border-gray-700/40 rounded-2xl p-5 space-y-5">
      <div>
        <h3 className="text-sm font-bold text-white">CRE Deal Calculator</h3>
        {prefillAddress && <p className="text-[11px] text-gray-500 mt-0.5">{prefillAddress}</p>}
      </div>

      {/* Inputs grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className={LABEL}>Purchase Price</label>
          <input type="number" value={inputs.purchasePrice || ""} onChange={e => set("purchasePrice", Number(e.target.value))}
            placeholder="2000000" className={INPUT} />
        </div>
        <div>
          <label className={LABEL}>Gross Annual Income</label>
          <input type="number" value={inputs.grossAnnualIncome || ""} onChange={e => set("grossAnnualIncome", Number(e.target.value))}
            placeholder="240000" className={INPUT} />
        </div>
        <div>
          <label className={LABEL}>Vacancy %</label>
          <input type="number" value={inputs.vacancyPct} onChange={e => set("vacancyPct", Number(e.target.value))}
            step={0.5} min={0} max={50} className={INPUT} />
        </div>
        <div>
          <label className={LABEL}>Opex % of Gross</label>
          <input type="number" value={inputs.opexPct} onChange={e => set("opexPct", Number(e.target.value))}
            step={1} min={0} max={80} className={INPUT} />
        </div>
        <div>
          <label className={LABEL}>Loan Amount</label>
          <input type="number" value={inputs.loanAmount || ""} onChange={e => set("loanAmount", Number(e.target.value))}
            placeholder="0 = all-cash" className={INPUT} />
        </div>
        <div>
          <label className={LABEL}>Interest Rate %/yr</label>
          <input type="number" value={inputs.interestRate} onChange={e => set("interestRate", Number(e.target.value))}
            step={0.125} min={0} max={20} className={INPUT} />
        </div>
        <div>
          <label className={LABEL}>Amortization (yrs)</label>
          <input type="number" value={inputs.amortizationYears} onChange={e => set("amortizationYears", Number(e.target.value))}
            min={1} max={40} className={INPUT} />
        </div>
        <div>
          <label className={LABEL}>Closing Costs %</label>
          <input type="number" value={inputs.closingCostsPct} onChange={e => set("closingCostsPct", Number(e.target.value))}
            step={0.5} min={0} max={15} className={INPUT} />
        </div>
      </div>

      {/* Results */}
      {result ? (
        <div className="space-y-3">
          {/* Grade banner */}
          <div className={`flex items-center justify-between rounded-xl border px-4 py-3 ${result.gradeColor}`}>
            <div>
              <p className="text-xs font-semibold opacity-70">Deal Grade</p>
              <p className="text-lg font-black">{result.gradeLabel}</p>
            </div>
            <div className={`w-14 h-14 rounded-full border-2 flex items-center justify-center text-2xl font-black ${result.gradeColor}`}>
              {result.dealGrade}
            </div>
          </div>

          {/* Key metrics grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Metric label="NOI" value={fmt(result.noi)} highlight={result.noi > 0} />
            <Metric label="Cap Rate" value={`${result.capRate.toFixed(2)}%`} highlight={result.capRate >= 7} />
            <Metric label="DSCR" value={fmtDscr(result.dscr)} highlight={isFinite(result.dscr) && result.dscr >= 1.25} />
            <Metric label="Cash-on-Cash" value={`${result.cashOnCash.toFixed(1)}%`} highlight={result.cashOnCash >= 8} />
            <Metric label="Annual Debt Service" value={fmt(result.annualDebtService)} />
            <Metric label="Annual Cash Flow" value={fmt(result.annualCashFlow)} highlight={result.annualCashFlow > 0} />
            <Metric label="Total Cash Invested" value={fmt(result.totalCashInvested)} />
            <Metric label="Closing Costs" value={fmt(result.closingCosts)} />
          </div>

          {/* Flags */}
          {result.flags.length > 0 && (
            <div className="rounded-xl bg-amber-500/8 border border-amber-500/20 px-4 py-3 space-y-1">
              {result.flags.map((f, i) => (
                <p key={i} className="text-[11px] text-amber-300">{f}</p>
              ))}
            </div>
          )}

          {/* DSCR visual — 1.0 is the lender floor, 1.25 is a comfortable cushion */}
          {isFinite(result.dscr) && (
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] text-gray-500">
                <span>DSCR vs. lender floor</span>
                <span>{result.dscr.toFixed(2)}x</span>
              </div>
              <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${result.dscr >= 1.25 ? "bg-emerald-500" : result.dscr >= 1.0 ? "bg-yellow-500" : "bg-red-500"}`}
                  style={{ width: `${Math.min((result.dscr / 2) * 100, 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-[9px] text-gray-600">
                <span>0x</span><span className="text-red-600">1.0x</span><span className="text-yellow-600">1.25x</span><span>2.0x</span>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl bg-gray-800/40 border border-dashed border-gray-700/50 px-4 py-6 text-center">
          <p className="text-sm text-gray-500">Enter purchase price and gross annual income to calculate deal metrics</p>
        </div>
      )}
    </div>
  )
}

function Metric({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="bg-gray-800/50 border border-gray-700/30 rounded-xl px-3 py-2.5">
      <p className="text-[10px] text-gray-500 font-medium">{label}</p>
      <p className={`text-sm font-bold mt-0.5 ${highlight ? "text-emerald-400" : "text-white"}`}>{value}</p>
    </div>
  )
}
