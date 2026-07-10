// Programmatic city landing pages — /sell/riverside-ca, /sell/memphis-tn, …
// Each is a localized homeowner-help page (options, timeline, equity check,
// cash-offer form pre-filled with the city) targeting high-intent searches
// like "sell my house fast in {city}" and "stop foreclosure {city}". Static
// at build time (generateStaticParams) with per-page metadata + FAQ JSON-LD.

import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { SELL_CITIES, findSellCity } from "@/lib/sell-cities"
import { OptionsGrid, TimelineSection, EquityCheck, OfferForm, SellFooter } from "@/components/sell/SellSections"
import AIHelperWidget from "@/components/AIHelperWidget"

export function generateStaticParams() {
  return SELL_CITIES.map((c) => ({ city: c.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ city: string }> }): Promise<Metadata> {
  const { city: slug } = await params
  const c = findSellCity(slug)
  if (!c) return { title: "Sell your house fast" }
  return {
    title: `Sell Your House Fast in ${c.city}, ${c.state} — Cash Offer, As-Is | Stop Foreclosure Help`,
    description: `Behind on payments in ${c.city}? Understand your options, check your equity, and get a fair no-obligation cash offer for your ${c.city}, ${c.stateName} home. As-is, no fees, close on your timeline.`,
    alternates: { canonical: `/sell/${c.slug}` },
    openGraph: {
      title: `Sell your house fast in ${c.city}, ${c.state} — fair cash offer, as-is`,
      description: `Facing foreclosure or need to sell fast in ${c.city}? See your real options and get a no-obligation cash offer.`,
    },
  }
}

function faq(c: { city: string; state: string; stateName: string; county: string }) {
  return [
    {
      q: `How fast can I sell my house in ${c.city}?`,
      a: `A cash sale in ${c.city} can typically close in 7–14 days once terms are agreed, because there's no bank financing, appraisal contingency, or repairs. You pick the closing date — faster or slower to fit your situation.`,
    },
    {
      q: `Can I still sell if I've received a Notice of Default in ${c.county} County?`,
      a: `In most cases yes — a recorded notice of default starts a clock, but the home can usually be sold right up until shortly before the trustee sale. The earlier you act, the more options (and equity) you keep. Check the dates on your recorded notices, and consider a free HUD-approved housing counselor at 1-800-569-4287.`,
    },
    {
      q: `Do I pay any fees or commissions?`,
      a: `No agent commissions and no service fees with a direct cash sale — standard escrow and title costs are handled as customary in ${c.stateName}. The offer you accept is the basis of what you walk away with, minus what's owed on the home.`,
    },
    {
      q: `What condition does my ${c.city} house need to be in?`,
      a: `Any condition. As-is means exactly that — no repairs, no cleaning, no showings. Take what you want and leave the rest.`,
    },
    {
      q: `What if I owe more than my house is worth?`,
      a: `If the payoff is higher than the value, a short sale (with your lender's approval) or a loan workout is usually the path. It's still worth reaching out — we'll tell you honestly which route fits, and a HUD counselor can confirm for your exact case for free.`,
    },
  ]
}

export default async function CitySellPage({ params }: { params: Promise<{ city: string }> }) {
  const { city: slug } = await params
  const c = findSellCity(slug)
  if (!c) notFound()

  const faqs = faq(c)
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  }
  const nearby = SELL_CITIES.filter((x) => x.state === c.state && x.slug !== c.slug).slice(0, 8)

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <header className="border-b border-gray-900 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link href="/sell" className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg,#059669,#10b981)" }}>
              <span className="text-white font-bold text-xs">🏠</span>
            </div>
            <span className="font-bold">Homeowner Help</span>
          </Link>
          <a href="#offer" className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">Get a cash offer</a>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12 space-y-12">
        <section className="text-center">
          <h1 className="text-3xl sm:text-5xl font-extrabold leading-tight">
            Sell your house fast in {c.city}, {c.state}<br />
            <span className="text-emerald-400">Fair cash offer. As-is. Your timeline.</span>
          </h1>
          <p className="text-gray-400 mt-4 max-w-2xl mx-auto">
            Behind on payments, inherited a property, dealing with {c.county} County code letters, or just need out fast? You have more options than you think — here&apos;s the honest picture for {c.city} homeowners, in plain English.
          </p>
        </section>

        <OptionsGrid />
        <TimelineSection stateName={c.stateName} />
        <EquityCheck />
        <OfferForm prefillCity={c.city} prefillState={c.state} />

        <section>
          <h2 className="text-xl font-bold mb-4">Common questions from {c.city} homeowners</h2>
          <div className="space-y-2">
            {faqs.map((f) => (
              <details key={f.q} className="bg-gray-900/60 border border-gray-800 rounded-xl p-4 group">
                <summary className="font-semibold text-white text-sm cursor-pointer list-none">❓ {f.q}</summary>
                <p className="text-sm text-gray-400 mt-2 leading-relaxed">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {nearby.length > 0 && (
          <section>
            <h2 className="text-sm font-bold text-gray-400 mb-2">Also serving nearby</h2>
            <div className="flex flex-wrap gap-2">
              {nearby.map((n) => (
                <Link key={n.slug} href={`/sell/${n.slug}`} className="text-xs bg-gray-900 border border-gray-800 hover:border-emerald-600 text-gray-300 px-3 py-1.5 rounded-lg">
                  {n.city}, {n.state}
                </Link>
              ))}
            </div>
          </section>
        )}

        <SellFooter />
      </main>

      <AIHelperWidget
        endpoint="/api/homeowner/assistant"
        title="Foreclosure Options Helper"
        intro={`Free, judgment-free answers about your options as a ${c.city} homeowner — foreclosure timelines, loan workouts, selling as-is. Not legal advice; for free counseling call HUD at 1-800-569-4287.`}
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
