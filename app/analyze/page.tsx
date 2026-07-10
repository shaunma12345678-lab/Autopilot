"use client"

// /analyze — the free public deal analyzer. Type any US address and get the
// instant underwrite our users see: value estimate, rehab, max allowable
// offer, projected profit, and a verdict. The "wow, it just did my homework"
// moment that converts visitors — a few free runs per day, then the platform.

import { useState } from "react"
import Link from "next/link"

interface Result {
  found: boolean
  property: { beds: number | null; baths: number | null; sqft: number | null; yearBuilt: number | null; type: string | null }
  value: number
  analysis: { arv: number; mao: number; repairs: number; profit: number; roi: number | null; grade: string; verdict: string; reason: string } | null
  note: string | null
}

const money = (n: number) => `$${Math.round(n).toLocaleString()}`

export default function AnalyzePage() {
  const [form, setForm] = useState({ address: "", city: "", state: "", zip: "", website: "" })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const run = async () => {
    if (!form.address.trim()) { setError("Enter a property address."); return }
    setLoading(true); setError(null); setResult(null)
    try {
      const res = await fetch("/api/public/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Analysis failed — try again.")
      setResult(data)
    } catch (e) { setError(e instanceof Error ? e.message : "Analysis failed — try again.") }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-900 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg,#4f46e5,#7c3aed)" }}>
              <span className="text-white font-bold text-xs">AP</span>
            </div>
            <span className="font-bold">Free Deal Analyzer</span>
          </div>
          <Link href="/proof" className="text-xs text-gray-400 hover:text-white">Our accuracy record →</Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-14 space-y-8">
        <section className="text-center">
          <h1 className="text-3xl sm:text-4xl font-extrabold leading-tight">Underwrite any address<br /><span className="text-indigo-400">in about 20 seconds. Free.</span></h1>
          <p className="text-gray-400 mt-3 max-w-xl mx-auto">Value estimate, rehab budget, max allowable offer, projected profit, and a straight verdict — the same engine our investors run on every lead.</p>
        </section>

        <div className="bg-gray-900/70 border border-indigo-500/30 rounded-2xl p-6">
          <div className="grid sm:grid-cols-2 gap-3">
            <input value={form.address} onChange={set("address")} onKeyDown={(e) => { if (e.key === "Enter") void run() }} placeholder="Street address * — e.g. 4849 Peck Rd" className="bg-gray-950 border border-gray-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 sm:col-span-2" />
            <input value={form.city} onChange={set("city")} placeholder="City" className="bg-gray-950 border border-gray-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500" />
            <div className="grid grid-cols-2 gap-3">
              <input value={form.state} onChange={set("state")} placeholder="State" maxLength={2} className="bg-gray-950 border border-gray-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500" />
              <input value={form.zip} onChange={set("zip")} placeholder="ZIP" inputMode="numeric" className="bg-gray-950 border border-gray-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500" />
            </div>
          </div>
          <input value={form.website} onChange={set("website")} tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" placeholder="Website" />
          <button onClick={run} disabled={loading} className="mt-4 w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold px-8 py-3 rounded-xl transition-colors">
            {loading ? "Analyzing — pulling records, valuing, underwriting…" : "⚡ Analyze it free"}
          </button>
          {error && <p className="text-sm text-amber-300 mt-3">{error}</p>}
          <p className="text-[11px] text-gray-600 mt-3">5 free analyses per day. Estimates from public records + our valuation models — verify before you buy.</p>
        </div>

        {result && (
          <div className="bg-gray-900/70 border border-gray-800 rounded-2xl p-6 space-y-4">
            {result.found ? (
              <>
                <div className="flex flex-wrap items-center gap-2 text-sm text-gray-300">
                  <span className="font-semibold text-white">{form.address}{form.city ? `, ${form.city}` : ""}</span>
                  {result.property.beds != null && <span>· {result.property.beds} bd</span>}
                  {result.property.baths != null && <span>· {result.property.baths} ba</span>}
                  {result.property.sqft != null && <span>· {result.property.sqft.toLocaleString()} sqft</span>}
                  {result.property.yearBuilt != null && <span>· built {result.property.yearBuilt}</span>}
                </div>
                {result.analysis ? (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { l: "Est. value (ARV)", v: money(result.analysis.arv) },
                        { l: "Rehab budget", v: money(result.analysis.repairs) },
                        { l: "Max offer (MAO)", v: money(result.analysis.mao) },
                        { l: "Projected profit", v: money(result.analysis.profit) },
                      ].map((t) => (
                        <div key={t.l} className="bg-gray-950/70 border border-gray-800 rounded-xl p-3 text-center">
                          <p className="text-lg font-extrabold text-indigo-300">{t.v}</p>
                          <p className="text-[11px] text-gray-500">{t.l}</p>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-3 bg-gray-950/70 border border-gray-800 rounded-xl p-4">
                      <span className="text-2xl font-extrabold text-emerald-400">{result.analysis.grade}</span>
                      <div>
                        <p className="text-sm font-bold text-white">{result.analysis.verdict}</p>
                        <p className="text-xs text-gray-400">{result.analysis.reason}</p>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-gray-400">Found the property, but not enough value data for a full underwrite — full accounts get deeper enrichment (county parcel records + live valuation).</p>
                )}
              </>
            ) : (
              <p className="text-sm text-gray-400">{result.note}</p>
            )}
            <div className="border-t border-gray-800 pt-4 text-center">
              <p className="text-sm text-gray-300 font-semibold">This is one address. The platform finds hundreds like it — before they hit anyone&apos;s list.</p>
              <p className="text-xs text-gray-500 mt-1">Predictive foreclosure forecasts (verified accuracy at <Link href="/proof" className="text-indigo-400 hover:text-indigo-300">/proof</Link>), owner &amp; mailing records, deal sheets, outreach on autopilot.</p>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
