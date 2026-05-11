"use client"

import Link from "next/link"
import { useEffect } from "react"
import Timeline3D from "@/components/Timeline3D"

/* ── Data ── */
const QUICK_PRICES = [
  { label: "Free", price: "$0", desc: "5 posts + 3 reviews/mo", href: "/signup", highlight: false },
  { label: "Growth", price: "$99", desc: "Full marketing stack", href: "/signup?plan=GROWTH", highlight: true, badge: "Most Popular" },
  { label: "Agency", price: "$399", desc: "10 clients, white-label", href: "/signup?plan=AGENCY_STARTER", highlight: false },
]

const STATS = [
  { value: "4.2 hrs", label: "saved per business, per day" },
  { value: "3.8×", label: "more reviews in 90 days" },
  { value: "$8,400", label: "avg agency monthly revenue" },
  { value: "8", label: "AI agents working 24/7" },
]

const AGENTS_OVERVIEW = [
  { label: "Content Agent", stat: "47 posts/month", desc: "Never repeats. Always on-brand. Instagram, Facebook, LinkedIn, Google — all handled." },
  { label: "Reputation Agent", stat: "< 5 min response", desc: "Every review answered before your competitor notices. Flags legal risks automatically." },
  { label: "Lead Gen Agent", stat: "50 sequences/mo", desc: "Personalized cold email + follow-ups + LinkedIn. Each lead scored 0–100." },
  { label: "SEO Agent", stat: "4 posts/month", desc: "Local-keyword blog posts that rank and convert. Featured snippet optimized." },
  { label: "Sales Agent", stat: "Full toolkit", desc: "Phone scripts, objection handlers, proposals, voicemail scripts — generated in 60 seconds." },
  { label: "Support Agent", stat: "24/7 answers", desc: "Replies customer queries from your FAQ. Escalates complaints to you automatically." },
]

const AGENCY_WORKFLOW = [
  {
    step: "01",
    title: "Sign up and get your white-label dashboard",
    body: "You get a fully branded portal under your agency's name and domain. Clients log in and see YOUR brand — not AutoPilot's.",
    detail: "Takes 10 minutes. We give you a setup checklist, done-for-you proposal templates, and a client onboarding script.",
    color: "indigo",
  },
  {
    step: "02",
    title: "Onboard each client in 5 minutes",
    body: "Enter their business name, type, location, and describe their vibe. The Brand Voice Agent builds a custom AI profile trained to their tone.",
    detail: "Clients don't need to know anything about AI. They answer 8 questions about their business and the system handles the rest.",
    color: "violet",
  },
  {
    step: "03",
    title: "AI starts delivering work immediately",
    body: "The moment a client is onboarded, AutoPilot generates their first week of social content, scans for reviews, and drafts a lead outreach sequence.",
    detail: "Most clients see results in 72 hours. Real posts. Real review responses. Real leads contacted — before you even check in with them.",
    color: "cyan",
  },
  {
    step: "04",
    title: "You review, approve, and take the credit",
    body: "Everything goes through an approval queue. You (or your client) reviews AI output before it goes live. Nothing posts without a human sign-off.",
    detail: "This is your quality control moment — and it's where you add value as their agency. You tweak, approve, and deliver. Takes 10 minutes per client per week.",
    color: "emerald",
  },
  {
    step: "05",
    title: "Send monthly reports. Raise prices. Add clients.",
    body: "AutoPilot generates a plain-English monthly performance report for each client. Impressions up. Reviews up. Leads in. You send it, they renew.",
    detail: "Agencies using AutoPilot report a 94% client retention rate because results are visible and measurable every single month.",
    color: "amber",
  },
]

const AGENCY_AGENTS = [
  {
    id: "content", name: "Content Agent", color: "indigo",
    tagline: "Never write a social post again.",
    deliverable: "Social posts, newsletters, SMS campaigns",
    othersCharge: "$500–800/mo",
    yourCost: "~$8/client",
    output: '"Best kept secret in Austin — our new Tuesday hours mean you can finally get in after work. No more waiting. Just results. Book via link in bio."',
    outputLabel: "Sample Instagram post — on-brand, scroll-stopping",
    metric: "47 posts/month, zero client effort",
    howToSell: "Pitch as 'done-for-you social media management' — post daily, never repeat, always on brand.",
  },
  {
    id: "reputation", name: "Reputation Agent", color: "emerald",
    tagline: "Every review answered in minutes.",
    deliverable: "Review responses, sentiment analysis, alerts",
    othersCharge: "$300–600/mo",
    yourCost: "~$5/client",
    output: '"Hi Sarah — thank you so much for the kind words! We\'re thrilled the new color treatment came out exactly how you envisioned. Can\'t wait to see you at your next appointment!"',
    outputLabel: "5-star response — generated in 8 seconds, personalized",
    metric: "3.8× more reviews in 90 days",
    howToSell: "Pitch as 'reputation management' — every review answered, every negative review handled before it damages them.",
  },
  {
    id: "leads", name: "Lead Gen Agent", color: "violet",
    tagline: "Personalized outreach at scale.",
    deliverable: "Cold emails, follow-up sequences, lead scores",
    othersCharge: "$600–1,200/mo",
    yourCost: "~$10/client",
    output: '"Subject: Quick question about Maple Street Dental\n\nHi Dr. Chen — noticed you\'re near three other dental offices. We help practices add 15–20 new patients/month with zero ad spend. Worth a 10-min call?"',
    outputLabel: "Cold email — personalized per prospect, scored 84/100",
    metric: "Full 3-email sequence + LinkedIn message per lead",
    howToSell: "Pitch as 'lead generation and outreach automation' — 50 personalized sequences sent per month, completely hands-off.",
  },
  {
    id: "sales", name: "Sales Agent", color: "orange",
    tagline: "Close more deals with scripts that work.",
    deliverable: "Phone scripts, objection handlers, proposals",
    othersCharge: "$400–800/mo",
    yourCost: "~$6/client",
    output: `"When they say 'I need to think about it':\n'Totally understand — what's the main thing you're weighing? Most of our clients had the same concern and what they found was...'"`,
    outputLabel: "Objection handler — specific to service + price point",
    metric: "Full sales toolkit generated in 60 seconds",
    howToSell: "Pitch as 'sales enablement' — give their team scripts and proposals that actually close.",
  },
  {
    id: "seo", name: "SEO Agent", color: "cyan",
    tagline: "Rank on Google without writing a word.",
    deliverable: "Blog posts, keyword strategy, meta tags",
    othersCharge: "$500–1,000/mo",
    yourCost: "~$8/client",
    output: '"Best HVAC Repair in Phoenix, AZ — What to Know Before You Call\n\nIf your AC stopped working at 3pm on a Tuesday in July, you already know how fast Phoenix becomes unbearable..."',
    outputLabel: "SEO blog post — keyword-first, local signals built in",
    metric: "4 keyword-targeted posts/month",
    howToSell: "Pitch as 'local SEO and content marketing' — 4 posts a month targeting what their customers are actively searching.",
  },
  {
    id: "support", name: "Support Agent", color: "pink",
    tagline: "Answer every customer question, 24/7.",
    deliverable: "Customer replies, FAQ gen, escalation triage",
    othersCharge: "$300–600/mo",
    yourCost: "~$5/client",
    output: '"Hi Marcus — our hours are Mon–Sat 8am–6pm. For after-hours emergencies we have an on-call line at (512) 555-0100. Want me to book you in for tomorrow morning?"',
    outputLabel: "Support reply — answered from business FAQ, friendly tone",
    metric: "Escalates to human only when needed",
    howToSell: "Pitch as 'customer support automation' — every inquiry answered instantly, nothing falls through the cracks.",
  },
  {
    id: "financial", name: "Financial Agent", color: "amber",
    tagline: "Monthly reports. Plain English. Actionable.",
    deliverable: "P&L summaries, forecasts, recommendations",
    othersCharge: "$400–700/mo",
    yourCost: "~$6/client",
    output: '"April was your best month since October — revenue up 22%. Watch supply costs though: they jumped 14% and will eat the gain if unchecked. Recommendation: renegotiate the linen contract before June."',
    outputLabel: "Monthly report — plain English, 3 specific actions",
    metric: "Business health score + cash flow forecast",
    howToSell: "Pitch as 'business intelligence reporting' — send clients a monthly report showing growth, risks, and what to do about it.",
  },
  {
    id: "onboarding", name: "Brand Voice Agent", color: "teal",
    tagline: "Every client gets a custom AI profile.",
    deliverable: "Brand voice, content strategy, onboarding",
    othersCharge: "$500–1,000 setup",
    yourCost: "~$2/client",
    output: '"Tone: Warm and authoritative. Personality: Expert but approachable, community-focused, never salesy. Avoid: corporate jargon, fear-based messaging. Target: Phoenix homeowners 35–55."',
    outputLabel: "Brand voice profile — built in 2 min at onboarding",
    metric: "All other agents use this profile automatically",
    howToSell: "Charge a one-time onboarding fee of $500–1,000. Takes you 5 minutes. The AI does the work.",
  },
]

const COLOR_MAP: Record<string, { bg: string; border: string; text: string; tag: string; bar: string }> = {
  indigo:  { bg: "bg-indigo-950/20",  border: "border-indigo-800/40",  text: "text-indigo-400",  tag: "bg-indigo-950/60 border-indigo-800/50 text-indigo-400",  bar: "bg-indigo-500" },
  emerald: { bg: "bg-emerald-950/20", border: "border-emerald-800/40", text: "text-emerald-400", tag: "bg-emerald-950/60 border-emerald-800/50 text-emerald-400", bar: "bg-emerald-500" },
  violet:  { bg: "bg-violet-950/20",  border: "border-violet-800/40",  text: "text-violet-400",  tag: "bg-violet-950/60 border-violet-800/50 text-violet-400",  bar: "bg-violet-500" },
  orange:  { bg: "bg-orange-950/20",  border: "border-orange-800/40",  text: "text-orange-400",  tag: "bg-orange-950/60 border-orange-800/50 text-orange-400",  bar: "bg-orange-500" },
  cyan:    { bg: "bg-cyan-950/20",    border: "border-cyan-800/40",    text: "text-cyan-400",    tag: "bg-cyan-950/60 border-cyan-800/50 text-cyan-400",    bar: "bg-cyan-500" },
  pink:    { bg: "bg-pink-950/20",    border: "border-pink-800/40",    text: "text-pink-400",    tag: "bg-pink-950/60 border-pink-800/50 text-pink-400",    bar: "bg-pink-500" },
  amber:   { bg: "bg-amber-950/20",   border: "border-amber-800/40",   text: "text-amber-400",   tag: "bg-amber-950/60 border-amber-800/50 text-amber-400",   bar: "bg-amber-500" },
  teal:    { bg: "bg-teal-950/20",    border: "border-teal-800/40",    text: "text-teal-400",    tag: "bg-teal-950/60 border-teal-800/50 text-teal-400",    bar: "bg-teal-500" },
}

const SAAS_PLANS = [
  { label: "Free", price: "$0", period: "/mo", desc: "Get started, no card needed", features: ["5 social posts/month", "3 review responses/month", "1 business location"], cta: "Start free", href: "/signup", highlight: false },
  { label: "Starter", price: "$49", period: "/mo", desc: "Solo operators", features: ["30 posts/month", "Unlimited review responses", "Lead Gen Agent", "1 location"], cta: "Get started", href: "/signup?plan=STARTER", highlight: false },
  { label: "Growth", price: "$99", period: "/mo", desc: "The full marketing stack", features: ["Unlimited posts", "All 6 core agents", "Retention campaigns", "SEO blog posts", "3 locations"], cta: "Start Growth", href: "/signup?plan=GROWTH", highlight: true, badge: "Most Popular" },
  { label: "Pro", price: "$199", period: "/mo", desc: "Every agent, no limits", features: ["All 8 agents", "Financial reporting", "API access", "Unlimited locations"], cta: "Start Pro", href: "/signup?plan=PRO", highlight: false },
]

const AGENCY_PLANS = [
  { label: "Agency Starter", price: "$399", period: "/mo", clients: "Up to 10 clients", margin: "10 × $500 = $5,000 revenue − $399 = $4,601 profit", features: ["White-label dashboard", "Custom domain", "Client management portal", "Proposal templates"], cta: "Start reselling", href: "/signup?plan=AGENCY_STARTER", highlight: false },
  { label: "Agency Growth", price: "$799", period: "/mo", clients: "Up to 25 clients", margin: "25 × $750 = $18,750 revenue − $799 = $17,951 profit", features: ["Everything in Starter", "Priority onboarding", "Co-branded proposals", "Slack support"], cta: "Scale your agency", href: "/signup?plan=AGENCY_GROWTH", highlight: true, badge: "Best Margin" },
  { label: "Agency Premium", price: "$1,599", period: "/mo", clients: "Unlimited clients", margin: "50 × $1,000 = $50,000 revenue − $1,599 = $48,401 profit", features: ["Everything in Growth", "Dedicated account manager", "Custom AI training", "SLA guarantee"], cta: "Go unlimited", href: "/signup?plan=AGENCY_PREMIUM", highlight: false },
]

const TESTIMONIALS = [
  { quote: "AutoPilot generates a full week of social posts every Sunday and responds to our Google reviews before I even see them. It's like having a marketing team for $99/month.", name: "Sarah K.", role: "Owner, Bloom Hair Studio", metric: "Saved $2,400/mo vs. their old agency" },
  { quote: "We used to miss half our leads because nobody had time to follow up. AutoPilot books the calls automatically. Revenue is up 31% since we started.", name: "Marcus T.", role: "Owner, T&T Contractors", metric: "31% revenue increase in 90 days" },
  { quote: "We white-labeled this and pitched 8 clients at $750/month each. That's $6,000/month in new recurring revenue on a $399 plan. This thing prints money.", name: "Dana L.", role: "Founder, Apex Digital Agency", metric: "$6,000/mo recurring on a $399 plan" },
]

/* ── Component ── */
export default function LandingPage() {
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add("revealed") }),
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    )
    document.querySelectorAll(".reveal, .reveal-left, .reveal-right, .reveal-scale")
      .forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  return (
    <div className="min-h-screen text-white mesh-bg">

      {/* ── Nav ── */}
      <nav className="sticky top-0 z-50 border-b border-white/5 bg-gray-950/80 backdrop-blur-xl px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-900/60">
              <span className="text-white font-bold text-sm">AP</span>
            </div>
            <span className="font-bold text-lg tracking-tight">AutoPilot</span>
          </div>
          <div className="hidden md:flex items-center gap-7">
            {[["#for-business","For Businesses"],["#how-it-works","How It Works"],["#journey","Results"],["#ai-team","AI Team"],["#pricing","Pricing"]].map(([href,label]) => (
              <a key={href} href={href} className="text-sm text-gray-400 hover:text-white transition-colors">{label}</a>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm text-gray-400 hover:text-white transition-colors">Sign in</Link>
            <Link href="/signup" className="shimmer-btn px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition-colors shadow-lg shadow-indigo-900/40">
              Start free
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative px-6 pt-28 pb-20 text-center overflow-hidden">
        {/* Animated orbs */}
        <div className="absolute top-10 left-[10%] w-[500px] h-[500px] bg-indigo-600/8 rounded-full blur-3xl animate-orb-drift pointer-events-none" />
        <div className="absolute bottom-0 right-[5%] w-[400px] h-[400px] bg-violet-600/6 rounded-full blur-3xl animate-orb-drift pointer-events-none" style={{ animationDelay: "-7s" }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[300px] bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-5xl mx-auto relative">
          <div className="inline-flex items-center gap-2 bg-indigo-950/70 border border-indigo-800/60 text-indigo-400 text-xs font-semibold px-4 py-1.5 rounded-full mb-8 tracking-wide uppercase animate-fade-up">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping-slow absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-400" />
            </span>
            AI Business Operating System — 8 agents, zero staff
          </div>

          <h1 className="text-6xl md:text-7xl font-extrabold leading-none tracking-tight mb-6 animate-fade-up delay-100">
            Stop paying $3,000/mo<br />
            for a marketing agency.<br />
            <span className="gradient-text">Pay $99. Get better results.</span>
          </h1>

          <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed animate-fade-up delay-200">
            AutoPilot runs 8 AI agents that handle content, reputation, lead gen, SEO, sales, support, and finances — automatically, every single day.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-fade-up delay-300">
            <Link href="/signup" className="shimmer-btn px-9 py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-colors text-lg shadow-xl shadow-indigo-900/40">
              Start free — no card required
            </Link>
            <a href="#how-it-works" className="px-9 py-4 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 font-semibold rounded-xl transition-colors text-lg">
              Build an agency →
            </a>
          </div>
          <p className="mt-5 text-sm text-gray-700 animate-fade-up delay-400">Setup takes 5 minutes. Results in your first week.</p>
        </div>
      </section>

      {/* ── Quick pricing (top) ── */}
      <section className="px-6 pb-16">
        <div className="max-w-3xl mx-auto">
          <p className="text-center text-sm text-gray-600 mb-5 uppercase tracking-widest font-semibold">Simple pricing. Start free.</p>
          <div className="grid grid-cols-3 gap-3">
            {QUICK_PRICES.map((p, i) => (
              <Link
                key={p.label}
                href={p.href}
                className={`reveal reveal-scale glow-card relative rounded-2xl border p-5 text-center transition-colors ${
                  p.highlight ? "bg-indigo-950/40 border-indigo-500 gradient-border" : "bg-gray-900/60 border-gray-800 hover:border-gray-700"
                }`}
                style={{ animationDelay: `${i * 0.1}s` }}
              >
                {p.badge && (
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-xs bg-indigo-600 text-white px-3 py-0.5 rounded-full font-bold whitespace-nowrap">
                    {p.badge}
                  </span>
                )}
                <p className="text-2xl font-extrabold text-white">{p.price}<span className="text-sm font-normal text-gray-500">/mo</span></p>
                <p className="font-semibold text-sm text-gray-300 mt-0.5">{p.label}</p>
                <p className="text-xs text-gray-600 mt-1">{p.desc}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Stats bar ── */}
      <section className="px-6 py-10 border-y border-white/5 bg-white/2">
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {STATS.map((s, i) => (
            <div key={s.label} className="reveal" style={{ transitionDelay: `${i * 0.1}s` }}>
              <p className="text-4xl font-extrabold text-white stat-number">{s.value}</p>
              <p className="text-sm text-gray-500 mt-1.5">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── For business owners ── */}
      <section id="for-business" className="px-6 py-24">
        <div className="max-w-6xl mx-auto">
          <div className="mb-14 reveal">
            <div className="inline-flex items-center gap-2 bg-emerald-950/60 border border-emerald-800/60 text-emerald-400 text-xs font-semibold px-3.5 py-1.5 rounded-full mb-5 tracking-wide uppercase">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" /> For Small Business Owners
            </div>
            <h2 className="text-4xl font-extrabold tracking-tight mb-4">
              You didn&apos;t start a business<br />to spend 3 hours a day on marketing.
            </h2>
            <p className="text-lg text-gray-400 max-w-2xl">
              Hiring a marketing agency costs $2,000–5,000/month and they&apos;ll send you a PDF report once a week. AutoPilot does the actual work — every day — for $99.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 mb-14">
            <div className="reveal-left glow-card bg-red-950/15 border border-red-900/30 rounded-2xl p-8">
              <p className="text-xs font-bold text-red-400 uppercase tracking-widest mb-5">Without AutoPilot</p>
              <ul className="space-y-4">
                {[
                  "You forget to post for two weeks. Customers wonder if you're still open.",
                  "A 2-star review sits unanswered for 3 days. Prospects see it and leave.",
                  "Leads contact you and never hear back. They hire your competitor.",
                  "You pay $300/mo to an agency for 4 posts that look like stock photos.",
                  "A loyal customer stops coming. You never knew why. You never followed up.",
                ].map(item => (
                  <li key={item} className="flex gap-3 text-gray-400 text-sm leading-relaxed">
                    <span className="text-red-500 mt-0.5 shrink-0">✕</span>{item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="reveal-right glow-card glow-card-emerald bg-emerald-950/15 border border-emerald-900/30 rounded-2xl p-8">
              <p className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-5">With AutoPilot at $99/mo</p>
              <ul className="space-y-4">
                {[
                  "47 social posts this month. On-brand, on schedule. Zero effort from you.",
                  "Every review responded to in under 5 minutes — while you slept.",
                  "8 new leads contacted, followed up, and booked automatically.",
                  "4 SEO blog posts published, ranking for local keywords that bring traffic.",
                  "3 win-back campaigns fired to customers at day 30, 45, and 60.",
                ].map(item => (
                  <li key={item} className="flex gap-3 text-gray-300 text-sm leading-relaxed">
                    <span className="text-emerald-400 mt-0.5 shrink-0">✓</span>{item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Agents grid */}
          <div className="reveal mb-6">
            <h3 className="text-2xl font-bold tracking-tight mb-2">8 agents. Running every day.</h3>
            <p className="text-gray-400">Each agent is purpose-built for a specific job and trained to your brand voice.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            {AGENTS_OVERVIEW.map((a, i) => (
              <div key={a.label} className="reveal glow-card bg-gray-900/60 border border-gray-800 hover:border-indigo-800/50 rounded-2xl p-6 transition-colors" style={{ transitionDelay: `${i * 0.08}s` }}>
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-bold text-white">{a.label}</h3>
                  <span className="text-xs font-bold text-indigo-400 bg-indigo-950/60 border border-indigo-800/50 px-2.5 py-1 rounded-full whitespace-nowrap ml-2 shrink-0">{a.stat}</span>
                </div>
                <p className="text-sm text-gray-400 leading-relaxed">{a.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How agencies use it ── */}
      <section id="how-it-works" className="px-6 py-24 border-y border-white/5 bg-white/2">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16 reveal">
            <div className="inline-flex items-center gap-2 bg-violet-950/60 border border-violet-800/60 text-violet-400 text-xs font-semibold px-3.5 py-1.5 rounded-full mb-5 tracking-wide uppercase">
              <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-pulse" /> For Agencies
            </div>
            <h2 className="text-4xl font-extrabold tracking-tight mb-4">How agencies use AutoPilot</h2>
            <p className="text-lg text-gray-400 max-w-2xl mx-auto">
              From signup to your first $5,000/month in recurring revenue — here&apos;s exactly how it works.
            </p>
          </div>

          <div className="space-y-6">
            {AGENCY_WORKFLOW.map((step, i) => {
              const c = COLOR_MAP[step.color]
              return (
                <div key={step.step} className={`reveal glow-card grid md:grid-cols-[auto_1fr_1fr] gap-6 md:gap-8 items-start ${c.bg} border ${c.border} rounded-2xl p-7 md:p-8`} style={{ transitionDelay: `${i * 0.1}s` }}>
                  {/* Step number */}
                  <div className={`w-14 h-14 rounded-2xl border ${c.border} ${c.bg} flex items-center justify-center shrink-0`}>
                    <span className={`text-xl font-extrabold ${c.text}`}>{step.step}</span>
                  </div>
                  {/* Main content */}
                  <div>
                    <h3 className="font-bold text-white text-xl mb-2">{step.title}</h3>
                    <p className="text-gray-300 text-sm leading-relaxed">{step.body}</p>
                  </div>
                  {/* Detail box */}
                  <div className="bg-gray-950/50 border border-white/5 rounded-xl p-4">
                    <p className="text-xs text-gray-600 uppercase tracking-widest mb-2">In practice</p>
                    <p className="text-sm text-gray-400 leading-relaxed">{step.detail}</p>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-10 text-center reveal">
            <Link href="/signup?plan=AGENCY_STARTER" className="shimmer-btn inline-block px-9 py-4 bg-violet-600 hover:bg-violet-500 text-white font-bold rounded-xl transition-colors text-lg shadow-xl shadow-violet-900/40">
              Start your agency today
            </Link>
            <p className="mt-3 text-sm text-gray-600">Most partners close their first client within 7 days of signing up.</p>
          </div>
        </div>
      </section>

      {/* ── 3D Journey Timeline ── */}
      <Timeline3D />

      {/* ── Meet Your AI Team ── */}
      <section id="ai-team" className="px-6 py-24">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-6 reveal">
            <div className="inline-flex items-center gap-2 bg-indigo-950/60 border border-indigo-800/60 text-indigo-400 text-xs font-semibold px-3.5 py-1.5 rounded-full mb-5 tracking-wide uppercase">
              <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full" /> 8 Services. One Subscription.
            </div>
            <h2 className="text-4xl font-extrabold tracking-tight mb-4">Meet your AI team.</h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">Each agent is a fully deployable service. See what it produces, what others charge for it, and how to sell it.</p>
          </div>

          <div className="reveal bg-gradient-to-r from-violet-950/40 to-indigo-950/40 border border-violet-800/30 rounded-2xl p-6 mb-12 flex flex-col md:flex-row items-center justify-between gap-4">
            <div>
              <p className="text-sm text-violet-400 font-semibold uppercase tracking-widest mb-1">If you sold all 8 services to one client</p>
              <p className="text-3xl font-extrabold text-white">$3,000–6,100/month per client</p>
              <p className="text-gray-500 text-sm mt-1">vs. your AutoPilot cost of $40/client on the Agency Starter plan</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-5xl font-extrabold gradient-text-green">97%</p>
              <p className="text-sm text-gray-500 mt-1">gross margin per client</p>
            </div>
          </div>

          <div className="space-y-5">
            {AGENCY_AGENTS.map((agent, i) => {
              const c = COLOR_MAP[agent.color]
              return (
                <div key={agent.id} className={`reveal glow-card ${c.bg} border ${c.border} rounded-2xl p-6 md:p-8`} style={{ transitionDelay: `${i * 0.06}s` }}>
                  <div className="grid md:grid-cols-3 gap-7 items-start">
                    {/* Agent info */}
                    <div>
                      <div className="flex items-center gap-3 mb-4">
                        <div className={`w-10 h-10 rounded-xl ${c.bg} border ${c.border} flex items-center justify-center shrink-0`}>
                          <span className={`text-base font-extrabold ${c.text}`}>{agent.name[0]}</span>
                        </div>
                        <div>
                          <h3 className="font-bold text-white text-lg leading-tight">{agent.name}</h3>
                          <p className={`text-xs font-medium ${c.text}`}>{agent.tagline}</p>
                        </div>
                      </div>
                      <div className="space-y-2.5">
                        <div className="flex gap-2.5">
                          <span className="text-gray-600 text-xs uppercase tracking-wider w-24 shrink-0 mt-0.5">Delivers</span>
                          <span className="text-gray-400 text-sm">{agent.deliverable}</span>
                        </div>
                        <div className="flex gap-2.5 items-center">
                          <span className="text-gray-600 text-xs uppercase tracking-wider w-24 shrink-0">Others charge</span>
                          <span className={`text-sm font-bold ${c.text}`}>{agent.othersCharge}</span>
                        </div>
                        <div className="flex gap-2.5 items-center">
                          <span className="text-gray-600 text-xs uppercase tracking-wider w-24 shrink-0">Your cost</span>
                          <span className="text-gray-300 text-sm font-semibold">{agent.yourCost}</span>
                        </div>
                      </div>
                      <div className={`mt-4 p-3 rounded-xl ${c.bg} border ${c.border}`}>
                        <p className="text-xs text-gray-500 mb-1 uppercase tracking-wider">How to sell it</p>
                        <p className="text-xs text-gray-300 leading-relaxed">{agent.howToSell}</p>
                      </div>
                    </div>

                    {/* Sample output */}
                    <div>
                      <p className="text-xs text-gray-600 uppercase tracking-widest mb-2">{agent.outputLabel}</p>
                      <div className="bg-gray-950/70 border border-white/5 rounded-xl p-4 h-full">
                        <p className="text-gray-300 text-sm leading-relaxed italic whitespace-pre-line">{agent.output}</p>
                      </div>
                    </div>

                    {/* Metric + tag */}
                    <div className="flex flex-col justify-between h-full gap-4">
                      <div className={`p-4 rounded-xl border ${c.border} ${c.bg}`}>
                        <p className="text-xs text-gray-600 uppercase tracking-wider mb-1">Delivered monthly</p>
                        <p className={`font-bold text-sm ${c.text}`}>{agent.metric}</p>
                      </div>
                      <div className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border self-start ${c.tag}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${c.bar}`} />
                        Live on all agency plans
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-12 text-center reveal">
            <p className="text-gray-400 mb-6">Every agent is included. You don&apos;t build them. You sell them.</p>
            <Link href="/signup?plan=AGENCY_STARTER" className="shimmer-btn inline-block px-9 py-4 bg-violet-600 hover:bg-violet-500 text-white font-bold rounded-xl text-lg transition-colors shadow-xl shadow-violet-900/40">
              Start selling these services today
            </Link>
          </div>
        </div>
      </section>

      {/* ── Social Proof ── */}
      <section className="px-6 py-20 border-y border-white/5 bg-white/2">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-extrabold text-center mb-2 tracking-tight reveal">Real businesses. Real numbers.</h2>
          <p className="text-gray-500 text-center text-sm mb-12 reveal">Typical results from the first 90 days.</p>
          <div className="grid md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t, i) => (
              <div key={t.name} className="reveal glow-card bg-gray-900/70 border border-gray-800 hover:border-indigo-800/40 rounded-2xl p-6 flex flex-col" style={{ transitionDelay: `${i * 0.12}s` }}>
                <div className="inline-block bg-indigo-950/60 border border-indigo-800/40 text-indigo-400 text-xs font-bold px-3 py-1.5 rounded-full mb-5 self-start">{t.metric}</div>
                <p className="text-gray-300 text-sm leading-relaxed mb-5 flex-1">&ldquo;{t.quote}&rdquo;</p>
                <div className="pt-4 border-t border-gray-800">
                  <p className="font-semibold text-sm text-white">{t.name}</p>
                  <p className="text-gray-500 text-xs mt-0.5">{t.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Full Pricing ── */}
      <section id="pricing" className="px-6 py-24">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14 reveal">
            <h2 className="text-4xl font-extrabold tracking-tight mb-3">Two tracks. One platform.</h2>
            <p className="text-gray-400 text-lg">Growing your business, or building an agency on top of ours?</p>
          </div>

          {/* SaaS plans */}
          <div className="mb-5 reveal">
            <div className="flex items-center gap-3 mb-6">
              <div className="inline-flex items-center gap-2 bg-emerald-950/60 border border-emerald-800/60 text-emerald-400 text-xs font-semibold px-3 py-1 rounded-full tracking-wide uppercase">For Business Owners</div>
              <div className="h-px bg-gray-800 flex-1" />
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {SAAS_PLANS.map((plan, i) => (
                <div key={plan.label} className={`reveal glow-card rounded-2xl border p-6 flex flex-col relative ${plan.highlight ? "border-indigo-500 bg-indigo-950/30 gradient-border" : "border-gray-800 bg-gray-900/60"}`} style={{ transitionDelay: `${i * 0.08}s` }}>
                  {plan.badge && <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs bg-indigo-600 text-white px-3 py-1 rounded-full font-bold whitespace-nowrap">{plan.badge}</span>}
                  <p className="font-bold text-gray-300 text-sm mb-1">{plan.label}</p>
                  <p className="text-4xl font-extrabold text-white mb-1">{plan.price}<span className="text-base font-normal text-gray-500">{plan.period}</span></p>
                  <p className="text-xs text-gray-500 mb-5">{plan.desc}</p>
                  <ul className="space-y-2 flex-1 mb-6">
                    {plan.features.map(f => <li key={f} className="flex gap-2 text-xs text-gray-400"><span className="text-emerald-500 shrink-0">✓</span>{f}</li>)}
                  </ul>
                  <Link href={plan.href} className={`text-center py-2.5 rounded-lg font-semibold text-sm transition-colors ${plan.highlight ? "bg-indigo-600 hover:bg-indigo-500 text-white" : "bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700"}`}>{plan.cta}</Link>
                </div>
              ))}
            </div>
          </div>

          {/* Agency plans */}
          <div className="mt-14 reveal">
            <div className="flex items-center gap-3 mb-6">
              <div className="inline-flex items-center gap-2 bg-violet-950/60 border border-violet-800/60 text-violet-400 text-xs font-semibold px-3 py-1 rounded-full tracking-wide uppercase">For Agencies &amp; Resellers</div>
              <div className="h-px bg-gray-800 flex-1" />
            </div>
            <div className="grid lg:grid-cols-3 gap-5">
              {AGENCY_PLANS.map((plan, i) => (
                <div key={plan.label} className={`reveal glow-card glow-card-violet rounded-2xl border p-7 flex flex-col relative ${plan.highlight ? "border-violet-500 bg-violet-950/20 gradient-border" : "border-gray-800 bg-gray-900/60"}`} style={{ transitionDelay: `${i * 0.1}s` }}>
                  {plan.badge && <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs bg-violet-600 text-white px-3 py-1 rounded-full font-bold whitespace-nowrap">{plan.badge}</span>}
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <p className="font-bold text-white text-lg">{plan.label}</p>
                      <p className="text-sm text-gray-500 mt-0.5">{plan.clients}</p>
                    </div>
                    <p className="text-3xl font-extrabold text-white">{plan.price}<span className="text-sm font-normal text-gray-500">{plan.period}</span></p>
                  </div>
                  <div className="bg-emerald-950/30 border border-emerald-900/40 rounded-xl px-4 py-3 mb-5">
                    <p className="text-xs text-emerald-400 leading-relaxed font-medium">{plan.margin}</p>
                  </div>
                  <ul className="space-y-2.5 flex-1 mb-6">
                    {plan.features.map(f => <li key={f} className="flex gap-2 text-sm text-gray-400"><span className="text-violet-400 shrink-0 mt-0.5">✓</span>{f}</li>)}
                  </ul>
                  <Link href={plan.href} className={`text-center py-3 rounded-xl font-bold text-sm transition-colors ${plan.highlight ? "bg-violet-600 hover:bg-violet-500 text-white" : "bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700"}`}>{plan.cta}</Link>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="px-6 py-28 text-center relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-t from-indigo-950/20 via-transparent to-transparent pointer-events-none" />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[900px] h-[400px] bg-indigo-600/6 rounded-full blur-3xl pointer-events-none" />
        <div className="max-w-3xl mx-auto relative reveal">
          <h2 className="text-5xl font-extrabold tracking-tight mb-5">
            Every day you wait, your competitor<br />
            <span className="gradient-text">is using this instead of you.</span>
          </h2>
          <p className="text-gray-400 text-xl mb-10 leading-relaxed">
            AutoPilot starts working the moment you sign up. First posts go out this week. First leads contacted within 48 hours. First review responded to within minutes.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/signup" className="shimmer-btn px-10 py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-lg rounded-xl transition-colors shadow-xl shadow-indigo-900/40">
              Get started free
            </Link>
            <Link href="/signup?plan=AGENCY_STARTER" className="px-10 py-4 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 font-semibold text-lg rounded-xl transition-colors">
              Start an agency
            </Link>
          </div>
          <p className="mt-6 text-xs text-gray-700">Joining 2,400+ businesses and 180+ agencies already running on AutoPilot</p>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/5 px-6 py-10">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 bg-indigo-600 rounded flex items-center justify-center">
              <span className="text-white font-bold text-xs">AP</span>
            </div>
            <span className="font-bold text-sm tracking-tight">AutoPilot</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-gray-600">
            <Link href="/login" className="hover:text-gray-400 transition-colors">Sign in</Link>
            <Link href="/signup" className="hover:text-gray-400 transition-colors">Sign up</Link>
            <a href="#pricing" className="hover:text-gray-400 transition-colors">Pricing</a>
            <a href="mailto:support@autopilot.ai" className="hover:text-gray-400 transition-colors">Support</a>
          </div>
          <p className="text-xs text-gray-700">© 2026 AutoPilot. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}
