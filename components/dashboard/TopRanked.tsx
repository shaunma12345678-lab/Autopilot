"use client"

// Top Ranked — the definitive list, with the reasoning attached.
//
// A bare score tells you nothing you can act on or argue with. Every row here
// expands into WHY it scored what it did: the strength drivers, the risk flags,
// what management says they're building, how capital has been allocated, and
// how the company is governed. If a row can't justify itself, it shouldn't be
// on the list.
import { useState, useEffect, useCallback } from "react"
import { actionSignalStyle } from "@/lib/action-signal"
import AssetDetail from "./AssetDetail"

interface Row {
  id: string
  symbol: string
  name: string
  sector?: string | null
  qualityScore: number | null
  riskScore: number | null
  actionSignal: string | null
  actionRationale: string | null
  dataConfidence: string
  qualityReasons: string[] | null
  riskFlags: string[] | null
  // stock depth
  forwardScore?: number | null
  forwardReasons?: string[] | null
  consistencyScore?: number | null
  piotroskiScore?: number | null
  altmanZone?: string | null
  governanceScore?: number | null
  governanceSummary?: string | null
  payAlignment?: string | null
  capitalAllocationScore?: number | null
  capitalAllocationReasons?: string[] | null
  balanceSheetFlags?: string[] | null
  narrativeSummary?: string | null
  situationSummary?: string | null
  insiderSummary?: string | null
  // crypto depth
  securityScore?: number | null
  securityFlags?: string[] | null
  protocolRevenue30dUsd?: number | null
  fdvToMcapRatio?: number | null
  devActivityScore?: number | null
}

function Bar({ label, value, good }: { label: string; value: number | null | undefined; good?: number }) {
  if (value === null || value === undefined) return null
  const threshold = good ?? 65
  const color = value >= threshold ? "bg-emerald-500" : value >= threshold - 20 ? "bg-yellow-500" : "bg-red-500"
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-gray-500 w-32 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
      <span className="text-[10px] text-gray-400 w-8 text-right">{value}</span>
    </div>
  )
}

function Section({ title, items, tone = "text-gray-400" }: { title: string; items: string[] | null | undefined; tone?: string }) {
  if (!items || items.length === 0) return null
  return (
    <div>
      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">{title}</p>
      {items.slice(0, 5).map((x, i) => <p key={i} className={`text-[11px] ${tone}`}>{x}</p>)}
    </div>
  )
}

export default function TopRanked({ kind, password }: { kind: "stock" | "crypto"; password?: string }) {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  const fetchRows = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/markets/top-ranked?kind=${kind}&limit=15`, {
        headers: password ? { "x-admin-password": password } : {},
      })
      const data = await res.json()
      setRows(data.rows ?? [])
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [kind, password])

  useEffect(() => { fetchRows() }, [fetchRows])

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-white">
            Top Ranked {kind === "stock" ? "Companies" : "Assets"}
          </h3>
          <p className="text-[11px] text-gray-500 mt-0.5 max-w-2xl">
            Ranked by fundamental strength among everything that cleared the data-confidence bar.
            Click any row for the full reasoning — strengths, risks, forward indicators
            {kind === "stock" ? ", governance and capital allocation" : " and contract security"}.
          </p>
        </div>
        <button onClick={fetchRows} className="px-3 py-1.5 bg-gray-800/60 border border-gray-700/40 rounded-xl text-xs text-gray-400 hover:text-white transition-all shrink-0">
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="grid gap-2">{[1, 2, 3, 4].map(i => <div key={i} className="h-16 bg-gray-800/40 rounded-xl animate-pulse" />)}</div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-700/50 px-6 py-10 text-center">
          <p className="text-sm text-gray-400">Nothing has cleared the data-confidence bar yet.</p>
        </div>
      ) : (
        <div className="grid gap-2">
          {rows.map((r, idx) => {
            const isOpen = expanded === r.id
            return (
              <div key={r.id}
                className={`rounded-xl border transition-all cursor-pointer ${isOpen ? "border-indigo-500/50 bg-gray-800/70" : "border-gray-700/40 bg-gray-900/60 hover:bg-gray-800/50"}`}
                onClick={() => setExpanded(isOpen ? null : r.id)}>

                <div className="flex items-center gap-3 px-4 py-3">
                  <span className={`text-xs font-black w-7 shrink-0 ${idx < 3 ? "text-amber-400" : "text-gray-500"}`}>
                    #{idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-white">{r.symbol}</p>
                      <p className="text-xs text-gray-500 truncate">{r.name}</p>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-500 flex-wrap">
                      {r.piotroskiScore !== null && r.piotroskiScore !== undefined && <span>F-Score {r.piotroskiScore}/9</span>}
                      {r.forwardScore !== null && r.forwardScore !== undefined && <span>Forward {r.forwardScore}</span>}
                      {r.consistencyScore !== null && r.consistencyScore !== undefined && <span>Consistency {r.consistencyScore}</span>}
                      {r.governanceScore !== null && r.governanceScore !== undefined && <span>Governance {r.governanceScore}</span>}
                      {r.securityScore !== null && r.securityScore !== undefined && <span>Security {r.securityScore}</span>}
                      {r.altmanZone && <span>Altman: {r.altmanZone}</span>}
                    </div>
                  </div>
                  {r.actionSignal && (
                    <span className={`shrink-0 text-[10px] font-black px-2 py-1 rounded-lg border ${actionSignalStyle(r.actionSignal)}`}>
                      {r.actionSignal.toUpperCase()}
                    </span>
                  )}
                  <div className="text-right shrink-0 w-14">
                    <p className="text-sm font-bold text-white">{r.qualityScore}</p>
                    {r.riskScore !== null && (
                      <p className={`text-[10px] ${r.riskScore >= 70 ? "text-red-400" : r.riskScore >= 45 ? "text-orange-400" : "text-gray-500"}`}>
                        Risk {r.riskScore}
                      </p>
                    )}
                  </div>
                </div>

                {isOpen && (
                  <div className="border-t border-gray-700/40 px-4 py-3" onClick={e => e.stopPropagation()}>
                    <AssetDetail kind={kind} symbol={r.symbol} password={password} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
