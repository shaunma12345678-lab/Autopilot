"use client"

import { useState, useEffect, useCallback } from "react"

interface EntityProperty {
  id: string
  address: string
  assetClass: string
}

interface EntityRow {
  id: string
  canonicalName: string
  entityType: string | null
  propertyCount: number
  properties: EntityProperty[]
}

const TYPE_LABEL: Record<string, string> = {
  llc: "LLC", lp: "LP", corp: "Corp", trust: "Trust", individual: "Individual",
}

export default function PortfolioOwnerCard() {
  const [entities, setEntities] = useState<EntityRow[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  const fetchEntities = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/entities?limit=25")
      const data = await res.json()
      setEntities(data.entities ?? [])
    } catch {
      setEntities([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchEntities() }, [fetchEntities])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-white">Portfolio Operators</h3>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Owners with 2+ distressed properties across the accumulated signal history — an operator
            distressed on one property is often distressed across their whole portfolio.
          </p>
        </div>
        <button onClick={fetchEntities} className="px-3 py-1.5 bg-gray-800/60 border border-gray-700/40 rounded-xl text-xs text-gray-400 hover:text-white transition-all">
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="grid gap-2">
          {[1, 2].map(i => <div key={i} className="h-16 bg-gray-800/40 rounded-xl animate-pulse" />)}
        </div>
      ) : entities.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-700/50 px-6 py-8 text-center">
          <p className="text-sm text-gray-500">No multi-property operators identified yet — this grows as more leads with captured owner names accumulate.</p>
        </div>
      ) : (
        <div className="grid gap-2">
          {entities.map(e => (
            <div key={e.id} onClick={() => setExpanded(expanded === e.id ? null : e.id)}
              className="rounded-xl border border-gray-700/40 bg-gray-900/60 px-4 py-3 cursor-pointer hover:bg-gray-800/60 transition-all">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-white capitalize">{e.canonicalName}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">{TYPE_LABEL[e.entityType ?? "individual"]}</p>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                  {e.propertyCount} properties
                </span>
              </div>
              {expanded === e.id && (
                <div className="mt-2 pt-2 border-t border-gray-700/40 space-y-1">
                  {e.properties.map(p => (
                    <p key={p.id} className="text-[11px] text-gray-400">{p.address} <span className="text-gray-600">({p.assetClass})</span></p>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
