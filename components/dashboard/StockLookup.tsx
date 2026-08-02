"use client"

import { useState } from "react"
import AssetCard, { type AssetCardMetric } from "./AssetCard"
import MarketsDisclaimer from "./MarketsDisclaimer"

interface TickerRow {
  id: string
  symbol: string
  name: string
  sector: string | null
  exchange: string | null
  qualityScore: number | null
  qualityReasons: string[] | null
  riskScore: number | null
  riskFlags: string[] | null
  strengthTier: string | null
  actionSignal: string | null
  actionRationale: string | null
  dataConfidence: "insufficient" | "low" | "medium" | "high"
  dataCompletenessPct: number | null
  revenueGrowthYoyPct: number | null
  netMarginPct: number | null
  roePct: number | null
  debtToEquity: number | null
  fcfMarginPct: number | null
  dividendYieldPct: number | null
  payoutRatioFcfPct: number | null
  peRatio: number | null
  priceUsd: number | null
  piotroskiScore: number | null
  altmanZScore: number | null
  altmanZone: string | null
  beneishMScore: number | null
  beneishFlag: boolean | null
  momentum12m1Pct: number | null
  pctFrom52WeekHigh: number | null
  volatility30dPct: number | null
  maxDrawdown1yPct: number | null
  betaVsSpy: number | null
  buybackYieldPct: number | null
  sectorRelativeScore: number | null
  sectorPeerCount: number | null
}

function num(n: number | null | undefined, suffix = "", digits = 1): string {
  if (n === null || n === undefined || !isFinite(n)) return "—"
  return `${n.toFixed(digits)}${suffix}`
}

export default function StockLookup({ password }: { password?: string } = {}) {
  const [symbol, setSymbol] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<TickerRow | null>(null)

  async function analyze() {
    if (!symbol.trim()) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch("/api/stocks/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(password ? { "x-admin-password": password } : {}),
        },
        body: JSON.stringify({ symbol: symbol.trim() }),
      })
      const data = await res.json()
      if (!res.ok) setError(data.error ?? "Analysis failed")
      else setResult(data.ticker)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error")
    } finally {
      setLoading(false)
    }
  }

  const metrics: AssetCardMetric[] = result ? [
    { label: "Piotroski F-Score", value: result.piotroskiScore !== null ? `${result.piotroskiScore}/9` : "—", highlight: (result.piotroskiScore ?? 0) >= 7 },
    { label: "Altman Z-Score", value: result.altmanZScore !== null ? `${result.altmanZScore.toFixed(2)} (${result.altmanZone})` : "N/A", highlight: result.altmanZone === "safe" },
    { label: "Beneish M-Score", value: result.beneishMScore !== null ? result.beneishMScore.toFixed(2) : "—", highlight: result.beneishFlag === false },
    { label: "12mo Momentum", value: num(result.momentum12m1Pct, "%"), highlight: (result.momentum12m1Pct ?? 0) > 15 },
    { label: "Revenue Growth", value: num(result.revenueGrowthYoyPct, "%") },
    { label: "Net Margin", value: num(result.netMarginPct, "%") },
    { label: "ROE", value: num(result.roePct, "%") },
    { label: "FCF Margin", value: num(result.fcfMarginPct, "%") },
    { label: "Debt/Equity", value: num(result.debtToEquity, "x", 2) },
    { label: "P/E", value: num(result.peRatio, "x") },
    { label: "Dividend Yield", value: result.dividendYieldPct !== null ? num(result.dividendYieldPct, "%") : "None" },
    { label: "Buyback Yield", value: num(result.buybackYieldPct, "%"), highlight: (result.buybackYieldPct ?? 0) > 1 },
    { label: "From 52wk High", value: num(result.pctFrom52WeekHigh, "%") },
    { label: "Volatility (ann.)", value: num(result.volatility30dPct, "%") },
    { label: "Beta vs SPY", value: num(result.betaVsSpy, "", 2) },
    { label: "Sector Percentile", value: result.sectorRelativeScore !== null ? `${result.sectorRelativeScore}/100` : "Too few peers" },
  ] : []

  return (
    <div className="bg-gray-900/60 border border-gray-700/40 rounded-2xl p-5 space-y-4">
      <div>
        <h3 className="text-sm font-bold text-white">Analyze a Company</h3>
        <p className="text-[11px] text-gray-500 mt-0.5">
          Any SEC-registered ticker. Pulls fresh EDGAR filings and price history, then runs Piotroski,
          Altman, Beneish, momentum, and sector-relative analysis.
        </p>
      </div>

      <div className="flex gap-2">
        <input
          value={symbol}
          onChange={e => setSymbol(e.target.value.toUpperCase())}
          onKeyDown={e => { if (e.key === "Enter") analyze() }}
          placeholder="e.g. AAPL"
          className="flex-1 bg-gray-900/80 border border-gray-700/50 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/20"
        />
        <button onClick={analyze} disabled={loading || !symbol.trim()}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-all">
          {loading ? "Analyzing…" : "Analyze"}
        </button>
      </div>

      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3">
          <p className="text-xs text-red-300">{error}</p>
        </div>
      )}

      {result && (
        <>
          <AssetCard
            symbol={result.symbol}
            name={result.name}
            subtitle={[result.sector, result.exchange].filter(Boolean).join(" · ") || null}
            qualityScore={result.qualityScore}
            riskScore={result.riskScore}
            strengthTier={result.strengthTier}
            actionSignal={result.actionSignal}
            actionRationale={result.actionRationale}
            dataConfidence={result.dataConfidence}
            dataCompletenessPct={result.dataCompletenessPct}
            qualityReasons={result.qualityReasons}
            riskFlags={result.riskFlags}
            metrics={metrics}
            integritySummary={
              result.sectorPeerCount && result.sectorPeerCount > 0
                ? `Fundamentals from SEC filings; price metrics from daily history; sector percentile computed against ${result.sectorPeerCount} tracked peers.`
                : "Fundamentals from SEC filings; price metrics computed from daily history."
            }
          />
          <MarketsDisclaimer compact />
        </>
      )}
    </div>
  )
}
