"use client"

// In-app Property & Records view — keeps Map, Street View and records ON our
// site instead of opening external tabs. Embeds our own Leaflet map (no key)
// and a keyless Google Street View pano, and lays out every record we have.
// Zillow/county can't be iframed (they block embedding), so they stay as clearly
// secondary "open externally" links.

import { useEffect, useRef, useState, type ReactNode } from "react"
import "leaflet/dist/leaflet.css"
import type { Map as LeafletMap } from "leaflet"
import type { ForeclosureLead } from "@/lib/agents/foreclosure-agent"

const fmt = (n: number | null | undefined, pre = "", suf = "") =>
  n == null ? "—" : `${pre}${Number(n).toLocaleString()}${suf}`

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-0.5">
      <span className="text-[11px] text-gray-500 shrink-0">{label}</span>
      <span className="text-[11px] text-gray-200 text-right">{value ?? "—"}</span>
    </div>
  )
}

export default function PropertyModal({ lead, apiHeaders, onClose, onEnrich }: {
  lead: ForeclosureLead
  apiHeaders: Record<string, string>
  onClose: () => void
  onEnrich: (attomId: number, patch: Record<string, unknown>) => void
}) {
  const mapElRef = useRef<HTMLDivElement | null>(null)
  const mapRef   = useRef<LeafletMap | null>(null)
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [enrichState, setEnrichState] = useState<"idle"|"loading"|"note">("idle")
  const [enrichNote, setEnrichNote]   = useState("")

  const full = [lead.address, lead.city, lead.state, lead.zip].filter(Boolean).join(", ")
  const q = encodeURIComponent(full)

  // Geocode the address for the map + Street View.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch("/api/geocode", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ addresses: [full] }) })
        const data = await res.json()
        const ll = data?.results?.[0]
        if (!cancelled && ll && typeof ll.lat === "number") setCoords(ll)
      } catch { /* map just won't show */ }
    })()
    return () => { cancelled = true }
  }, [full])

  // Render the Leaflet map once we have coordinates.
  useEffect(() => {
    if (!coords || !mapElRef.current || mapRef.current) return
    let cancelled = false
    ;(async () => {
      const L = (await import("leaflet")).default
      if (cancelled || !mapElRef.current) return
      const map = L.map(mapElRef.current, { zoomControl: true, scrollWheelZoom: false }).setView([coords.lat, coords.lng], 16)
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap" }).addTo(map)
      L.circleMarker([coords.lat, coords.lng], { radius: 9, color: "#fff", weight: 2, fillColor: "#ef4444", fillOpacity: 1 }).addTo(map)
      mapRef.current = map
      setTimeout(() => map.invalidateSize(), 60)
    })()
    return () => { cancelled = true }
  }, [coords])

  useEffect(() => () => { mapRef.current?.remove(); mapRef.current = null }, [])

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const runEnrich = async () => {
    setEnrichState("loading"); setEnrichNote("")
    try {
      const res = await fetch("/api/leads/enrich", {
        method: "POST", headers: apiHeaders,
        body: JSON.stringify({ address: lead.address, city: lead.city, state: lead.state, zip: lead.zip, totalLiens: lead.totalLiens }),
      })
      const data = await res.json()
      if (data.patch && Object.keys(data.patch).length > 0) { onEnrich(lead.attomId, data.patch); setEnrichState("note"); setEnrichNote("✓ Details filled from public records.") }
      else { setEnrichState("note"); setEnrichNote(data.note ?? "No additional records found.") }
    } catch { setEnrichState("note"); setEnrichNote("Enrichment failed.") }
  }

  const svUrl = coords ? `https://maps.google.com/maps?q=&layer=c&cbll=${coords.lat},${coords.lng}&cbp=11,0,0,0,0&output=svembed` : null
  const ext = "text-[11px] text-indigo-300 hover:text-indigo-200 underline"

  return (
    <div className="fixed inset-0 z-[2000] bg-black/70 flex items-start justify-center overflow-y-auto p-4" onClick={onClose}>
      <div className="bg-gray-950 border border-gray-700/60 rounded-2xl w-full max-w-4xl my-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800 sticky top-0 bg-gray-950 rounded-t-2xl">
          <div>
            <div className="text-sm font-bold text-white">{lead.address}</div>
            <div className="text-[11px] text-gray-500">{[lead.city, lead.state, lead.zip].filter(Boolean).join(", ")}</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none px-2">✕</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Enrich */}
          <div>
            <button onClick={runEnrich} disabled={enrichState === "loading"}
              className="w-full bg-gradient-to-r from-amber-600/30 to-orange-600/30 border border-amber-500/40 text-amber-200 hover:from-amber-600/40 hover:to-orange-600/40 disabled:opacity-50 rounded-lg px-3 py-2 text-xs font-semibold">
              {enrichState === "loading" ? "Filling in details…" : "✨ Enrich this property (beds/baths/sqft/owner/value)"}
            </button>
            {enrichState === "note" && <p className={`text-[10px] mt-1 ${enrichNote.startsWith("✓") ? "text-emerald-400" : "text-gray-500"}`}>{enrichNote}</p>}
          </div>

          {/* Map + Street View */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">🗺 Map</div>
              <div ref={mapElRef} className="w-full h-56 rounded-lg bg-slate-900 border border-gray-800 overflow-hidden" />
            </div>
            <div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">📷 Street View</div>
              {svUrl ? (
                <iframe title="Street View" src={svUrl} className="w-full h-56 rounded-lg border border-gray-800" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
              ) : (
                <div className="w-full h-56 rounded-lg bg-slate-900 border border-gray-800 flex items-center justify-center text-[11px] text-gray-600">Locating address…</div>
              )}
            </div>
          </div>

          {/* Records */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1">
            <div>
              <div className="text-[10px] text-gray-600 font-bold uppercase tracking-wider mb-1">Property</div>
              <Row label="Type" value={lead.propertyType ?? "—"} />
              <Row label="Beds / Baths" value={`${lead.beds ?? "—"} / ${lead.baths ?? "—"}`} />
              <Row label="Sqft" value={fmt(lead.sqft)} />
              <Row label="Year built" value={lead.yearBuilt ?? "—"} />
              <Row label="Lot size" value={fmt(lead.lotSize)} />
            </div>
            <div>
              <div className="text-[10px] text-gray-600 font-bold uppercase tracking-wider mb-1">Finances</div>
              <Row label="Est. value" value={fmt(lead.estimatedValue, "$")} />
              <Row label="AVM value" value={fmt(lead.avmValue, "$")} />
              <Row label="Equity" value={lead.equityPercent != null ? `${Math.round(lead.equityPercent)}%` : "—"} />
              <Row label="Total liens" value={fmt(lead.totalLiens, "$")} />
              <Row label="Tax delinquent" value={lead.taxDelinquent ? "Yes" : "No"} />
            </div>
            <div>
              <div className="text-[10px] text-gray-600 font-bold uppercase tracking-wider mb-1">Owner & Foreclosure</div>
              <Row label="Owner" value={lead.ownerName || "Unknown"} />
              <Row label="Absentee" value={lead.isAbsentee ? "Yes" : "No"} />
              <Row label="Mailing" value={lead.mailingAddress ?? "same as property"} />
              <Row label="Stage" value={(lead.foreclosureStage ?? "").replace(/_/g, " ") || "—"} />
              <Row label="Default amt" value={fmt(lead.defaultAmount, "$")} />
              <Row label="Lender" value={lead.lender ?? "—"} />
            </div>
          </div>

          {/* Distress signals */}
          {(lead.distressSignals?.length ?? 0) > 0 && (
            <div>
              <div className="text-[10px] text-gray-600 font-bold uppercase tracking-wider mb-1">Distress signals</div>
              <div className="flex flex-wrap gap-1.5">
                {lead.distressSignals!.map((s, i) => <span key={i} className="text-[10px] px-2 py-0.5 rounded-lg bg-red-500/10 border border-red-500/25 text-red-300">{s}</span>)}
              </div>
            </div>
          )}

          {/* External (can't embed) */}
          <div className="flex flex-wrap gap-3 pt-2 border-t border-gray-800">
            <span className="text-[10px] text-gray-600">Open externally:</span>
            <a className={ext} href={`https://www.zillow.com/homes/${q}_rb/`} target="_blank" rel="noreferrer">Zillow ↗</a>
            <a className={ext} href={`https://www.google.com/maps/search/?api=1&query=${q}`} target="_blank" rel="noreferrer">Google Maps ↗</a>
            <a className={ext} href={`https://www.google.com/search?q=${encodeURIComponent(`${full} county property records owner of record`)}`} target="_blank" rel="noreferrer">County records search ↗</a>
          </div>
        </div>
      </div>
    </div>
  )
}
