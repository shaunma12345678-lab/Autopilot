"use client"

import { useState } from "react"
import AssetCard, { type AssetCardMetric } from "./AssetCard"
import MarketsDisclaimer from "./MarketsDisclaimer"

interface CryptoRow {
  id: string
  coingeckoId: string
  symbol: string
  name: string
  priceUsd: number | null
  marketCapRank: number | null
  marketCapUsd: number | null
  priceChange24hPct: number | null
  priceChange7dPct: number | null
  circulatingSupplyPct: number | null
  fdvToMcapRatio: number | null
  protocolRevenue30dUsd: number | null
  devActivityScore: number | null
  nextUnlockDate: string | null
  nextUnlockPctSupply: number | null
  chainSlug: string | null
  isHoneypot: boolean | null
  isMintable: boolean | null
  ownershipRenounced: boolean | null
  lpLocked: boolean | null
  buyTaxPct: number | null
  sellTaxPct: number | null
  holderCount: number | null
  topHolderPct: number | null
  top10HolderPct: number | null
  securityScore: number | null
  orderbookDepth2PctUsd: number | null
  volatility30dPct: number | null
  maxDrawdown1yPct: number | null
  btcCorrelation: number | null
  qualityScore: number | null
  qualityReasons: string[] | null
  riskScore: number | null
  riskFlags: string[] | null
  strengthTier: string | null
  actionSignal: string | null
  actionRationale: string | null
  dataConfidence: "insufficient" | "low" | "medium" | "high"
  dataCompletenessPct: number | null
}

function num(n: number | null | undefined, suffix = "", digits = 1): string {
  if (n === null || n === undefined || !isFinite(n)) return "—"
  return `${n.toFixed(digits)}${suffix}`
}

function usd(n: number | null | undefined): string {
  if (n === null || n === undefined || !isFinite(n)) return "—"
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toFixed(0)}`
}

function yesNo(v: boolean | null, goodWhen: boolean): { value: string; highlight: boolean } {
  if (v === null) return { value: "Unknown", highlight: false }
  return { value: v ? "Yes" : "No", highlight: v === goodWhen }
}

export default function CryptoLookup({ password }: { password?: string } = {}) {
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<CryptoRow | null>(null)

  async function analyze() {
    if (!query.trim()) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch("/api/crypto/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(password ? { "x-admin-password": password } : {}),
        },
        body: JSON.stringify({ query: query.trim() }),
      })
      const data = await res.json()
      if (!res.ok) setError(data.error ?? "Analysis failed")
      else setResult(data.asset)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error")
    } finally {
      setLoading(false)
    }
  }

  const mintable = result ? yesNo(result.isMintable, false) : null
  const renounced = result ? yesNo(result.ownershipRenounced, true) : null
  const lpLocked = result ? yesNo(result.lpLocked, true) : null

  const metrics: AssetCardMetric[] = result ? [
    { label: "Security Score", value: result.securityScore !== null ? `${result.securityScore}/100` : "N/A", highlight: (result.securityScore ?? 0) >= 85 },
    { label: "Supply Mintable", value: mintable!.value, highlight: mintable!.highlight },
    { label: "Ownership Renounced", value: renounced!.value, highlight: renounced!.highlight },
    { label: "Liquidity Locked", value: lpLocked!.value, highlight: lpLocked!.highlight },
    { label: "Price", value: result.priceUsd !== null ? `$${result.priceUsd.toLocaleString(undefined, { maximumFractionDigits: 6 })}` : "—" },
    { label: "Market Cap", value: usd(result.marketCapUsd) },
    { label: "FDV / Mcap", value: num(result.fdvToMcapRatio, "x", 2), highlight: (result.fdvToMcapRatio ?? 99) <= 1.15 },
    { label: "Circulating", value: result.circulatingSupplyPct !== null ? num(result.circulatingSupplyPct, "%") : "Uncapped" },
    { label: "2% Book Depth", value: usd(result.orderbookDepth2PctUsd), highlight: (result.orderbookDepth2PctUsd ?? 0) > 500_000 },
    { label: "Protocol Revenue 30d", value: usd(result.protocolRevenue30dUsd), highlight: (result.protocolRevenue30dUsd ?? 0) > 0 },
    { label: "Dev Activity", value: result.devActivityScore !== null ? `${result.devActivityScore}/100` : "—", highlight: (result.devActivityScore ?? 0) >= 60 },
    { label: "Top Holder", value: num(result.topHolderPct, "%") },
    { label: "Top 10 Holders", value: num(result.top10HolderPct, "%") },
    { label: "Next Unlock", value: result.nextUnlockDate ? new Date(result.nextUnlockDate).toLocaleDateString() : "None known" },
    { label: "Volatility (ann.)", value: num(result.volatility30dPct, "%") },
    { label: "BTC Correlation", value: num(result.btcCorrelation, "", 2) },
  ] : []

  return (
    <div className="bg-gray-900/60 border border-gray-700/40 rounded-2xl p-5 space-y-4">
      <div>
        <h3 className="text-sm font-bold text-white">Analyze a Coin</h3>
        <p className="text-[11px] text-gray-500 mt-0.5">
          Any symbol or name. Runs contract-security checks (honeypot, mint authority, liquidity lock),
          real orderbook depth, dilution overhang, protocol revenue, and developer activity.
        </p>
      </div>

      <div className="flex gap-2">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") analyze() }}
          placeholder="e.g. ETH or Ethereum"
          className="flex-1 bg-gray-900/80 border border-gray-700/50 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/20"
        />
        <button onClick={analyze} disabled={loading || !query.trim()}
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
            subtitle={[
              result.marketCapRank ? `Rank #${result.marketCapRank}` : null,
              result.chainSlug ? `on ${result.chainSlug}` : null,
            ].filter(Boolean).join(" · ") || null}
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
              result.chainSlug
                ? `Market data from CoinGecko; contract security verified on-chain (${result.chainSlug}); depth from live exchange orderbook.`
                : "Market data from CoinGecko. Native chain coin — no token contract to inspect for contract-level risks."
            }
          />
          <MarketsDisclaimer compact />
        </>
      )}
    </div>
  )
}
