"use client"

// Shared sections for the homeowner portal (/sell and every /sell/[city] SEO
// page): options grid, timeline, equity check, and the cash-offer form. The
// city pages pass a locality so the form pre-fills and the copy localizes.

import { useState } from "react"

export const OPTIONS = [
  { icon: "🔄", title: "Reinstate the loan", body: "Pay the missed payments plus fees to bring the loan current. In many states you can reinstate up to shortly before the sale date. Ask your lender for a reinstatement quote in writing." },
  { icon: "📝", title: "Loan modification or forbearance", body: "Your lender may restructure the loan (rate, term, missed payments moved to the end) or pause payments temporarily. Call your servicer's loss-mitigation department — you don't need to pay anyone to apply." },
  { icon: "🏠", title: "Sell before the auction", body: "If you have equity, selling before the sale date lets you keep it instead of losing the home and the equity at auction. A cash sale can close in days rather than months." },
  { icon: "🤝", title: "Short sale", body: "If you owe more than the home is worth, the lender may accept a sale for less than the balance. It takes their approval, but it usually hurts your credit far less than a completed foreclosure." },
  { icon: "🔑", title: "Deed in lieu of foreclosure", body: "You hand the keys back to the lender voluntarily and walk away. Usually a last resort when there's no equity — get any debt forgiveness agreement in writing." },
  { icon: "⚖️", title: "Talk to a professional", body: "A HUD-approved housing counselor is free: call 1-800-569-4287. For legal questions, a real estate attorney can review your specific case — many offer free consultations." },
]

export const TIMELINE = [
  { label: "Missed payments", body: "Typically after 3–4 missed payments the lender can start the formal process. This is the best window to act — every option is still open." },
  { label: "Notice of Default (NOD)", body: "The formal starting gun, recorded publicly. In California you then have about 90 days before the next step. You can still reinstate, modify, or sell." },
  { label: "Notice of Trustee Sale", body: "An auction date is set — in California this is at least 21 days out. Options are narrowing fast, but a sale can still be stopped." },
  { label: "Auction day", body: "The home is sold on the courthouse steps and equity above the debt is often lost. Acting even a week earlier can produce a very different outcome." },
]

export function OptionsGrid() {
  return (
    <section>
      <h2 className="text-xl font-bold mb-4">Your options, honestly laid out</h2>
      <div className="grid sm:grid-cols-2 gap-3">
        {OPTIONS.map((o) => (
          <div key={o.title} className="bg-gray-900/70 border border-gray-800 rounded-xl p-4">
            <p className="font-semibold text-white">{o.icon} {o.title}</p>
            <p className="text-sm text-gray-400 mt-1.5 leading-relaxed">{o.body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

export function TimelineSection({ stateName }: { stateName?: string }) {
  return (
    <section>
      <h2 className="text-xl font-bold mb-4">How the timeline usually works</h2>
      <div className="space-y-2">
        {TIMELINE.map((t, i) => (
          <div key={t.label} className="flex gap-4 bg-gray-900/50 border border-gray-800 rounded-xl p-4">
            <div className="w-7 h-7 rounded-full bg-emerald-900/60 border border-emerald-700/50 flex items-center justify-center text-emerald-300 text-xs font-bold shrink-0">{i + 1}</div>
            <div>
              <p className="font-semibold text-white text-sm">{t.label}</p>
              <p className="text-sm text-gray-400 mt-0.5 leading-relaxed">{t.body}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-gray-600 mt-2">
        Timeline shown is typical for California non-judicial foreclosure; {stateName && stateName !== "California" ? `${stateName} differs in its exact steps and windows — ` : "other states differ. "}check your notices for your exact dates.
      </p>
    </section>
  )
}

export function EquityCheck() {
  const [value, setValue] = useState("")
  const [owed, setOwed] = useState("")
  const v = parseInt(value.replace(/[^0-9]/g, ""), 10) || 0
  const o = parseInt(owed.replace(/[^0-9]/g, ""), 10) || 0
  const equity = v - o
  const show = v > 0 && owed !== ""
  return (
    <div className="bg-gray-900/70 border border-gray-800 rounded-2xl p-6">
      <h3 className="text-lg font-bold text-white">Quick equity check</h3>
      <p className="text-sm text-gray-400 mt-1">Equity is what&apos;s yours if the home sells. Foreclosure can wipe it out — knowing the number helps you choose.</p>
      <div className="grid sm:grid-cols-2 gap-3 mt-4">
        <label className="block">
          <span className="text-xs text-gray-500">What is your home worth? (estimate)</span>
          <input value={value} onChange={(e) => setValue(e.target.value)} inputMode="numeric" placeholder="$450,000"
            className="mt-1 w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500" />
        </label>
        <label className="block">
          <span className="text-xs text-gray-500">Roughly how much is owed on it?</span>
          <input value={owed} onChange={(e) => setOwed(e.target.value)} inputMode="numeric" placeholder="$280,000"
            className="mt-1 w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500" />
        </label>
      </div>
      {show && (
        <div className={`mt-4 rounded-xl p-4 border ${equity > 0 ? "bg-emerald-950/40 border-emerald-700/40" : "bg-amber-950/40 border-amber-700/40"}`}>
          {equity > 0 ? (
            <p className="text-sm text-emerald-200">You may have roughly <b className="text-emerald-300">${equity.toLocaleString()}</b> in equity. That money is worth protecting — selling before an auction usually preserves it; losing the home at auction often doesn&apos;t.</p>
          ) : (
            <p className="text-sm text-amber-200">It looks like you may owe as much as (or more than) the home is worth. A short sale or a lender workout is usually the path to look at — a HUD counselor can walk you through it for free: 1-800-569-4287.</p>
          )}
        </div>
      )}
    </div>
  )
}

export function OfferForm({ prefillCity = "", prefillState = "" }: { prefillCity?: string; prefillState?: string }) {
  const [form, setForm] = useState({ name: "", phone: "", email: "", address: "", city: prefillCity, state: prefillState, zip: "", timeframe: "", owed: "", situation: "", website: "" })
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async () => {
    if (!form.address.trim()) { setError("Please enter the property address."); return }
    if (!form.phone.trim() && !form.email.trim()) { setError("Please add a phone number or email so we can reach you."); return }
    setSending(true); setError(null)
    try {
      const res = await fetch("/api/homeowner", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Something went wrong — please try again.")
      setDone(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong — please try again.")
    }
    setSending(false)
  }

  if (done) {
    return (
      <div id="offer" className="bg-emerald-950/40 border border-emerald-700/40 rounded-2xl p-8 text-center">
        <p className="text-3xl">✅</p>
        <h3 className="text-xl font-bold text-white mt-2">Got it — we&apos;ll reach out shortly.</h3>
        <p className="text-sm text-emerald-200 mt-2">No obligation, no pressure. If a cash offer isn&apos;t your best option, we&apos;ll say so.</p>
      </div>
    )
  }

  return (
    <div id="offer" className="bg-gray-900/70 border border-emerald-600/30 rounded-2xl p-6">
      <h3 className="text-lg font-bold text-white">Get a no-obligation cash offer{prefillCity ? ` in ${prefillCity}` : ""}</h3>
      <p className="text-sm text-gray-400 mt-1">Tell us about the property. We respond fast, buy as-is (no repairs, no showings, no fees), and can close on your timeline.</p>
      <div className="grid sm:grid-cols-2 gap-3 mt-4">
        <input value={form.name} onChange={set("name")} placeholder="Your name" className="bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500" />
        <input value={form.phone} onChange={set("phone")} placeholder="Phone" inputMode="tel" className="bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500" />
        <input value={form.email} onChange={set("email")} placeholder="Email" inputMode="email" className="bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500" />
        <input value={form.address} onChange={set("address")} placeholder="Property address *" className="bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500" />
        <input value={form.city} onChange={set("city")} placeholder="City" className="bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500" />
        <div className="grid grid-cols-2 gap-3">
          <input value={form.state} onChange={set("state")} placeholder="State" maxLength={2} className="bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500" />
          <input value={form.zip} onChange={set("zip")} placeholder="ZIP" inputMode="numeric" className="bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500" />
        </div>
        <select value={form.timeframe} onChange={set("timeframe")} className="bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500">
          <option value="">How soon do you need to sell?</option>
          <option>As soon as possible</option>
          <option>Within 30 days</option>
          <option>1–3 months</option>
          <option>Just exploring options</option>
        </select>
        <input value={form.owed} onChange={set("owed")} placeholder="Roughly how much is owed? (optional)" className="bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500" />
      </div>
      <textarea value={form.situation} onChange={set("situation")} placeholder="Anything we should know? (behind on payments, auction date set, inherited the home, tenants, repairs needed…)" rows={3}
        className="mt-3 w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500" />
      {/* Honeypot — hidden from real users, catches bots. */}
      <input value={form.website} onChange={set("website")} tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" placeholder="Website" />
      {error && <p className="text-sm text-amber-300 mt-3">{error}</p>}
      <button onClick={submit} disabled={sending}
        className="mt-4 w-full sm:w-auto bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold px-8 py-3 rounded-xl transition-colors">
        {sending ? "Sending…" : "Request my cash offer →"}
      </button>
      <p className="text-[11px] text-gray-600 mt-3">By submitting you agree we may contact you about your property by phone, text, or email. No cost, no obligation, opt out anytime.</p>
    </div>
  )
}

export function SellFooter() {
  return (
    <footer className="border-t border-gray-900 pt-6 pb-10">
      <p className="text-[11px] text-gray-600 leading-relaxed">
        This page is general information, not legal, tax, or financial advice, and we are not a law firm, lender, or credit counselor. Free help is available: HUD-approved housing counselors at 1-800-569-4287 or hud.gov. If you receive an offer from us, you are free to compare it with listing the home, other buyers, or keeping the home — whatever puts you in the best position.
      </p>
    </footer>
  )
}
