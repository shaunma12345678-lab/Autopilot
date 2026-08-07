"use client"

// The lists built this session, each answering a different question.
//
// They are deliberately separate views rather than one ranked table: a company
// can be a hidden gem and a poor cash generator, or convert cash superbly while
// being expensive. Merging them into one score would hide exactly the
// distinction that makes each list worth reading.
import { useState, useEffect, useCallback } from "react"

type ListId = "gems" | "cash" | "opportunities" | "smart-money"

const LISTS: { id: ListId; label: string; icon: string; endpoint: string; blurb: string }[] = [
  {
    id: "gems", label: "Hidden Gems", icon: "💎",
    endpoint: "/api/markets/hidden-gems?limit=10",
    blurb: "Sound, cheap companies that no concentrated institutional manager holds — if one had found it, the edge would already be priced. One per sector, and names shown in the last 21 days are suppressed so the list rotates.",
  },
  {
    id: "cash", label: "Cash Generators", icon: "💵",
    endpoint: "/api/markets/cash-generators?limit=10",
    blurb: "Ranked on how much stated profit becomes actual cash, not on cash size. Negative accruals mean cash generation exceeds reported profit — the direction indicating earnings are real rather than timing.",
  },
  {
    id: "opportunities", label: "Opportunity Screen", icon: "🎯",
    endpoint: "/api/markets/opportunities?limit=15",
    blurb: "Ranked on valuation among companies clearing every soundness gate. Quality is used only as a disqualifier — backtesting measured no forward-return edge in ranking on it.",
  },
  {
    id: "smart-money", label: "Smart Money", icon: "🏦",
    endpoint: "/api/markets/smart-money?limit=25",
    blurb: "Position changes at concentrated, research-driven managers, from Form 13F. Filed 45 days after quarter end — a research lead pointing at a company worth reading, never a current position.",
  },
]

interface Row { [k: string]: unknown }

function Money(v: unknown): string {
  const n = typeof v === "number" ? v : NaN
  if (!isFinite(n)) return "—"
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(0)}M`
  return `$${n.toFixed(0)}`
}

function Pct(v: unknown, d = 1): string {
  return typeof v === "number" && isFinite(v) ? `${v.toFixed(d)}%` : "—"
}

function Bullets({ items, tone }: { items: unknown; tone: string }) {
  if (!Array.isArray(items) || items.length === 0) return null
  return (
    <ul className="mt-2 space-y-1">
      {(items as string[]).slice(0, 4).map((x, i) => (
        <li key={i} className={`text-[11px] leading-relaxed ${tone}`}>• {x}</li>
      ))}
    </ul>
  )
}

export default function OpportunityLists({ password }: { password?: string } = {}) {
  const [active, setActive] = useState<ListId>("gems")
  const [rows, setRows] = useState<Row[]>([])
  const [meta, setMeta] = useState<Record<string, unknown>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  const list = LISTS.find(l => l.id === active)!

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(list.endpoint, {
        headers: password ? { "x-admin-password": password } : {},
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? "Request failed")
      // Each endpoint names its array differently; normalise here rather than
      // forcing four shapes to match.
      const arr = data.gems ?? data.rows ?? data.changes ?? []
      setRows(Array.isArray(arr) ? arr : [])
      setMeta(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load")
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [list.endpoint, password])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {LISTS.map(l => (
          <button key={l.id} onClick={() => setActive(l.id)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
              active === l.id ? "bg-indigo-600 text-white" : "bg-gray-800/60 text-gray-400 hover:text-white"
            }`}>
            {l.icon} {l.label}
          </button>
        ))}
      </div>

      <p className="text-[11px] text-gray-500 leading-relaxed max-w-3xl">{list.blurb}</p>

      {typeof meta.scanned === "number" && (
        <p className="text-[10px] text-gray-600">
          Scanned {(meta.scanned as number).toLocaleString()} companies
          {typeof meta.qualified === "number" ? ` · ${meta.qualified} cleared every gate` : ""}
          {typeof meta.institutionallyHeldExcluded === "number" ? ` · ${meta.institutionallyHeldExcluded} excluded as institutionally held` : ""}
          {typeof meta.suppressedForRotation === "number" && (meta.suppressedForRotation as number) > 0 ? ` · ${meta.suppressedForRotation} suppressed for rotation` : ""}
          {typeof meta.suppressed === "number" && (meta.suppressed as number) > 0 ? ` · ${meta.suppressed} suppressed for rotation` : ""}
        </p>
      )}

      <button onClick={load} className="px-3 py-1.5 bg-gray-800/60 border border-gray-700/40 rounded-xl text-xs text-gray-400 hover:text-white">
        Refresh
      </button>

      {loading ? (
        <div className="grid gap-2">{[1,2,3,4].map(i => <div key={i} className="h-16 bg-gray-800/40 rounded-xl animate-pulse" />)}</div>
      ) : error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/5 px-5 py-6">
          <p className="text-sm text-red-300">{error}</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-700/50 px-6 py-10 text-center">
          <p className="text-sm text-gray-400">Nothing currently clears this screen.</p>
          <p className="text-[11px] text-gray-600 mt-2">
            An empty list is a real answer here — the gates are not relaxed to fill space.
          </p>
        </div>
      ) : (
        <div className="grid gap-2">
          {rows.map((r, i) => {
            const sym = String(r.symbol ?? r.issuer ?? i)
            const isOpen = open === sym
            return (
              <div key={`${sym}-${i}`}
                onClick={() => setOpen(isOpen ? null : sym)}
                className={`rounded-xl border cursor-pointer transition-all ${
                  isOpen ? "border-indigo-500/50 bg-gray-800/70" : "border-gray-700/40 bg-gray-900/60 hover:bg-gray-800/50"
                }`}>
                <div className="flex items-center gap-3 px-4 py-3">
                  <span className="text-xs font-black w-6 text-gray-500">#{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-white">{String(r.symbol ?? "—")}</p>
                      <p className="text-xs text-gray-500 truncate">{String(r.name ?? r.issuer ?? "")}</p>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-500 flex-wrap">
                      {r.sector ? <span>{String(r.sector).slice(0, 34)}</span> : null}
                      {typeof r.revenueTtm === "number" ? <span>Rev {Money(r.revenueTtm)}</span> : null}
                      {typeof r.obscurityScore === "number" ? <span>Obscurity {r.obscurityScore}</span> : null}
                      {typeof r.conversionScore === "number" ? <span>Conversion {r.conversionScore}</span> : null}
                      {typeof r.fcfMarginPct === "number" ? <span>FCF margin {Pct(r.fcfMarginPct)}</span> : null}
                      {typeof r.accrualsRatioPct === "number" ? <span>Accruals {Pct(r.accrualsRatioPct)}</span> : null}
                      {typeof r.piotroskiScore === "number" ? <span>F {r.piotroskiScore}/9</span> : null}
                      {r.changeType ? <span className="text-indigo-300">{String(r.changeType).replace("_", " ")}</span> : null}
                      {r.filer ? <span>{String(r.filer)}</span> : null}
                      {r.asOfDate ? <span>as of {String(r.asOfDate)}</span> : null}
                    </div>
                  </div>
                  {typeof r.valuationScore === "number" && (
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-white">{r.valuationScore}</p>
                      <p className="text-[10px] text-gray-500">valuation</p>
                    </div>
                  )}
                  {typeof r.valueUsd === "number" && r.valueUsd > 0 && (
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-white">{Money(r.valueUsd)}</p>
                      <p className="text-[10px] text-gray-500">position</p>
                    </div>
                  )}
                </div>

                {isOpen && (
                  <div className="border-t border-gray-700/40 px-4 py-3 space-y-3" onClick={e => e.stopPropagation()}>
                    <Bullets items={r.whyInteresting ?? r.reasons} tone="text-gray-300" />
                    <Bullets items={r.whyHidden} tone="text-sky-300/80" />
                    <Bullets items={r.cautions} tone="text-amber-300/80" />
                    {r.filerStyle ? <p className="text-[11px] text-gray-400">{String(r.filerStyle)}</p> : null}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {typeof meta.note === "string" && (
        <p className="text-[10px] text-gray-600 border-t border-gray-800 pt-3 leading-relaxed">{meta.note}</p>
      )}
      {typeof meta.caveat === "string" && (
        <p className="text-[10px] text-gray-600 leading-relaxed">{meta.caveat}</p>
      )}
    </div>
  )
}
