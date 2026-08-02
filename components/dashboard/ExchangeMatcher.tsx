"use client"

import { useState, useEffect, useCallback } from "react"

interface ExchangeRequestRow {
  id: string
  sellingPropertyAddress: string
  saleClosingDate: string
  identificationDeadline: string
  closingDeadline: string
  targetPriceMin: number | null
  targetPriceMax: number | null
  targetPropertyType: string
  targetCounties: string[]
  status: string
}

interface ExchangeMatch {
  leadId: string
  address: string
  assetClass: string
  score: number
  estimatedValue: number | null
  fitScore: number
  fitReasons: string[]
}

const INPUT = "w-full bg-gray-900/80 border border-gray-700/50 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/20"
const LABEL = "block text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1"

function fmtMoney(n: number | null) {
  if (n === null) return "—"
  return `$${n.toLocaleString()}`
}

export default function ExchangeMatcher() {
  const [requests, setRequests] = useState<ExchangeRequestRow[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [matches, setMatches] = useState<ExchangeMatch[]>([])
  const [daysToIdentify, setDaysToIdentify] = useState<number | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [address, setAddress] = useState("")
  const [saleDate, setSaleDate] = useState("")
  const [priceMin, setPriceMin] = useState("")
  const [priceMax, setPriceMax] = useState("")
  const [propertyType, setPropertyType] = useState("any")
  const [counties, setCounties] = useState("")

  const fetchRequests = useCallback(async () => {
    try {
      const res = await fetch("/api/exchange")
      const data = await res.json()
      setRequests(data.exchangeRequests ?? [])
    } catch {
      setRequests([])
    }
  }, [])

  useEffect(() => { fetchRequests() }, [fetchRequests])

  async function loadMatches(id: string) {
    setSelected(id)
    setMatches([])
    try {
      const res = await fetch(`/api/exchange/${id}/matches`)
      const data = await res.json()
      setMatches(data.matches ?? [])
      setDaysToIdentify(data.daysToIdentify ?? null)
    } catch {
      setMatches([])
    }
  }

  async function submit() {
    if (!address.trim() || !saleDate) return
    setSubmitting(true)
    try {
      const res = await fetch("/api/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sellingPropertyAddress: address,
          saleClosingDate: saleDate,
          targetPriceMin: priceMin ? Number(priceMin) : undefined,
          targetPriceMax: priceMax ? Number(priceMax) : undefined,
          targetPropertyType: propertyType,
          targetCounties: counties.split(",").map(c => c.trim()).filter(Boolean),
        }),
      })
      if (res.ok) {
        setAddress(""); setSaleDate(""); setPriceMin(""); setPriceMax(""); setCounties(""); setShowForm(false)
        await fetchRequests()
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-white">1031 Exchange Matching</h3>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Track a client&apos;s IRS 45-day identification / 180-day closing deadlines and match your existing
            lead inventory against their replacement-property criteria.
          </p>
        </div>
        <button onClick={() => setShowForm(p => !p)}
          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl transition-all">
          {showForm ? "Cancel" : "+ New Exchange"}
        </button>
      </div>

      {showForm && (
        <div className="bg-gray-900/60 border border-gray-700/40 rounded-2xl p-5 space-y-3">
          <div>
            <label className={LABEL}>Selling Property Address</label>
            <input value={address} onChange={e => setAddress(e.target.value)} className={INPUT} placeholder="123 Main St, San Diego, CA" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Sale Closing Date</label>
              <input type="date" value={saleDate} onChange={e => setSaleDate(e.target.value)} className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Target Property Type</label>
              <select value={propertyType} onChange={e => setPropertyType(e.target.value)} className={INPUT}>
                <option value="any">Any</option>
                <option value="residential">Residential</option>
                <option value="commercial">Commercial</option>
              </select>
            </div>
            <div>
              <label className={LABEL}>Target Price Min</label>
              <input type="number" value={priceMin} onChange={e => setPriceMin(e.target.value)} className={INPUT} placeholder="200000" />
            </div>
            <div>
              <label className={LABEL}>Target Price Max</label>
              <input type="number" value={priceMax} onChange={e => setPriceMax(e.target.value)} className={INPUT} placeholder="800000" />
            </div>
          </div>
          <div>
            <label className={LABEL}>Target Counties (comma-separated, optional)</label>
            <input value={counties} onChange={e => setCounties(e.target.value)} className={INPUT} placeholder="San Diego, Riverside" />
          </div>
          <button onClick={submit} disabled={submitting || !address.trim() || !saleDate}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-all">
            {submitting ? "Creating…" : "Create & Find Matches"}
          </button>
        </div>
      )}

      {requests.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-700/50 px-6 py-8 text-center">
          <p className="text-sm text-gray-500">No exchange requests yet.</p>
        </div>
      ) : (
        <div className="grid gap-2">
          {requests.map(r => {
            const daysLeft = Math.round((new Date(r.identificationDeadline).getTime() - Date.now()) / 86400000)
            const urgent = daysLeft <= 14 && daysLeft >= 0
            return (
              <div key={r.id} onClick={() => loadMatches(r.id)}
                className={`rounded-xl border px-4 py-3 cursor-pointer transition-all ${selected === r.id ? "border-indigo-500/50 bg-gray-800/80" : "border-gray-700/40 bg-gray-900/60 hover:bg-gray-800/60"}`}>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-white">{r.sellingPropertyAddress}</p>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${urgent ? "bg-red-500/15 text-red-300 border-red-500/30" : "bg-gray-700/40 text-gray-400 border-gray-600/40"}`}>
                    {daysLeft >= 0 ? `${daysLeft}d to identify` : "Deadline passed"}
                  </span>
                </div>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  {r.targetPropertyType} · {fmtMoney(r.targetPriceMin)}–{fmtMoney(r.targetPriceMax)}
                  {r.targetCounties.length > 0 ? ` · ${r.targetCounties.join(", ")}` : ""}
                </p>
              </div>
            )
          })}
        </div>
      )}

      {selected && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
            Matches {daysToIdentify !== null && `— ${daysToIdentify} days left to identify replacement property`}
          </p>
          {matches.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-700/50 px-4 py-6 text-center">
              <p className="text-sm text-gray-500">No matching leads in inventory yet — broaden the price range or check back as new leads come in.</p>
            </div>
          ) : (
            <div className="grid gap-2">
              {matches.map(m => (
                <div key={m.leadId} className="flex items-center gap-3 rounded-xl border border-gray-700/40 bg-gray-900/60 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{m.address}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">{m.fitReasons.join(" · ")}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-white">{m.fitScore}% fit</p>
                    <p className="text-[10px] text-gray-500">{fmtMoney(m.estimatedValue)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
