"use client"

// Asset detail — the full click-through explanation for one company or coin.
//
// This is where everything the system knows gets explained rather than scored.
// A number tells you nothing you can act on or disagree with; this shows the
// evidence behind it: whether reported profit converts to cash, what management
// says they're building, how they're paid, how capital has been allocated,
// what's already scheduled to happen, and what the risks actually are.
//
// One deliberate omission: there is NO projected price line. Price forecasting
// isn't reliably possible, and a chart with a future price curve reads as a
// target — which would make every honest thing on this page less trustworthy.
// The forward section shows DATED FACTS a company has already disclosed (debt
// maturities, token unlocks) rather than a guess dressed up as a chart.
import { useState, useEffect, useCallback } from "react"
import { actionSignalStyle, ACTION_SIGNAL_MEANING } from "@/lib/action-signal"
import MarketsDisclaimer from "./MarketsDisclaimer"

interface CalendarEntry { date: string; label: string; detail: string; kind: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Asset = Record<string, any>

function num(n: unknown, suffix = "", digits = 1): string {
  if (typeof n !== "number" || !isFinite(n)) return "—"
  return `${n.toFixed(digits)}${suffix}`
}

function usd(n: unknown): string {
  if (typeof n !== "number" || !isFinite(n)) return "—"
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(1)}B`
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`
  return `$${Math.round(n).toLocaleString()}`
}

function ScoreBar({ label, value, hint }: { label: string; value: unknown; hint?: string }) {
  if (typeof value !== "number" || !isFinite(value)) return null
  const color = value >= 70 ? "bg-emerald-500" : value >= 45 ? "bg-yellow-500" : "bg-red-500"
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-gray-500 w-40 shrink-0">{label}</span>
        <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(value, 100)}%` }} />
        </div>
        <span className="text-[11px] text-gray-300 w-9 text-right font-semibold">{Math.round(value)}</span>
      </div>
      {hint && <p className="text-[10px] text-gray-600 pl-42">{hint}</p>}
    </div>
  )
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-700/40 bg-gray-900/50 px-4 py-3 space-y-2">
      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">{title}</p>
      {children}
    </div>
  )
}

function List({ items, tone = "text-gray-400" }: { items: unknown; tone?: string }) {
  const arr = Array.isArray(items) ? items.filter((x): x is string => typeof x === "string") : []
  if (arr.length === 0) return null
  return <>{arr.slice(0, 6).map((x, i) => <p key={i} className={`text-[11px] ${tone}`}>{x}</p>)}</>
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-gray-800/50 border border-gray-700/30 rounded-xl px-3 py-2">
      <p className="text-[10px] text-gray-500">{label}</p>
      <p className="text-sm font-bold text-white mt-0.5">{value}</p>
      {hint && <p className="text-[9px] text-gray-600 mt-0.5 leading-tight">{hint}</p>}
    </div>
  )
}

export default function AssetDetail({
  kind, symbol, password, onClose,
}: { kind: "stock" | "crypto"; symbol: string; password?: string; onClose?: () => void }) {
  const [data, setData] = useState<{ asset: Asset; calendar: CalendarEntry[]; discoveries: Asset[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/markets/asset?kind=${kind}&symbol=${encodeURIComponent(symbol)}`, {
        headers: password ? { "x-admin-password": password } : {},
      })
      const j = await res.json()
      if (!res.ok) setError(j.error ?? "Failed to load")
      else setData(j)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error")
    } finally { setLoading(false) }
  }, [kind, symbol, password])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="h-64 bg-gray-800/40 rounded-2xl animate-pulse" />
  if (error) return <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3"><p className="text-xs text-red-300">{error}</p></div>
  if (!data) return null

  const a = data.asset
  const isStock = kind === "stock"

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-bold text-white">{a.symbol} — {a.name}</p>
          <p className="text-[11px] text-gray-500 mt-0.5">
            {isStock
              ? [a.sector, a.exchange].filter(Boolean).join(" · ")
              : [a.marketCapRank ? `Rank #${a.marketCapRank}` : null, a.chainSlug].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {a.actionSignal && (
            <span className={`text-sm font-black px-3 py-1.5 rounded-lg border ${actionSignalStyle(a.actionSignal)}`}>
              {String(a.actionSignal).toUpperCase()}
            </span>
          )}
          {onClose && (
            <button onClick={onClose} className="text-gray-500 hover:text-white text-xs px-2 py-1">✕</button>
          )}
        </div>
      </div>

      {a.actionRationale && (
        <div className={`rounded-xl border px-4 py-2.5 space-y-1 ${actionSignalStyle(a.actionSignal)}`}>
          <p className="text-[11px]">{a.actionRationale}</p>
          {a.actionSignal && ACTION_SIGNAL_MEANING[a.actionSignal as keyof typeof ACTION_SIGNAL_MEANING] && (
            <p className="text-[10px] opacity-70">
              What {String(a.actionSignal).toUpperCase()} means here: {ACTION_SIGNAL_MEANING[a.actionSignal as keyof typeof ACTION_SIGNAL_MEANING]}
            </p>
          )}
        </div>
      )}

      <Block title="Score breakdown">
        <ScoreBar label="Fundamental strength" value={a.qualityScore} />
        <ScoreBar label="Risk (higher = worse)" value={a.riskScore} />
        {isStock && <>
          <ScoreBar label="Forward outlook" value={a.forwardScore} hint="Contracted backlog, R&D, capex, revenue acceleration" />
          <ScoreBar label="Multi-year consistency" value={a.consistencyScore} hint="Profit and cash-flow streaks across the cycle" />
          <ScoreBar label="Accounting quality" value={a.accountingQualityScore} hint="Does reported profit actually convert to cash?" />
          <ScoreBar label="Governance" value={a.governanceScore} hint="Pay alignment, related-party deals, auditor independence" />
          <ScoreBar label="Capital allocation" value={a.capitalAllocationScore} hint="Did management buy back stock cheap or expensive?" />
        </>}
        {!isStock && <ScoreBar label="Contract security" value={a.securityScore} hint="Honeypot, mint authority, liquidity lock, holder concentration" />}
      </Block>

      {a.situationSummary && (
        <Block title="Current situation"><p className="text-[11px] text-gray-300">{a.situationSummary}</p></Block>
      )}

      {isStock ? (
        <Block title="Is the success real, or paper?">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Metric label="Cash conversion" value={num(a.avgCashConversion, "x", 2)} hint="Cash flow ÷ profit. Under 1.0 = profit isn't becoming money" />
            <Metric label="Days to get paid" value={num(a.dsoDays, "d", 0)} hint={typeof a.dsoTrendDays === "number" ? `${a.dsoTrendDays > 0 ? "+" : ""}${a.dsoTrendDays.toFixed(0)}d vs start` : undefined} />
            <Metric label="Inventory turns" value={num(a.inventoryTurns, "x")} hint="Slowing = demand softening early" />
            <Metric label="Accruals" value={num(a.accrualsRatioPct, "%")} hint="Earnings running ahead of cash" />
            <Metric label="Piotroski" value={a.piotroskiScore != null ? `${a.piotroskiScore}/9` : "—"} />
            <Metric label="Altman Z" value={a.altmanZScore != null ? `${Number(a.altmanZScore).toFixed(2)} ${a.altmanZone ?? ""}` : "—"} />
            <Metric label="Beneish M" value={num(a.beneishMScore, "", 2)} hint="Above -1.78 resembles manipulator profiles" />
            <Metric label="Stock comp" value={num(a.sbcToRevenuePct, "% rev")} hint="Dilution not yet in the share count" />
          </div>
          <List items={a.accountingFlags} tone="text-amber-300/80" />
        </Block>
      ) : (
        <Block title="Is this a real asset?">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Metric label="Protocol revenue 30d" value={usd(a.protocolRevenue30dUsd)} hint="Actual fees earned — the closest thing to earnings" />
            <Metric label="FDV / market cap" value={num(a.fdvToMcapRatio, "x", 2)} hint="Above 1 = dilution still to come" />
            <Metric label="2% book depth" value={usd(a.orderbookDepth2PctUsd)} hint="Real depth — volume can be wash-traded" />
            <Metric label="Dev activity" value={a.devActivityScore != null ? `${a.devActivityScore}/100` : "—"} />
            <Metric label="Mintable supply" value={a.isMintable === null ? "Unknown" : a.isMintable ? "Yes" : "No"} />
            <Metric label="Liquidity locked" value={a.lpLocked === null ? "Unknown" : a.lpLocked ? "Yes" : "No"} />
            <Metric label="Top holder" value={num(a.topHolderPct, "%")} />
            <Metric label="BTC correlation" value={num(a.btcCorrelation, "", 2)} hint="Near 1 = little diversification value" />
          </div>
          <List items={a.securityFlags} tone="text-red-300/80" />
        </Block>
      )}

      {data.calendar.length > 0 && (
        <Block title="What's already scheduled">
          <p className="text-[10px] text-gray-600 mb-1">
            Dated events the company or protocol has already disclosed. These are facts on a calendar, not forecasts.
          </p>
          {data.calendar.map((c, i) => (
            <div key={i} className="flex gap-3 items-start">
              <span className="text-[10px] font-mono text-indigo-400 w-20 shrink-0">{c.date}</span>
              <div>
                <p className="text-[11px] font-semibold text-gray-300">{c.label}</p>
                <p className="text-[11px] text-gray-400">{c.detail}</p>
              </div>
            </div>
          ))}
        </Block>
      )}

      {isStock && a.narrativeSummary && (
        <Block title="What management says they're building">
          <p className="text-[11px] text-gray-300">{a.narrativeSummary}</p>
          <List items={a.narrativeStrategy} />
          <List items={a.narrativeHeadwinds} tone="text-amber-300/80" />
          <p className="text-[10px] text-gray-600 pt-1">
            This is the company describing itself — promotional by nature and legally hedged.
            {a.narrativeSourceUrl && <> <a href={a.narrativeSourceUrl} target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline">Read the filing →</a></>}
          </p>
        </Block>
      )}

      {isStock && a.governanceSummary && (
        <Block title={`How it's run${a.payAlignment ? ` · pay alignment: ${a.payAlignment}` : ""}`}>
          <p className="text-[11px] text-gray-300">{a.governanceSummary}</p>
          <List items={a.governanceFlags} tone="text-amber-300/80" />
        </Block>
      )}

      {isStock && a.riskFactorSummary && (
        <Block title="What they newly admit to (vs. last year's 10-K)">
          <p className="text-[11px] text-gray-300">{a.riskFactorSummary}</p>
          {Array.isArray(a.materialNewRisks) && a.materialNewRisks.length > 0 && (
            <List items={a.materialNewRisks} tone="text-amber-300/80" />
          )}
          <p className="text-[10px] text-gray-600 mt-1.5">
            Item 1A is mostly boilerplate that carries forward unchanged, which is what makes the
            changes informative — a company adds a risk factor when its lawyers judge the exposure
            real enough that omitting it creates liability.
          </p>
        </Block>
      )}

      {isStock && a.insiderSummary && (
        <Block title="Insider activity"><p className="text-[11px] text-gray-300">{a.insiderSummary}</p></Block>
      )}

      {isStock && Array.isArray(a.capitalAllocationReasons) && a.capitalAllocationReasons.length > 0 && (
        <Block title="Capital allocation record"><List items={a.capitalAllocationReasons} /></Block>
      )}

      {Array.isArray(a.riskFlags) && a.riskFlags.length > 0 && (
        <Block title="Risk flags"><List items={a.riskFlags} tone="text-red-300/80" /></Block>
      )}

      {Array.isArray(a.qualityReasons) && a.qualityReasons.length > 0 && (
        <Block title="Why this score"><List items={a.qualityReasons} /></Block>
      )}

      {data.discoveries.length > 0 && (
        <Block title="How we found this">
          {data.discoveries.slice(0, 4).map((d, i) => (
            <p key={i} className="text-[11px] text-gray-400">
              <span className="text-gray-500">{String(d.eventDate).slice(0, 10)}</span> · {d.rationale}
            </p>
          ))}
        </Block>
      )}

      <MarketsDisclaimer compact />
    </div>
  )
}
