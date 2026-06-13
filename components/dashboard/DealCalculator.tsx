"use client"

import { useState, useMemo } from "react"

interface DealCalcInputs {
  arv: number
  purchasePrice: number
  rehabCost: number
  holdingMonths: number
  closingCostsPct: number
  financingRate: number
  exitStrategy: "flip" | "wholesale" | "rental"
  monthlyRent?: number
  capRateTarget?: number
}

interface DealResult {
  maxOffer70: number
  maxOffer65: number
  wholesaleFee: number
  rehabROI: number
  totalCost: number
  netProfit: number
  roi: number
  cashOnCash?: number
  grossRentYield?: number
  dealGrade: "A" | "B" | "C" | "D" | "F"
  gradeColor: string
  gradeLabel: string
  holdingCost: number
  closingCosts: number
  flags: string[]
}

const INPUT = "w-full bg-gray-900/80 border border-gray-700/50 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/20"
const LABEL = "block text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1"

function fmt(n: number, pre = "$", dec = 0) {
  if (!isFinite(n)) return "—"
  return `${pre}${Math.round(n).toLocaleString()}${dec > 0 ? `.${n.toFixed(dec).split(".")[1]}` : ""}`
}

function grade(roi: number, profit: number, exitStrategy: string): DealResult["dealGrade"] {
  if (exitStrategy === "rental") {
    if (roi >= 12) return "A"
    if (roi >= 8) return "B"
    if (roi >= 5) return "C"
    if (roi >= 2) return "D"
    return "F"
  }
  if (profit >= 50000 && roi >= 20) return "A"
  if (profit >= 30000 && roi >= 15) return "B"
  if (profit >= 15000 && roi >= 10) return "C"
  if (profit >= 5000) return "D"
  return "F"
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

function calculate(inputs: DealCalcInputs): DealResult {
  const { arv, purchasePrice, rehabCost, holdingMonths, closingCostsPct, financingRate, exitStrategy, monthlyRent, capRateTarget } = inputs
  const closingCosts = arv * (closingCostsPct / 100)
  const holdingCost = (purchasePrice * (financingRate / 100) / 12) * holdingMonths
  const totalCost = purchasePrice + rehabCost + closingCosts + holdingCost

  const maxOffer70 = arv * 0.70 - rehabCost
  const maxOffer65 = arv * 0.65 - rehabCost
  const wholesaleFee = maxOffer70 - purchasePrice

  const flags: string[] = []

  if (exitStrategy === "flip") {
    const saleNet = arv - closingCosts
    const netProfit = saleNet - totalCost
    const roi = totalCost > 0 ? (netProfit / totalCost) * 100 : 0
    const rehabROI = rehabCost > 0 ? ((arv - purchasePrice - closingCosts) / rehabCost) * 100 : 0

    if (purchasePrice > maxOffer70) flags.push("⚠ Over 70% ARV rule — higher risk")
    if (rehabCost > arv * 0.3) flags.push("⚠ Heavy rehab — verify contractor bids")
    if (holdingMonths > 6) flags.push("⚠ Long hold — carrying costs mount")
    if (netProfit < 20000) flags.push("⚠ Thin margin — leave room for surprises")

    const g = grade(roi, netProfit, "flip")
    return {
      maxOffer70, maxOffer65, wholesaleFee, rehabROI, totalCost,
      netProfit, roi, holdingCost, closingCosts, flags,
      dealGrade: g, gradeColor: GRADE_COLORS[g], gradeLabel: GRADE_LABELS[g],
    }
  }

  if (exitStrategy === "wholesale") {
    const netProfit = wholesaleFee
    const roi = purchasePrice > 0 ? (netProfit / purchasePrice) * 100 : 0

    if (wholesaleFee < 5000) flags.push("⚠ Fee below $5k — hard to find a buyer")
    if (purchasePrice > maxOffer65) flags.push("⚠ Over 65% ARV — end buyer won't pencil")

    const g = grade(roi, netProfit, "wholesale")
    return {
      maxOffer70, maxOffer65, wholesaleFee, rehabROI: 0, totalCost: purchasePrice,
      netProfit, roi, holdingCost: 0, closingCosts, flags,
      dealGrade: g, gradeColor: GRADE_COLORS[g], gradeLabel: GRADE_LABELS[g],
    }
  }

  // Rental
  const annualRent = (monthlyRent ?? 0) * 12
  const capRate = arv > 0 ? (annualRent / arv) * 100 : 0
  const grossRentYield = totalCost > 0 ? (annualRent / totalCost) * 100 : 0
  const annualCashFlow = annualRent - holdingCost * 12
  const cashOnCash = totalCost > 0 ? (annualCashFlow / totalCost) * 100 : 0
  const targetCapRate = capRateTarget ?? 6

  if (capRate < targetCapRate) flags.push(`⚠ Cap rate ${capRate.toFixed(1)}% below your ${targetCapRate}% target`)
  if (monthlyRent && monthlyRent < totalCost * 0.01) flags.push("⚠ Rent below 1% rule")
  if (cashOnCash < 5) flags.push("⚠ Cash-on-cash below 5% — passive income is thin")

  const g = grade(cashOnCash, annualCashFlow, "rental")
  return {
    maxOffer70, maxOffer65, wholesaleFee, rehabROI: 0, totalCost,
    netProfit: annualCashFlow, roi: cashOnCash, cashOnCash, grossRentYield,
    holdingCost, closingCosts, flags,
    dealGrade: g, gradeColor: GRADE_COLORS[g], gradeLabel: GRADE_LABELS[g],
  }
}

interface Props {
  prefillAddress?: string
  prefillArv?: number
  prefillPurchasePrice?: number
}

export default function DealCalculator({ prefillAddress, prefillArv, prefillPurchasePrice }: Props) {
  const [inputs, setInputs] = useState<DealCalcInputs>({
    arv: prefillArv ?? 0,
    purchasePrice: prefillPurchasePrice ?? 0,
    rehabCost: 0,
    holdingMonths: 6,
    closingCostsPct: 8,
    financingRate: 12,
    exitStrategy: "flip",
    monthlyRent: 0,
    capRateTarget: 6,
  })

  const result = useMemo(() => {
    if (inputs.arv <= 0 || inputs.purchasePrice <= 0) return null
    return calculate(inputs)
  }, [inputs])

  function set<K extends keyof DealCalcInputs>(k: K, v: DealCalcInputs[K]) {
    setInputs(prev => ({ ...prev, [k]: v }))
  }

  return (
    <div className="bg-gray-900/60 border border-gray-700/40 rounded-2xl p-5 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-white">Deal Calculator</h3>
          {prefillAddress && <p className="text-[11px] text-gray-500 mt-0.5">{prefillAddress}</p>}
        </div>
        <div className="flex bg-gray-800/80 border border-gray-700/40 rounded-xl p-1 gap-1">
          {(["flip", "wholesale", "rental"] as const).map(s => (
            <button key={s} onClick={() => set("exitStrategy", s)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${inputs.exitStrategy === s ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-white"}`}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Inputs grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div>
          <label className={LABEL}>After Repair Value (ARV)</label>
          <input type="number" value={inputs.arv || ""} onChange={e => set("arv", Number(e.target.value))}
            placeholder="350000" className={INPUT} />
        </div>
        <div>
          <label className={LABEL}>Purchase / Offer Price</label>
          <input type="number" value={inputs.purchasePrice || ""} onChange={e => set("purchasePrice", Number(e.target.value))}
            placeholder="200000" className={INPUT} />
        </div>
        <div>
          <label className={LABEL}>Rehab Cost</label>
          <input type="number" value={inputs.rehabCost || ""} onChange={e => set("rehabCost", Number(e.target.value))}
            placeholder="40000" className={INPUT} />
        </div>
        {inputs.exitStrategy !== "wholesale" && (
          <div>
            <label className={LABEL}>Hold (months)</label>
            <input type="number" value={inputs.holdingMonths} onChange={e => set("holdingMonths", Number(e.target.value))}
              min={1} max={36} className={INPUT} />
          </div>
        )}
        <div>
          <label className={LABEL}>Closing Costs %</label>
          <input type="number" value={inputs.closingCostsPct} onChange={e => set("closingCostsPct", Number(e.target.value))}
            step={0.5} min={0} max={15} className={INPUT} />
        </div>
        {inputs.exitStrategy !== "wholesale" && (
          <div>
            <label className={LABEL}>Hard Money Rate %/yr</label>
            <input type="number" value={inputs.financingRate} onChange={e => set("financingRate", Number(e.target.value))}
              step={0.5} min={0} max={25} className={INPUT} />
          </div>
        )}
        {inputs.exitStrategy === "rental" && (
          <>
            <div>
              <label className={LABEL}>Monthly Rent</label>
              <input type="number" value={inputs.monthlyRent || ""} onChange={e => set("monthlyRent", Number(e.target.value))}
                placeholder="2200" className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Target Cap Rate %</label>
              <input type="number" value={inputs.capRateTarget} onChange={e => set("capRateTarget", Number(e.target.value))}
                step={0.5} min={0} max={20} className={INPUT} />
            </div>
          </>
        )}
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
            {inputs.exitStrategy === "flip" && (
              <>
                <Metric label="Net Profit" value={fmt(result.netProfit)} highlight={result.netProfit > 0} />
                <Metric label="ROI" value={`${result.roi.toFixed(1)}%`} highlight={result.roi >= 15} />
                <Metric label="Max Offer (70%)" value={fmt(result.maxOffer70)} />
                <Metric label="Max Offer (65%)" value={fmt(result.maxOffer65)} />
                <Metric label="Total Cost In" value={fmt(result.totalCost)} />
                <Metric label="Holding Cost" value={fmt(result.holdingCost)} />
                <Metric label="Closing Costs" value={fmt(result.closingCosts)} />
                <Metric label="Rehab ROI" value={`${result.rehabROI.toFixed(0)}%`} highlight={result.rehabROI >= 200} />
              </>
            )}
            {inputs.exitStrategy === "wholesale" && (
              <>
                <Metric label="Assignment Fee" value={fmt(result.wholesaleFee)} highlight={result.wholesaleFee >= 10000} />
                <Metric label="Your Buy Price" value={fmt(inputs.purchasePrice)} />
                <Metric label="End Buyer Max (70%)" value={fmt(result.maxOffer70)} />
                <Metric label="End Buyer Max (65%)" value={fmt(result.maxOffer65)} />
              </>
            )}
            {inputs.exitStrategy === "rental" && (
              <>
                <Metric label="Cash-on-Cash" value={`${(result.cashOnCash ?? 0).toFixed(1)}%`} highlight={(result.cashOnCash ?? 0) >= 8} />
                <Metric label="Gross Yield" value={`${(result.grossRentYield ?? 0).toFixed(1)}%`} />
                <Metric label="Annual Cash Flow" value={fmt(result.netProfit)} highlight={result.netProfit > 0} />
                <Metric label="Total Invested" value={fmt(result.totalCost)} />
              </>
            )}
          </div>

          {/* Flags */}
          {result.flags.length > 0 && (
            <div className="rounded-xl bg-amber-500/8 border border-amber-500/20 px-4 py-3 space-y-1">
              {result.flags.map((f, i) => (
                <p key={i} className="text-[11px] text-amber-300">{f}</p>
              ))}
            </div>
          )}

          {/* 70% Rule visual */}
          {inputs.exitStrategy !== "rental" && inputs.arv > 0 && (
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] text-gray-500">
                <span>Offer vs ARV</span>
                <span>{((inputs.purchasePrice / inputs.arv) * 100).toFixed(1)}% of ARV</span>
              </div>
              <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${inputs.purchasePrice / inputs.arv <= 0.65 ? "bg-emerald-500" : inputs.purchasePrice / inputs.arv <= 0.70 ? "bg-yellow-500" : "bg-red-500"}`}
                  style={{ width: `${Math.min((inputs.purchasePrice / inputs.arv) * 100, 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-[9px] text-gray-600">
                <span>0%</span><span className="text-yellow-600">65%</span><span className="text-red-600">70%</span><span>100%</span>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl bg-gray-800/40 border border-dashed border-gray-700/50 px-4 py-6 text-center">
          <p className="text-sm text-gray-500">Enter ARV and purchase price to calculate deal metrics</p>
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
