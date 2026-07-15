"use client"

// Standalone Distress Map admin tab — map-first area search over the deep-search
// engine. Extracted from app/admin/page.tsx (the monolith split): self-contained,
// props = { password }.

import { useCallback, useEffect, useState } from "react"
import DistressMap from "@/components/dashboard/DistressMap"
import type { ForeclosureLead } from "@/lib/agents/foreclosure-agent"

export default function AdminDistressMap({ password }: { password: string }) {
  const [searchType, setSearchType] = useState<"zip" | "city" | "county">("city")
  const [area, setArea]   = useState("")
  const [state, setState] = useState("")
  const [maxLeads, setMaxLeads] = useState(150)
  const [daysBack, setDaysBack] = useState(90)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [leads, setLeads]       = useState<ForeclosureLead[]>([])
  const [flyTo, setFlyTo]       = useState<string | undefined>(undefined)
  const [searched, setSearched] = useState(false)
  const [businessId, setBusinessId] = useState<string | undefined>(undefined)

  // Resolve a businessId so the map's persistent "new leads" index works here too.
  useEffect(() => {
    fetch("/api/admin/foreclosure", { headers: { "x-admin-password": password } })
      .then(r => r.json()).then(d => setBusinessId(d.businessId ?? "admin")).catch(() => setBusinessId("admin"))
  }, [password])

  const run = useCallback(async () => {
    const a = area.trim()
    if (!a) { setError("Enter a city, ZIP, or county."); return }
    const isZip = /^\d{5}$/.test(a)
    const type: "zip" | "city" | "county" = isZip ? "zip" : searchType === "county" ? "county" : "city"
    if (type !== "zip" && !state.trim()) { setError("Enter a state (e.g. CA)."); return }

    setLoading(true); setError(null); setLeads([]); setSearched(true)
    setFlyTo(isZip ? a : `${a}${searchType === "county" ? " County" : ""}, ${state.trim()}`)
    try {
      const res = await fetch("/api/leads/deep-search", {
        method:  "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body:    JSON.stringify({
          searchType: type,
          zipCode:    type === "zip"    ? a : undefined,
          city:       type === "city"   ? a : undefined,
          county:     type === "county" ? a : undefined,
          state:      type === "zip"    ? undefined : state.trim(),
          maxLeads, daysBack, businessId,
        }),
      })
      if (!res.ok) {
        let msg = `Search failed (${res.status})`
        try { const d = await res.json(); msg = d.error ?? msg } catch { /* ignore */ }
        throw new Error(msg)
      }
      const data = await res.json()
      setLeads(data.leads ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed")
    } finally {
      setLoading(false)
    }
  }, [area, state, searchType, maxLeads, daysBack, password, businessId])

  const hot = leads.filter(l => l.priority === "HOT").length
  const auctions = leads.filter(l => typeof l.daysUntilAuction === "number").length
  const absentee = leads.filter(l => l.isAbsentee).length

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="text-lg font-bold text-white">🗺️ Distress Map</h2>
        <span className="text-xs bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded-full">Pre-foreclosure + distressed · map-first</span>
      </div>

      {/* Search bar */}
      <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-4">
        <div className="flex bg-gray-800/80 border border-gray-700/40 rounded-xl p-1 gap-1 w-fit mb-3">
          {(["city", "zip", "county"] as const).map(t => (
            <button key={t} onClick={() => setSearchType(t)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize transition-colors ${searchType === t ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-white"}`}>
              {t === "zip" ? "ZIP" : t === "city" ? "City/State" : "County"}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[180px]">
            <label className="text-xs text-gray-500">{searchType === "zip" ? "ZIP Code" : searchType === "county" ? "County" : "City"}</label>
            <input value={area} onChange={e => setArea(e.target.value)} onKeyDown={e => { if (e.key === "Enter") run() }}
              placeholder={searchType === "zip" ? "85001" : searchType === "county" ? "Maricopa" : "Phoenix"}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500" />
          </div>
          {searchType !== "zip" && (
            <div className="w-24">
              <label className="text-xs text-gray-500">State</label>
              <input value={state} onChange={e => setState(e.target.value.toUpperCase().slice(0, 2))} onKeyDown={e => { if (e.key === "Enter") run() }}
                placeholder="AZ" maxLength={2}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500" />
            </div>
          )}
          <div className="w-28">
            <label className="text-xs text-gray-500">Max Leads</label>
            <select value={maxLeads} onChange={e => setMaxLeads(Number(e.target.value))}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
              {[50, 100, 150, 250, 350, 500, 750, 1000].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="w-32">
            <label className="text-xs text-gray-500">Date Range</label>
            <select value={daysBack} onChange={e => setDaysBack(Number(e.target.value))}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
              {[30, 60, 90, 180].map(n => <option key={n} value={n}>Last {n} days</option>)}
            </select>
          </div>
          <button onClick={run} disabled={loading}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-lg">
            {loading ? "Searching…" : "Search"}
          </button>
        </div>
        {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
        {leads.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            <span className="text-[11px] px-2 py-0.5 rounded-lg bg-gray-800/60 border border-gray-700/40 text-gray-300">{leads.length} deals</span>
            <span className="text-[11px] px-2 py-0.5 rounded-lg bg-red-500/15 border border-red-500/30 text-red-300">{hot} hot</span>
            <span className="text-[11px] px-2 py-0.5 rounded-lg bg-orange-500/15 border border-orange-500/30 text-orange-300">{auctions} with auction date</span>
            <span className="text-[11px] px-2 py-0.5 rounded-lg bg-violet-500/15 border border-violet-500/30 text-violet-300">{absentee} absentee</span>
          </div>
        )}
      </div>

      {/* Map */}
      {loading && (
        <div className="flex items-center gap-2 text-gray-500 text-sm py-8 justify-center">
          <span className="w-4 h-4 border-2 border-gray-700 border-t-indigo-400 rounded-full animate-spin" />
          Scanning public records &amp; mapping deals across the area…
        </div>
      )}
      {!loading && leads.length > 0 && (
        <DistressMap leads={leads} flyToQuery={flyTo} apiHeaders={{ "x-admin-password": password }} onRefresh={run} businessId={businessId} />
      )}
      {!loading && searched && leads.length === 0 && !error && (
        <div className="text-center py-12 text-gray-600 text-sm">No deals found for that area. Try a larger city or a wider date range.</div>
      )}
      {!searched && !loading && (
        <div className="text-center py-16 text-gray-600">
          <div className="text-3xl mb-2">🗺️</div>
          <p className="text-sm">Enter a city or ZIP above — the map flies there and pins every pre-foreclosure &amp; distressed deal.</p>
          <p className="text-xs text-gray-700 mt-1">Draw a zone, plan a door-knock route, check any address, and toggle comps or distress-density.</p>
        </div>
      )}
    </div>
  )
}
