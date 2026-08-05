import { createSupabaseServerClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import StockLookup from "@/components/dashboard/StockLookup"
import StockTopPicks from "@/components/dashboard/StockTopPicks"
import StockEarlyWarningDashboard from "@/components/dashboard/StockEarlyWarningDashboard"
import CryptoLookup from "@/components/dashboard/CryptoLookup"
import CryptoTopPicks from "@/components/dashboard/CryptoTopPicks"
import CryptoMarketsDashboard from "@/components/dashboard/CryptoMarketsDashboard"
import MarketsDisclaimer from "@/components/dashboard/MarketsDisclaimer"
import TrackRecordPanel from "@/components/dashboard/TrackRecordPanel"
import MarketScreens from "@/components/dashboard/MarketScreens"
import DiscoveryFeed from "@/components/dashboard/DiscoveryFeed"

export const metadata = {
  title: "Markets | Autopilot",
}

type Tab = "stocks" | "crypto" | "accuracy"

const TABS: { id: Tab; href: string; label: string; icon: string }[] = [
  { id: "stocks", href: "/markets", label: "Stocks", icon: "📈" },
  { id: "crypto", href: "/markets?tab=crypto", label: "Crypto", icon: "🪙" },
  { id: "accuracy", href: "/markets?tab=accuracy", label: "Scoring Accuracy", icon: "🎯" },
]

const BLURB: Record<Tab, string> = {
  stocks:
    "Analysis built on SEC EDGAR filings and daily price history — the Piotroski F-Score, Altman Z-Score, Beneish earnings-manipulation model, 12-month momentum, and sector-relative benchmarking. Fundamental strength and risk are scored on separate axes.",
  crypto:
    "On-chain contract security (honeypot, mint authority, liquidity lock, holder concentration), real orderbook depth rather than wash-tradeable volume, dilution overhang, protocol revenue, and developer activity. A failed security check caps the score outright.",
  accuracy:
    "Every company assessment is logged when it's made and checked against real price history 90 days later — the full, uncherry-picked record of how often our scoring lined up with what followed.",
}

export default async function MarketsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { tab } = await searchParams
  const activeTab: Tab = tab === "crypto" ? "crypto" : tab === "accuracy" ? "accuracy" : "stocks"

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Markets</h1>
        <p className="text-gray-400 mt-1 text-sm max-w-3xl">{BLURB[activeTab]}</p>
      </div>

      {/* Top tab switcher — same pattern as the Real Estate section */}
      <div className="flex bg-gray-900/60 border border-gray-700/40 rounded-2xl p-1 gap-1 w-fit">
        {TABS.map(t => (
          <Link
            key={t.id}
            href={t.href}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeTab === t.id ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-white"
            }`}
          >
            <span>{t.icon}</span>
            {t.label}
          </Link>
        ))}
      </div>

      <MarketsDisclaimer />

      {activeTab === "stocks" && (
        <>
          <StockLookup />
          <DiscoveryFeed />
          <MarketScreens kind="stock" />
          <StockTopPicks />
          <StockEarlyWarningDashboard />
        </>
      )}

      {activeTab === "crypto" && (
        <>
          <CryptoLookup />
          <MarketScreens kind="crypto" />
          <CryptoTopPicks />
          <CryptoMarketsDashboard />
        </>
      )}

      {activeTab === "accuracy" && <TrackRecordPanel />}
    </div>
  )
}
