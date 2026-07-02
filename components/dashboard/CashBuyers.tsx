"use client"

// Cash Buyers — our own keyless way to FIND the buyers for your deals. Enter a
// county and it pulls the active investors/landlords (owners of many properties)
// from public assessor data, with mailing addresses, so you can reach them for
// instant disposition. Export the list to mail/market your deals to them.

import { useState } from "react"

interface CashBuyer { owner: string; count: number; mailing: string | null }

export default function CashBuyers({ password }: { password: string }) {
  const [county, setCounty] = useState("")
  const [stateAbbr, setStateAbbr] = useState("")
  const [limit, setLimit]   = useState(40)
  const [loading, setLoading] = useState(false)
  const [buyers, setBuyers] = useState<CashBuyer[] | null>(null)
  const [note, setNote]     = useState<string | null>(null)

  const search = async () => {
    if (!county.trim() || !stateAbbr.trim()) { setNote("Enter a county and state."); return }
    setLoading(true); setNote(null); setBuyers(null)
    try {
      const res = await fetch("/api/leads/buyers", { method: "POST", headers: { "Content-Type": "application/json", "x-admin-password": password }, body: JSON.stringify({ county: county.trim(), state: stateAbbr.trim(), limit }) })
      const data = await res.json()
      if (data?.error) { setNote(data.error); return }
      setBuyers(data.buyers ?? [])
      if (data.note) setNote(data.note)
    } catch { setNote("Search failed — try again.") }
    setLoading(false)
  }

  const csv = () => {
    if (!buyers || typeof window === "undefined") return
    const q = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`
    const rows = buyers.map((b) => [b.owner, b.count, b.mailing ?? ""].map(q).join(","))
    const blob = new Blob([["buyer,properties_owned,mailing_address", ...rows].join("\n")], { type: "text/csv" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob); a.download = `cash-buyers-${county.toLowerCase()}.csv`; a.click()
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-bold text-white">🤝 Cash Buyers</h3>
        <p className="text-sm text-gray-400 mt-0.5">Find the actual buyers for your deals — active investors and landlords who own many properties in a county, pulled from public assessor data with their mailing address. Instant disposition: market your deals straight to them.</p>
      </div>

      <div className="bg-gray-900/60 border border-gray-700/40 rounded-2xl p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input value={county} onChange={(e) => setCounty(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} placeholder="County (e.g. Wayne)" className="bg-gray-800/60 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 sm:col-span-2" />
          <input value={stateAbbr} onChange={(e) => setStateAbbr(e.target.value.toUpperCase().slice(0, 2))} onKeyDown={(e) => e.key === "Enter" && search()} placeholder="State (e.g. MI)" className="bg-gray-800/60 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500" />
        </div>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <label className="flex items-center gap-2 text-xs font-semibold text-gray-300">How many buyers:
            <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="bg-gray-800/60 border border-gray-700/50 rounded-lg px-3 py-1.5 text-sm text-white">
              {[20, 40, 60, 100].map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
          <button onClick={search} disabled={loading} className="text-sm font-semibold px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white">{loading ? "Finding buyers…" : "🤝 Find cash buyers"}</button>
        </div>
        <p className="text-[11px] text-gray-600">Live: Wayne County, MI (Detroit). More counties added one at a time.</p>
      </div>

      {note && <p className="text-xs text-amber-300">{note}</p>}

      {buyers && buyers.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500">{buyers.length} active cash buyers · sorted by properties owned</p>
          <button onClick={csv} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-amber-500/40 bg-amber-600/15 hover:bg-amber-600/30 text-amber-200">⬇ Export buyer list (CSV)</button>
        </div>
      )}

      <div className="space-y-2">
        {(buyers ?? []).map((b, i) => (
          <div key={`${b.owner}-${i}`} className="bg-gray-900/60 border border-gray-700/40 rounded-xl p-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-white truncate">👤 {b.owner}</p>
              {b.mailing && <p className="text-xs text-gray-400 mt-0.5">✉ {b.mailing}</p>}
            </div>
            <span className="text-[11px] font-bold text-emerald-300 shrink-0">{b.count} properties</span>
          </div>
        ))}
      </div>
    </div>
  )
}
