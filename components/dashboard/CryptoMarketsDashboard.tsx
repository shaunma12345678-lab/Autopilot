"use client"

import { useState, useEffect, useCallback } from "react"

interface CryptoRow {
  id: string
  symbol: string
  name: string
  marketCapRank: number | null
  priceUsd: number | null
  marketCapUsd: number | null
  priceChange24hPct: number | null
  priceChange7dPct: number | null
}

function fmtUsd(n: number | null) {
  if (n === null || !isFinite(n)) return "—"
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  return `$${n.toLocaleString()}`
}

function ChangeBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-gray-500">—</span>
  const positive = pct >= 0
  return (
    <span className={positive ? "text-emerald-400" : "text-red-400"}>
      {positive ? "+" : ""}{pct.toFixed(1)}%
    </span>
  )
}

export default function CryptoMarketsDashboard({ password }: { password?: string } = {}) {
  const [assets, setAssets] = useState<CryptoRow[]>([])
  const [loading, setLoading] = useState(true)

  const fetchMarkets = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/crypto/top-picks?sort=marketCap&limit=25", {
        headers: password ? { "x-admin-password": password } : {},
      })
      const data = await res.json()
      setAssets(data.assets ?? [])
    } catch {
      setAssets([])
    } finally {
      setLoading(false)
    }
  }, [password])

  useEffect(() => { fetchMarkets() }, [fetchMarkets])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-white">Markets</h3>
          <p className="text-[11px] text-gray-500 mt-0.5">Tracked coins by market cap rank.</p>
        </div>
        <button onClick={fetchMarkets} className="px-3 py-1.5 bg-gray-800/60 border border-gray-700/40 rounded-xl text-xs text-gray-400 hover:text-white transition-all">
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="grid gap-2">
          {[1, 2, 3].map(i => <div key={i} className="h-12 bg-gray-800/40 rounded-xl animate-pulse" />)}
        </div>
      ) : assets.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-700/50 px-6 py-8 text-center">
          <p className="text-sm text-gray-500">No coins tracked yet.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-700/40 bg-gray-900/60 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] text-gray-500 border-b border-gray-700/40">
                <th className="text-left font-medium px-4 py-2">#</th>
                <th className="text-left font-medium px-4 py-2">Coin</th>
                <th className="text-right font-medium px-4 py-2">Price</th>
                <th className="text-right font-medium px-4 py-2">24h</th>
                <th className="text-right font-medium px-4 py-2">7d</th>
                <th className="text-right font-medium px-4 py-2">Market Cap</th>
              </tr>
            </thead>
            <tbody>
              {assets.map(a => (
                <tr key={a.id} className="border-b border-gray-800/60 last:border-0">
                  <td className="px-4 py-2.5 text-gray-500">{a.marketCapRank ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    <span className="font-semibold text-white">{a.symbol}</span>{" "}
                    <span className="text-gray-500 text-xs">{a.name}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-white">
                    {a.priceUsd !== null ? `$${a.priceUsd.toLocaleString(undefined, { maximumFractionDigits: 4 })}` : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right"><ChangeBadge pct={a.priceChange24hPct} /></td>
                  <td className="px-4 py-2.5 text-right"><ChangeBadge pct={a.priceChange7dPct} /></td>
                  <td className="px-4 py-2.5 text-right text-gray-300">{fmtUsd(a.marketCapUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
