// Public homeowner portal — the inbound seller channel. A distressed homeowner
// lands here (no login), understands their options and timeline, checks their
// equity, asks the AI helper anything, and can request a no-obligation cash
// offer. Submissions flow to Admin → 📥 Inbound Sellers with an instant
// operator alert. Informational only — not legal or financial advice.

import type { Metadata } from "next"
import Link from "next/link"
import { SELL_CITIES } from "@/lib/sell-cities"
import { OptionsGrid, TimelineSection, EquityCheck, OfferForm, SellFooter } from "@/components/sell/SellSections"
import AIHelperWidget from "@/components/AIHelperWidget"

export const metadata: Metadata = {
  title: "Behind on Payments? Know Your Options — Fair Cash Offer, As-Is",
  description: "Facing foreclosure or need to sell fast? Understand your real options, check your equity, and get a fair no-obligation cash offer. As-is, no fees, close on your timeline.",
  alternates: { canonical: "/sell" },
}

export default function SellPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-900 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg,#059669,#10b981)" }}>
              <span className="text-white font-bold text-xs">🏠</span>
            </div>
            <span className="font-bold">Homeowner Help</span>
          </div>
          <a href="#offer" className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">Get a cash offer</a>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12 space-y-12">
        <section className="text-center">
          <h1 className="text-3xl sm:text-5xl font-extrabold leading-tight">Behind on payments?<br /><span className="text-emerald-400">You have more options than you think.</span></h1>
          <p className="text-gray-400 mt-4 max-w-2xl mx-auto">Foreclosure moves on a clock, but at almost every stage you still have real choices — and if you have equity, it&apos;s worth protecting. Here&apos;s the honest picture, in plain English.</p>
        </section>

        <OptionsGrid />
        <TimelineSection />
        <EquityCheck />
        <OfferForm />

        <section>
          <h2 className="text-sm font-bold text-gray-400 mb-2">Areas we serve</h2>
          <div className="flex flex-wrap gap-2">
            {SELL_CITIES.map((c) => (
              <Link key={c.slug} href={`/sell/${c.slug}`} className="text-xs bg-gray-900 border border-gray-800 hover:border-emerald-600 text-gray-400 hover:text-gray-200 px-3 py-1.5 rounded-lg">
                {c.city}, {c.state}
              </Link>
            ))}
          </div>
        </section>

        <SellFooter />
      </main>

      <AIHelperWidget
        endpoint="/api/homeowner/assistant"
        title="Foreclosure Options Helper"
        intro="Free, judgment-free answers about your options — foreclosure timelines, loan workouts, selling as-is. Not legal advice; for free counseling call HUD at 1-800-569-4287."
        placeholder="e.g. I got a notice of default — what now?"
        suggestions={[
          "I got a notice of default — what are my options?",
          "How fast could I sell my house?",
          "What if I owe more than it's worth?",
        ]}
      />
    </div>
  )
}
