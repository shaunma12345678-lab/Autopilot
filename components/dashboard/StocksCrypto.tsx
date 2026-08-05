"use client"

// Stocks & Crypto panel for the internal admin console.
//
// Wraps the same components the customer-facing /markets section uses — no
// duplicated logic — but passes the admin password through so the shared API
// routes authorize via the x-admin-password header instead of a Supabase
// session (see lib/markets-auth.ts).
import { useState } from "react"
import StockLookup from "./StockLookup"
import StockTopPicks from "./StockTopPicks"
import StockEarlyWarningDashboard from "./StockEarlyWarningDashboard"
import CryptoLookup from "./CryptoLookup"
import CryptoTopPicks from "./CryptoTopPicks"
import CryptoMarketsDashboard from "./CryptoMarketsDashboard"
import MarketsDisclaimer from "./MarketsDisclaimer"
import MarketScreens from "./MarketScreens"
import DiscoveryFeed from "./DiscoveryFeed"
import TopRanked from "./TopRanked"

type SubTab = "stocks" | "crypto"

const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: "stocks", label: "📈 Stocks" },
  { id: "crypto", label: "🪙 Crypto" },
]

const BLURB: Record<SubTab, string> = {
  stocks:
    "SEC EDGAR filings plus daily price history — Piotroski F-Score, Altman Z-Score, Beneish earnings-manipulation model, 12-month momentum, and sector-relative benchmarking. Strength and risk are scored on separate axes.",
  crypto:
    "On-chain contract security (honeypot, mint authority, liquidity lock, holder concentration), real orderbook depth rather than wash-tradeable volume, dilution overhang, protocol revenue, and developer activity. A failed security check caps the score outright.",
}

export default function StocksCrypto({ password }: { password: string }) {
  const [subTab, setSubTab] = useState<SubTab>("stocks")

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-white">Stocks &amp; Crypto</h2>
        <p className="text-sm text-gray-400 mt-1 max-w-3xl">{BLURB[subTab]}</p>
      </div>

      <div className="flex bg-gray-900/60 border border-gray-800 rounded-xl p-1 gap-1 w-fit">
        {SUB_TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              subTab === t.id ? "text-white" : "text-gray-500 hover:text-gray-300"
            }`}
            style={subTab === t.id ? { background: "linear-gradient(135deg,#4f46e5,#7c3aed)" } : {}}
          >
            {t.label}
          </button>
        ))}
      </div>

      <MarketsDisclaimer />

      {subTab === "stocks" ? (
        <>
          <StockLookup password={password} />
          <TopRanked kind="stock" password={password} />
          <DiscoveryFeed password={password} />
          <MarketScreens kind="stock" password={password} />
          <StockTopPicks password={password} />
          <StockEarlyWarningDashboard password={password} />
        </>
      ) : (
        <>
          <CryptoLookup password={password} />
          <TopRanked kind="crypto" password={password} />
          <MarketScreens kind="crypto" password={password} />
          <CryptoTopPicks password={password} />
          <CryptoMarketsDashboard password={password} />
        </>
      )}
    </div>
  )
}
