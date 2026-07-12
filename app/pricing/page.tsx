"use client"

// Public pricing — anchored on deal ROI, not software features. Founding-member
// prices with the regular price struck through, the only-us comparison table,
// live proof stats, and the free ladder (/analyze → /proof → paid). CTAs route
// to /signup?plan=X; the existing billing flow handles checkout after signup.

import { useEffect, useState } from "react"
import Link from "next/link"
import { RE_TIERS } from "@/lib/plans"

interface ProofStats { verified: number; watched: number; avgLeadDays: number | null }

const ONLY_US = [
  { what: "Outcome-verified predictions (public accuracy record)", us: true, them: false },
  { what: "Exclusive inbound sellers (homeowners come to you)", us: true, them: false },
  { what: "Provenance on every fact (assessor vs listing vs AI)", us: true, them: false },
  { what: "Cash-buyer dossiers (portfolio, activity, mailing)", us: true, them: false },
  { what: "Acquisition agent (sequences, drafts, action queue)", us: true, them: false },
  { what: "A database that compounds — never resold stale rows", us: true, them: false },
  { what: "Per-record / per-export fees", us: false, them: true },
]

const FAQ = [
  { q: "How is this different from PropStream or DealMachine?", a: "They sell you the same static records everyone else buys. AutoPilot predicts distress before it's on any list (and publicly verifies its accuracy), generates exclusive inbound sellers, profiles the actual cash buyers for your exit, and works your leads with an acquisition agent. See the comparison above — most of it exists nowhere else." },
  { q: "What does 'founding member' mean?", a: "Early users lock the founding price for as long as they stay subscribed. Public pricing rises as the Index and accuracy record grow — joining early is genuinely the best deal this will ever be." },
  { q: "Do I need any other subscriptions or data keys?", a: "No. The platform runs on its own data systems — county records, registries, public data, and our own AI. Optional premium keys (like RentCast) sharpen valuations but nothing requires them." },
  { q: "Can I bring my existing lead list?", a: "Yes — export a CSV from PropStream, DealMachine, BatchLeads, or any spreadsheet and import it in one click. The acquisition agent starts working your list immediately. Switching takes about five minutes." },
  { q: "Can I cancel anytime?", a: "Yes, from the billing page, no calls required. Your founding rate is only lost if you cancel and rejoin later at the current price." },
]

export default function PricingPage() {
  const [proof, setProof] = useState<ProofStats | null>(null)

  useEffect(() => {
    let alive = true
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/public/accuracy")
        const d = await res.json()
        if (alive && d.stats) setProof({ verified: d.stats.verified ?? 0, watched: d.stats.watched ?? 0, avgLeadDays: d.stats.avgLeadDays ?? null })
      } catch { /* stats are decoration */ }
    }, 0)
    return () => { alive = false; clearTimeout(t) }
  }, [])

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-900 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg,#4f46e5,#7c3aed)" }}>
              <span className="text-white font-bold text-xs">AP</span>
            </div>
            <span className="font-bold">AutoPilot</span>
          </div>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/analyze" className="text-gray-400 hover:text-white">Free analyzer</Link>
            <Link href="/proof" className="text-gray-400 hover:text-white">Accuracy</Link>
            <Link href="/signup" className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-4 py-2 rounded-lg">Sign up</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-14 space-y-14">
        <section className="text-center">
          <p className="inline-block text-[11px] font-bold uppercase tracking-wider bg-amber-950/60 border border-amber-700/50 text-amber-300 px-3 py-1 rounded-full">Founding-member pricing — locked forever while it lasts</p>
          <h1 className="text-3xl sm:text-5xl font-extrabold leading-tight mt-4">One deal pays for years of this.<br /><span className="text-indigo-400">The math is not close.</span></h1>
          <p className="text-gray-400 mt-4 max-w-2xl mx-auto">A single wholesale assignment fee runs $10,000–$30,000. AutoPilot finds the deal, predicts it before the lists do, hands you the owner, works the outreach, and profiles the buyer for your exit — for less per month than one direct-mail batch.</p>
          {proof && (proof.watched > 0 || proof.verified > 0) && (
            <p className="text-xs text-gray-600 mt-3">Live: {proof.watched.toLocaleString()} properties under outcome monitoring · {proof.verified} verified predictions{proof.avgLeadDays != null ? ` · avg ${proof.avgLeadDays}-day head start` : ""} — <Link href="/proof" className="text-indigo-400 hover:text-indigo-300">see the record</Link></p>
          )}
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {RE_TIERS.map((t) => (
            <div key={t.key} className={`rounded-2xl border p-5 flex flex-col ${t.highlight ? "bg-gradient-to-b from-indigo-950/60 to-gray-900/80 border-indigo-500/60 lg:scale-[1.03]" : "bg-gray-900/60 border-gray-800"}`}>
              {t.highlight && <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-300 mb-1">Most popular</p>}
              <h2 className="text-lg font-bold">{t.name}</h2>
              <p className="text-[11px] text-gray-500 mt-0.5 min-h-[2rem]">{t.tagline}</p>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold">{t.founding === 0 ? "Free" : `$${t.founding}`}</span>
                {t.founding > 0 && <span className="text-sm text-gray-500">/mo</span>}
                {t.founding > 0 && t.monthly > t.founding && <span className="text-sm text-gray-600 line-through">${t.monthly}</span>}
              </div>
              <ul className="mt-4 space-y-1.5 flex-1">
                {t.features.map((f) => (
                  <li key={f} className="text-[12px] text-gray-300 flex gap-1.5"><span className="text-emerald-400 shrink-0">✓</span>{f}</li>
                ))}
              </ul>
              <Link href={t.key === "FREE" ? "/signup" : `/signup?plan=${t.key}`}
                className={`mt-5 text-center text-sm font-bold px-4 py-2.5 rounded-xl transition-colors ${t.highlight ? "bg-indigo-600 hover:bg-indigo-500 text-white" : "bg-gray-800 hover:bg-gray-700 text-gray-100 border border-gray-700"}`}>
                {t.cta}
              </Link>
            </div>
          ))}
        </section>

        <section>
          <h2 className="text-xl font-bold text-center mb-4">Things that exist nowhere else</h2>
          <div className="overflow-x-auto">
            <table className="w-full max-w-3xl mx-auto text-sm">
              <thead>
                <tr className="text-gray-500 text-left border-b border-gray-800">
                  <th className="py-2 pr-4 font-semibold"> </th>
                  <th className="py-2 px-3 font-semibold text-indigo-300">AutoPilot</th>
                  <th className="py-2 px-3 font-semibold">PropStream / DealMachine</th>
                </tr>
              </thead>
              <tbody>
                {ONLY_US.map((r) => (
                  <tr key={r.what} className="border-b border-gray-900">
                    <td className="py-2.5 pr-4 text-gray-300">{r.what}</td>
                    <td className="py-2.5 px-3">{r.us ? <span className="text-emerald-400 font-bold">✓</span> : <span className="text-gray-600">—</span>}</td>
                    <td className="py-2.5 px-3">{r.them ? <span className="text-rose-400 font-bold">✓ (they charge it)</span> : <span className="text-gray-600">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6 text-center">
          <h2 className="text-lg font-bold">Not ready? Take the free ladder.</h2>
          <p className="text-sm text-gray-400 mt-1">Underwrite any address at <Link href="/analyze" className="text-indigo-400 hover:text-indigo-300">/analyze</Link> · check our public accuracy record at <Link href="/proof" className="text-indigo-400 hover:text-indigo-300">/proof</Link> — then decide.</p>
        </section>

        <section className="max-w-3xl mx-auto">
          <h2 className="text-xl font-bold mb-3 text-center">Questions investors actually ask</h2>
          <div className="space-y-2">
            {FAQ.map((f) => (
              <details key={f.q} className="bg-gray-900/60 border border-gray-800 rounded-xl p-4">
                <summary className="font-semibold text-white text-sm cursor-pointer list-none">❓ {f.q}</summary>
                <p className="text-sm text-gray-400 mt-2 leading-relaxed">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <footer className="border-t border-gray-900 pt-6 pb-8 text-center">
          <p className="text-[11px] text-gray-600">Prices in USD. Results depend on your market and effort — real estate has risk, and no software replaces judgment. Cancel anytime.</p>
        </footer>
      </main>
    </div>
  )
}
