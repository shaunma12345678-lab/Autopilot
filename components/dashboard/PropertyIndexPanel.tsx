"use client"

// 🧬 The Index — the dashboard for OUR proprietary property database. Every
// search and every nightly run feeds it; records never expire, they accumulate
// provenance (which source verified which fact), a data-confidence score, and
// the versioned Potential Score. This panel shows the asset growing: live
// stats, verified coverage, and a query view with the full per-record
// breakdown (fields + sources + signal history).

import { useCallback, useEffect, useMemo, useState } from "react"

interface FieldObs { v: string | number | boolean; src: string; t: number; at: string }
interface IndexRecord {
  id: string; sig: string; address: string; city: string | null; state: string | null; zip: string | null
  fields: Record<string, FieldObs>
  signals: Array<{ s: string; src: string; at: string }>
  stage: string | null; potential: number | null; potentialV: string | null; confidence: number | null
  firstSeen: string; lastSeen: string; seenCount: number
}
interface Stats { total: number; withOwner: number; assessorVerified: number; avgConfidence: number | null; avgPotential: number | null; prime: number; cities: number; newest: string | null }
interface Coverage { parcels: Array<{ key: string; label: string; hasOwner: boolean; hasMailing: boolean; hasSqft: boolean }>; buyers: string[]; recorder: string[] }

const SRC_LABEL: Record<string, string> = {
  "county-assessor": "Assessor", "recorder-direct": "Recorder", "ca-doj": "CA DOJ", "gov-open-data": "Gov data",
  "hud-reo": "HUD", "census-geocode": "Census", "listing": "Listing", "auction-site": "Auction", "legal-notice": "Notice",
  "rentcast": "RentCast", "comp-model": "Modeled", "web-ai": "Web AI", "inbound-seller": "Owner-said", "unknown": "Mixed",
}
const srcCls = (t: number) => t >= 85 ? "bg-emerald-950/60 border-emerald-700/50 text-emerald-300" : t >= 60 ? "bg-sky-950/60 border-sky-800/50 text-sky-300" : "bg-gray-800 border-gray-700 text-gray-400"

function confCls(c: number | null): string {
  if (c == null) return "bg-gray-700 text-gray-300"
  return c >= 70 ? "bg-emerald-600 text-white" : c >= 45 ? "bg-amber-600 text-white" : "bg-gray-700 text-gray-300"
}

const fmtV = (v: string | number | boolean, key: string): string => {
  if (typeof v === "number" && /value|price|liens|rent/i.test(key)) return `$${Math.round(v).toLocaleString()}`
  return String(v)
}

export default function PropertyIndexPanel({ password }: { password: string }) {
  const apiHeaders = useMemo(() => ({ "Content-Type": "application/json", "x-admin-password": password }), [password])
  const [stats, setStats] = useState<Stats | null>(null)
  const [coverage, setCoverage] = useState<Coverage | null>(null)
  const [city, setCity] = useState("")
  const [stateAbbr, setStateAbbr] = useState("")
  const [zip, setZip] = useState("")
  const [records, setRecords] = useState<IndexRecord[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/index-db", { headers: apiHeaders })
      const d = await res.json()
      if (d.stats) setStats(d.stats)
      if (d.coverage) setCoverage(d.coverage)
    } catch { setNote("Couldn't load index stats — refresh to retry.") }
  }, [apiHeaders])

  useEffect(() => {
    const t = setTimeout(() => { void load() }, 0)
    return () => clearTimeout(t)
  }, [load])

  const query = async () => {
    if (!city.trim() && !zip.trim()) { setNote("Enter a city or ZIP to query the index."); return }
    setLoading(true); setNote(null); setRecords(null); setOpen(null)
    try {
      const res = await fetch("/api/index-db", { method: "POST", headers: apiHeaders, body: JSON.stringify({ city: city.trim(), state: stateAbbr.trim(), zip: zip.trim(), limit: 60 }) })
      const d = await res.json()
      if (d.error) { setNote(d.error) } else { setRecords(d.records ?? []) }
    } catch { setNote("Query failed — try again.") }
    setLoading(false)
  }

  const tiles = stats ? [
    { l: "Properties indexed", v: stats.total.toLocaleString(), s: "canonical records — never expire", c: "text-indigo-400" },
    { l: "Prime (75+)", v: stats.prime.toLocaleString(), s: "top-tier Potential Score", c: "text-emerald-400" },
    { l: "Avg confidence", v: stats.avgConfidence != null ? `${stats.avgConfidence}%` : "—", s: "data quality (recent 1k)", c: "text-amber-400" },
    { l: "Owner known", v: String(stats.withOwner), s: "of recent 1k records", c: "text-sky-400" },
    { l: "Assessor-verified", v: String(stats.assessorVerified), s: "county-record facts (recent 1k)", c: "text-emerald-300" },
    { l: "Cities", v: String(stats.cities), s: "in the recent sample", c: "text-violet-400" },
  ] : []

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-bold text-white">🧬 The Index — our own property database</h3>
        <p className="text-sm text-gray-400 mt-0.5 max-w-3xl">Every search and every nightly run feeds one permanent record per property. Fields carry <b className="text-gray-300">provenance</b> (assessor beats registry beats listing beats AI), each record gets a <b className="text-gray-300">data-confidence score</b> and the versioned <b className="text-gray-300">Potential Score</b> — and thin high-potential records self-heal overnight from county records. The longer it runs, the harder this is to copy.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {tiles.map((t) => (
          <div key={t.l} className="bg-gray-900/70 border border-gray-800 rounded-xl p-3">
            <p className={`text-xl font-extrabold ${t.c}`}>{t.v}</p>
            <p className="text-[11px] font-semibold text-gray-300">{t.l}</p>
            <p className="text-[10px] text-gray-600">{t.s}</p>
          </div>
        ))}
        {!stats && <p className="text-sm text-gray-600 col-span-full">Loading index stats… (empty until the first search after this deploy feeds it)</p>}
      </div>

      {/* Verified coverage — the flywheel made visible */}
      {coverage && (
        <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-4">
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Verified connectors (each one permanently upgrades the index)</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px]">
            <div>
              <p className="font-semibold text-emerald-300 mb-1">🏛 County assessor (owner/facts)</p>
              {coverage.parcels.map((p) => (
                <p key={p.key} className="text-gray-400">• {p.label}{p.hasOwner ? " · owner" : ""}{p.hasMailing ? " · mailing" : ""}{p.hasSqft ? " · sqft" : ""}</p>
              ))}
            </div>
            <div>
              <p className="font-semibold text-sky-300 mb-1">🤝 Buyer intelligence</p>
              {coverage.buyers.map((b) => <p key={b} className="text-gray-400">• {b}</p>)}
            </div>
            <div>
              <p className="font-semibold text-amber-300 mb-1">📜 Recorder-direct feeds</p>
              {coverage.recorder.map((r) => <p key={r} className="text-gray-400">• {r}</p>)}
            </div>
          </div>
        </div>
      )}

      {/* Query the index */}
      <div className="bg-gray-900/60 border border-indigo-500/25 rounded-2xl p-4">
        <div className="flex flex-wrap items-center gap-2">
          <input value={city} onChange={(e) => setCity(e.target.value)} onKeyDown={(e) => e.key === "Enter" && query()} placeholder="City" className="bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 w-44" />
          <input value={stateAbbr} onChange={(e) => setStateAbbr(e.target.value.toUpperCase().slice(0, 2))} placeholder="ST" className="bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 w-14" />
          <span className="text-xs text-gray-600">or</span>
          <input value={zip} onChange={(e) => setZip(e.target.value)} onKeyDown={(e) => e.key === "Enter" && query()} placeholder="ZIP" inputMode="numeric" className="bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 w-24" />
          <button onClick={query} disabled={loading} className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-bold px-5 py-2 rounded-lg">{loading ? "Querying…" : "🧬 Query the index"}</button>
          <span className="text-[11px] text-gray-600">ranked by Potential Score</span>
        </div>
        {note && <p className="text-xs text-amber-300 mt-2">{note}</p>}
      </div>

      {records && records.length === 0 && (
        <p className="text-sm text-gray-600">Nothing indexed there yet — run a Real Estate search on that area and it lands here permanently.</p>
      )}

      <div className="space-y-2">
        {records?.map((r) => {
          const fieldEntries = Object.entries(r.fields ?? {})
          return (
            <div key={r.id} className="bg-gray-900/60 border border-gray-800 rounded-xl p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {r.potential != null && <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 ${r.potential >= 75 ? "bg-emerald-600 text-white" : r.potential >= 58 ? "bg-amber-600 text-white" : "bg-gray-700 text-gray-200"}`} title={`Potential Score ${r.potentialV ?? ""}`}>🧬 {r.potential}</span>}
                  <p className="text-sm font-semibold text-white truncate">{r.address}{r.city ? `, ${r.city}` : ""} {r.zip ?? ""}</p>
                  {r.stage && <span className="text-[10px] text-fuchsia-300 bg-fuchsia-950/50 border border-fuchsia-800/40 rounded px-1.5 py-0.5 shrink-0">{r.stage.replace(/_/g, " ")}</span>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${confCls(r.confidence)}`} title="Data confidence — completeness × source trust">{r.confidence ?? "—"}% data</span>
                  <span className="text-[10px] text-gray-600">seen {r.seenCount}× · since {r.firstSeen?.slice(0, 10)}</span>
                  <button onClick={() => setOpen(open === r.id ? null : r.id)} className="text-[11px] text-indigo-300 hover:text-indigo-200 font-semibold">{open === r.id ? "Hide" : "Breakdown"}</button>
                </div>
              </div>

              {open === r.id && (
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="bg-gray-950/60 border border-gray-800 rounded-lg p-3">
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Verified facts · who told us what</p>
                    {fieldEntries.length === 0 && <p className="text-[11px] text-gray-600">No enriched facts yet — the nightly backfill works high-potential records first.</p>}
                    <div className="space-y-1">
                      {fieldEntries.map(([k, o]) => (
                        <div key={k} className="flex items-center gap-2 text-[11px]">
                          <span className="text-gray-500 w-28 shrink-0">{k}</span>
                          <span className="text-gray-200 truncate flex-1">{fmtV(o.v, k)}</span>
                          <span className={`px-1.5 py-0.5 rounded border shrink-0 ${srcCls(o.t)}`} title={`trust ${o.t}/100 · ${o.at?.slice(0, 10)}`}>{SRC_LABEL[o.src] ?? o.src}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="bg-gray-950/60 border border-gray-800 rounded-lg p-3">
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Signal history · {r.signals?.length ?? 0} observed</p>
                    <div className="space-y-1 max-h-44 overflow-y-auto">
                      {(r.signals ?? []).slice().reverse().map((s, i) => (
                        <p key={i} className="text-[11px] text-gray-400"><span className="text-gray-600">{s.at?.slice(0, 10)}</span> · {s.s}</p>
                      ))}
                      {(!r.signals || r.signals.length === 0) && <p className="text-[11px] text-gray-600">No distress signals recorded yet.</p>}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
