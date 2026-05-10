import Link from "next/link"

const AGENTS = [
  {
    label: "Content Agent",
    stat: "7 posts/week",
    description: "Never repeats. Always on-brand. Publishes to Instagram, Facebook, and Google Business without you touching a keyboard.",
  },
  {
    label: "Reputation Agent",
    stat: "< 5 min response",
    description: "Monitors Google, Yelp, and Facebook. Responds to every review — positive or negative — before your competitor even notices.",
  },
  {
    label: "Lead Gen Agent",
    stat: "50 prospects/mo",
    description: "Finds qualified local prospects, sends personalized outreach, follows up automatically, and books calls into your calendar.",
  },
  {
    label: "Retention Agent",
    stat: "Day 30 / 45 / 60",
    description: "Identifies customers who went quiet and triggers a win-back sequence at exactly the right moment with the right offer.",
  },
  {
    label: "SEO Agent",
    stat: "4 posts/month",
    description: "Publishes SEO-optimized blog content targeting the local keywords your customers are actively searching for.",
  },
  {
    label: "Financial Agent",
    stat: "Monthly P&L in plain English",
    description: "Pulls your Stripe or QuickBooks data and delivers a plain-English summary with 3 specific actions to improve your margins.",
  },
]

const AGENCY_AGENTS = [
  {
    id: "content",
    name: "Content Agent",
    tagline: "Never write a social post again.",
    color: "indigo",
    deliverable: "Social posts, email newsletters, SMS campaigns",
    output: '"Best kept secret in Austin — our new Tuesday hours mean you can finally get in after work. No more waiting. Just results. Book via link in bio."',
    outputLabel: "Sample Instagram post — auto-generated, on-brand",
    sellAs: "Social Media Management",
    clientRate: "$500–800/mo",
    platforms: ["Instagram", "Facebook", "LinkedIn", "Google", "Twitter"],
    metric: "47 posts/month, zero client effort",
  },
  {
    id: "reputation",
    name: "Reputation Agent",
    tagline: "Every review answered in minutes, not days.",
    color: "emerald",
    deliverable: "Review responses, sentiment analysis, trend reports",
    output: '"Hi Sarah — thank you so much for the kind words! We\'re thrilled the new color treatment came out exactly how you envisioned. Can\'t wait to see you at your next appointment!"',
    outputLabel: "5-star review response — generated in 8 seconds",
    sellAs: "Reputation Management",
    clientRate: "$300–600/mo",
    platforms: ["Google", "Yelp", "Facebook", "TripAdvisor"],
    metric: "3.8x more reviews in 90 days",
  },
  {
    id: "leads",
    name: "Lead Gen Agent",
    tagline: "Personalized outreach at scale. Without the SDR.",
    color: "violet",
    deliverable: "Cold emails, follow-up sequences, LinkedIn messages, lead scores",
    output: '"Subject: Quick question about Maple Street Dental\n\nHi Dr. Chen — noticed you\'re in the same building as three other dental offices. Curious whether patient acquisition is a challenge or if referrals keep you full. We help practices in your area add 15–20 new patients/month. Worth a 10-min call?"',
    outputLabel: "Cold email — personalized per lead, scored 84/100",
    sellAs: "Lead Generation",
    clientRate: "$600–1,200/mo",
    platforms: ["Email", "LinkedIn", "SMS"],
    metric: "50 personalized outreach sequences/month",
  },
  {
    id: "sales",
    name: "Sales Agent",
    tagline: "Close more deals with scripts that actually work.",
    color: "orange",
    deliverable: "Phone scripts, email openers, objection handlers, proposals",
    output: '"When they say \'I need to think about it\': \'Totally understand — what\'s the main thing you\'re weighing? [pause] A lot of our clients had that same hesitation and what they found was... [insert relevant case].\'"',
    outputLabel: "Objection handler — generated for your specific service",
    sellAs: "Sales Enablement",
    clientRate: "$400–800/mo",
    platforms: ["Phone", "Email", "In-Person"],
    metric: "Full sales toolkit in 60 seconds",
  },
  {
    id: "seo",
    name: "SEO Agent",
    tagline: "Rank on Google without writing a word.",
    color: "cyan",
    deliverable: "Blog posts, meta descriptions, keyword strategies, content calendars",
    output: '"Best HVAC Repair in Phoenix, AZ — What to Know Before You Call\n\nIf your AC stopped working at 3pm on a Tuesday in July, you already know how fast Phoenix becomes unbearable..."',
    outputLabel: "Blog post opening — keyword-first, local signals built in",
    sellAs: "SEO & Content Marketing",
    clientRate: "$500–1,000/mo",
    platforms: ["Google", "Bing", "Website"],
    metric: "4 SEO blog posts/month, ranked locally",
  },
  {
    id: "support",
    name: "Support Agent",
    tagline: "Answer every customer question, day or night.",
    color: "pink",
    deliverable: "Customer responses, FAQ generation, escalation triage",
    output: '"Hi Marcus — our hours are Mon–Sat 8am–6pm. For after-hours emergencies we do have an on-call line at (512) 555-0100. Would you like me to book you a slot for tomorrow morning?"',
    outputLabel: "Customer support reply — answered from business FAQ",
    sellAs: "Customer Support Automation",
    clientRate: "$300–600/mo",
    platforms: ["Website Chat", "Email", "SMS"],
    metric: "Escalates to human only when needed",
  },
  {
    id: "financial",
    name: "Financial Agent",
    tagline: "Plain-English financials. No accountant needed.",
    color: "amber",
    deliverable: "Monthly P&L summaries, cash flow forecasts, actionable recommendations",
    output: '"April was your best month since October — revenue up 22% driven by the Tuesday promotion. Watch your supply costs though: they jumped 14% and will eat the gain if unchecked. Recommendation: renegotiate the linen contract before June."',
    outputLabel: "Monthly financial summary — plain English, 3 actions",
    sellAs: "Financial Reporting & Insights",
    clientRate: "$400–700/mo",
    platforms: ["Stripe", "QuickBooks", "Manual Input"],
    metric: "Monthly report in plain English, not spreadsheets",
  },
  {
    id: "onboarding",
    name: "Brand Voice Agent",
    tagline: "Every client onboarded with a custom AI profile.",
    color: "teal",
    deliverable: "Brand voice profile, content strategy, platform recommendations",
    output: '"Tone: Warm and authoritative. Personality: Expert but approachable, community-focused, never salesy. Audience: Phoenix homeowners 35–55, DIY-curious but time-poor. Avoid: corporate jargon, fear-based messaging."',
    outputLabel: "Brand voice profile — built in 2 minutes at onboarding",
    sellAs: "Brand Strategy & Onboarding",
    clientRate: "One-time $500–1,000 setup fee",
    platforms: ["All channels"],
    metric: "Every client gets a custom AI trained to their voice",
  },
]

const COLOR_MAP: Record<string, { bg: string; border: string; text: string; badge: string }> = {
  indigo: { bg: "bg-indigo-950/20", border: "border-indigo-800/40", text: "text-indigo-400", badge: "bg-indigo-950/60 border-indigo-800/50 text-indigo-400" },
  emerald: { bg: "bg-emerald-950/20", border: "border-emerald-800/40", text: "text-emerald-400", badge: "bg-emerald-950/60 border-emerald-800/50 text-emerald-400" },
  violet: { bg: "bg-violet-950/20", border: "border-violet-800/40", text: "text-violet-400", badge: "bg-violet-950/60 border-violet-800/50 text-violet-400" },
  orange: { bg: "bg-orange-950/20", border: "border-orange-800/40", text: "text-orange-400", badge: "bg-orange-950/60 border-orange-800/50 text-orange-400" },
  cyan: { bg: "bg-cyan-950/20", border: "border-cyan-800/40", text: "text-cyan-400", badge: "bg-cyan-950/60 border-cyan-800/50 text-cyan-400" },
  pink: { bg: "bg-pink-950/20", border: "border-pink-800/40", text: "text-pink-400", badge: "bg-pink-950/60 border-pink-800/50 text-pink-400" },
  amber: { bg: "bg-amber-950/20", border: "border-amber-800/40", text: "text-amber-400", badge: "bg-amber-950/60 border-amber-800/50 text-amber-400" },
  teal: { bg: "bg-teal-950/20", border: "border-teal-800/40", text: "text-teal-400", badge: "bg-teal-950/60 border-teal-800/50 text-teal-400" },
}

const SAAS_PLANS = [
  {
    label: "Free",
    price: "$0",
    period: "/mo",
    description: "5 posts, 3 review responses per month",
    features: ["Content Agent (limited)", "Reputation Agent (limited)", "1 business location"],
    cta: "Start free",
    href: "/signup",
    highlight: false,
  },
  {
    label: "Starter",
    price: "$49",
    period: "/mo",
    description: "Perfect for solo operators getting started",
    features: ["30 posts/month", "Unlimited review responses", "Lead Gen Agent", "1 business location"],
    cta: "Get started",
    href: "/signup?plan=STARTER",
    highlight: false,
  },
  {
    label: "Growth",
    price: "$99",
    period: "/mo",
    description: "Most popular — the full marketing stack",
    features: ["Unlimited posts", "All 6 core agents", "Retention campaigns", "SEO blog posts", "Up to 3 locations"],
    cta: "Start Growth",
    href: "/signup?plan=GROWTH",
    highlight: true,
    badge: "Most Popular",
  },
  {
    label: "Pro",
    price: "$199",
    period: "/mo",
    description: "Full platform with every agent unlocked",
    features: ["All 16 agents", "Financial Agent", "Hiring Agent", "API access", "Unlimited locations"],
    cta: "Start Pro",
    href: "/signup?plan=PRO",
    highlight: false,
  },
]

const AGENCY_PLANS = [
  {
    label: "Agency Starter",
    price: "$399",
    period: "/mo",
    clients: "Up to 10 clients",
    margin: "10 clients × $500 = $5,000 revenue — $4,601 profit",
    features: ["White-label dashboard", "Custom domain", "Your branding", "Client management portal", "Email support"],
    cta: "Start reselling",
    href: "/signup?plan=AGENCY_STARTER",
    highlight: false,
  },
  {
    label: "Agency Growth",
    price: "$799",
    period: "/mo",
    clients: "Up to 25 clients",
    margin: "25 clients × $750 = $18,750 revenue — $17,951 profit",
    features: ["Everything in Starter", "Priority onboarding", "Co-branded proposals", "Slack support", "Client success playbook"],
    cta: "Scale your agency",
    href: "/signup?plan=AGENCY_GROWTH",
    highlight: true,
    badge: "Best Margin",
  },
  {
    label: "Agency Premium",
    price: "$1,599",
    period: "/mo",
    clients: "Unlimited clients",
    margin: "50 clients × $1,000 = $50,000 revenue — $48,401 profit",
    features: ["Everything in Growth", "Dedicated account manager", "Custom AI training", "SLA guarantee", "Revenue share option"],
    cta: "Go unlimited",
    href: "/signup?plan=AGENCY_PREMIUM",
    highlight: false,
  },
]

const TESTIMONIALS = [
  {
    quote: "AutoPilot generates a full week of social posts every Sunday and responds to our Google reviews before I even see them. It's like having a marketing team for $99/month.",
    name: "Sarah K.",
    role: "Owner, Bloom Hair Studio",
    metric: "Saved $2,400/mo vs. their old agency",
  },
  {
    quote: "We used to miss half our leads because nobody had time to follow up. AutoPilot books the calls automatically. Revenue is up 31% since we started.",
    name: "Marcus T.",
    role: "Owner, T&T Contractors",
    metric: "31% revenue increase in 90 days",
  },
  {
    quote: "We white-labeled this and pitched it to 8 clients at $750/month each. That's $6,000/month in new recurring revenue on a $399 plan. This thing prints money.",
    name: "Dana L.",
    role: "Founder, Apex Digital Agency",
    metric: "$6,000/mo recurring on a $399 plan",
  },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-gray-900 bg-gray-950/90 backdrop-blur-sm px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm tracking-tight">AP</span>
            </div>
            <span className="font-bold text-lg tracking-tight">AutoPilot</span>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <a href="#for-business" className="text-sm text-gray-400 hover:text-white transition-colors">For Businesses</a>
            <a href="#for-agencies" className="text-sm text-gray-400 hover:text-white transition-colors">For Agencies</a>
            <a href="#ai-team" className="text-sm text-gray-400 hover:text-white transition-colors">AI Team</a>
            <a href="#pricing" className="text-sm text-gray-400 hover:text-white transition-colors">Pricing</a>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm text-gray-400 hover:text-white transition-colors">Sign in</Link>
            <Link
              href="/signup"
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              Start free
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="px-6 py-28 text-center relative overflow-hidden">
        {/* Background gradient glow */}
        <div className="absolute inset-0 bg-gradient-to-b from-indigo-950/30 via-transparent to-transparent pointer-events-none" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="max-w-5xl mx-auto relative">
          <div className="inline-flex items-center gap-2 bg-indigo-950/60 border border-indigo-800/60 text-indigo-400 text-xs font-semibold px-3.5 py-1.5 rounded-full mb-8 tracking-wide uppercase">
            <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full" />
            AI Business Operating System — 16 agents, zero staff
          </div>
          <h1 className="text-6xl font-extrabold leading-none tracking-tight mb-6">
            Stop paying $3,000/mo<br />
            for a marketing agency.<br />
            <span className="text-indigo-400">Pay $99 and get better results.</span>
          </h1>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-4 leading-relaxed">
            AutoPilot runs 16 AI agents that handle your marketing, reputation, lead gen, retention, SEO, and finances — automatically, every single day.
          </p>
          <p className="text-base text-gray-500 mb-10">
            Your competitor down the street is already using AI. Are you?
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/signup"
              className="px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-colors text-lg shadow-lg shadow-indigo-900/40"
            >
              Start free — no card required
            </Link>
            <a
              href="#for-agencies"
              className="px-8 py-4 bg-gray-900 hover:bg-gray-800 border border-gray-700 text-gray-300 font-semibold rounded-xl transition-colors text-lg"
            >
              Build an agency
            </a>
          </div>
          <p className="mt-5 text-sm text-gray-600">Setup takes 5 minutes. Results in your first week.</p>
        </div>
      </section>

      {/* Stats bar */}
      <section className="px-6 py-8 border-y border-gray-900 bg-gray-900/30">
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          <div>
            <p className="text-3xl font-extrabold text-white">4.2 hrs</p>
            <p className="text-sm text-gray-500 mt-1">saved per business, per day</p>
          </div>
          <div>
            <p className="text-3xl font-extrabold text-white">3.8x</p>
            <p className="text-sm text-gray-500 mt-1">more Google reviews in 90 days</p>
          </div>
          <div>
            <p className="text-3xl font-extrabold text-white">$8,400</p>
            <p className="text-sm text-gray-500 mt-1">avg. agency monthly revenue</p>
          </div>
          <div>
            <p className="text-3xl font-extrabold text-white">16</p>
            <p className="text-sm text-gray-500 mt-1">AI agents working 24/7</p>
          </div>
        </div>
      </section>

      {/* ── FOR BUSINESS OWNERS ── */}
      <section id="for-business" className="px-6 py-24">
        <div className="max-w-6xl mx-auto">
          {/* Section header */}
          <div className="mb-16">
            <div className="inline-flex items-center gap-2 bg-emerald-950/60 border border-emerald-800/60 text-emerald-400 text-xs font-semibold px-3.5 py-1.5 rounded-full mb-5 tracking-wide uppercase">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
              For Small Business Owners
            </div>
            <h2 className="text-4xl font-extrabold tracking-tight mb-4">
              You didn&apos;t start a business<br />
              to spend 3 hours a day on marketing.
            </h2>
            <p className="text-lg text-gray-400 max-w-2xl">
              Hiring a marketing agency costs $2,000–5,000/month and they&apos;ll send you a PDF report once a week.
              AutoPilot does the actual work — every day — for $99.
            </p>
          </div>

          {/* Pain vs outcome grid */}
          <div className="grid md:grid-cols-2 gap-6 mb-16">
            {/* Pain column */}
            <div className="bg-red-950/20 border border-red-900/40 rounded-2xl p-8">
              <p className="text-sm font-semibold text-red-400 uppercase tracking-widest mb-6">Without AutoPilot</p>
              <ul className="space-y-4">
                {[
                  "You forget to post for two weeks. Customers wonder if you're still open.",
                  "A 2-star review sits unanswered for 3 days. Prospects see it.",
                  "Leads contact you and never hear back. They hire your competitor.",
                  "You pay $300/mo to an agency for 4 posts that look like stock photos.",
                  "A loyal customer stops coming. You never knew why. You never followed up.",
                ].map((item) => (
                  <li key={item} className="flex gap-3 text-gray-400 text-sm leading-relaxed">
                    <span className="text-red-500 mt-0.5 shrink-0">✕</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            {/* Outcome column */}
            <div className="bg-emerald-950/20 border border-emerald-900/40 rounded-2xl p-8">
              <p className="text-sm font-semibold text-emerald-400 uppercase tracking-widest mb-6">With AutoPilot at $99/mo</p>
              <ul className="space-y-4">
                {[
                  "47 social posts this month. On-brand, on schedule. Zero effort from you.",
                  "Every review responded to in under 5 minutes — while you slept.",
                  "8 new leads contacted, followed up with, and booked automatically.",
                  "4 SEO blog posts published, ranking for local keywords that bring traffic.",
                  "3 win-back campaigns fired to customers at day 30, 45, and 60 — automatically.",
                ].map((item) => (
                  <li key={item} className="flex gap-3 text-gray-300 text-sm leading-relaxed">
                    <span className="text-emerald-400 mt-0.5 shrink-0">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* ROI callout */}
          <div className="bg-gradient-to-r from-indigo-950/60 to-indigo-900/30 border border-indigo-800/50 rounded-2xl p-8 text-center">
            <p className="text-sm text-indigo-400 font-semibold uppercase tracking-widest mb-3">The math is not complicated</p>
            <p className="text-3xl font-extrabold mb-2">
              One new customer per month covers your entire subscription.
            </p>
            <p className="text-gray-400 text-lg">
              The average AutoPilot business adds 6–12 new customers in their first 90 days. At any average ticket, that&apos;s a 10–30x ROI on $99/mo.
            </p>
          </div>
        </div>
      </section>

      {/* Agents showcase */}
      <section className="px-6 py-20 bg-gray-900/30 border-y border-gray-900">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-extrabold tracking-tight mb-3">6 agents. Running every day. Doing the work you don&apos;t have time for.</h2>
            <p className="text-gray-400 max-w-xl mx-auto">Each agent is purpose-built for a specific job. Together they replace a marketing manager, a reputation specialist, and a sales development rep.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {AGENTS.map((agent) => (
              <div
                key={agent.label}
                className="bg-gray-900 border border-gray-800 rounded-2xl p-6 hover:border-indigo-800/60 transition-colors group"
              >
                <div className="flex items-start justify-between mb-4">
                  <h3 className="font-bold text-white text-lg">{agent.label}</h3>
                  <span className="text-xs font-bold text-indigo-400 bg-indigo-950/60 border border-indigo-800/50 px-2.5 py-1 rounded-full whitespace-nowrap ml-2 shrink-0">
                    {agent.stat}
                  </span>
                </div>
                <p className="text-sm text-gray-400 leading-relaxed">{agent.description}</p>
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-gray-600 mt-8">+ 10 more agents including Legal, Hiring, Financial, Email Marketing, SMS, and more</p>
        </div>
      </section>

      {/* ── FOR AGENCIES ── */}
      <section id="for-agencies" className="px-6 py-24">
        <div className="max-w-6xl mx-auto">
          <div className="mb-16">
            <div className="inline-flex items-center gap-2 bg-violet-950/60 border border-violet-800/60 text-violet-400 text-xs font-semibold px-3.5 py-1.5 rounded-full mb-5 tracking-wide uppercase">
              <span className="w-1.5 h-1.5 bg-violet-400 rounded-full" />
              For AI Agencies &amp; Resellers
            </div>
            <h2 className="text-4xl font-extrabold tracking-tight mb-4">
              Build a $50,000/month agency<br />
              on our white-label platform.
            </h2>
            <p className="text-lg text-gray-400 max-w-2xl">
              Your brand. Your pricing. Our AI does the work. Agencies are charging clients $500–2,000/month to deliver exactly what AutoPilot automates — and pocketing the margin.
            </p>
          </div>

          {/* Business opportunity layout */}
          <div className="grid md:grid-cols-3 gap-6 mb-16">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-7">
              <p className="text-4xl font-extrabold text-white mb-2">$399<span className="text-base font-normal text-gray-500">/mo</span></p>
              <p className="text-gray-400 text-sm mb-4">What you pay AutoPilot — for up to 10 clients</p>
              <div className="h-px bg-gray-800 mb-4" />
              <p className="text-sm text-gray-500">Your cost per client: <span className="text-white font-semibold">$40/mo</span></p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-7">
              <p className="text-4xl font-extrabold text-white mb-2">$500–$2k<span className="text-base font-normal text-gray-500">/client</span></p>
              <p className="text-gray-400 text-sm mb-4">What you charge — what agencies normally bill for this work</p>
              <div className="h-px bg-gray-800 mb-4" />
              <p className="text-sm text-gray-500">Industry rate for managed marketing: <span className="text-white font-semibold">$2,000–5,000/mo</span></p>
            </div>
            <div className="bg-emerald-950/30 border border-emerald-800/50 rounded-2xl p-7">
              <p className="text-4xl font-extrabold text-emerald-400 mb-2">$4,601<span className="text-base font-normal text-emerald-700">/mo profit</span></p>
              <p className="text-gray-400 text-sm mb-4">On just 10 clients at $500 — before you add more</p>
              <div className="h-px bg-emerald-900/40 mb-4" />
              <p className="text-sm text-emerald-600">10 clients × $500 = $5,000 revenue − $399 = <span className="text-emerald-400 font-semibold">$4,601 profit</span></p>
            </div>
          </div>

          {/* What white-label includes */}
          <div className="grid md:grid-cols-2 gap-12 items-center mb-16">
            <div>
              <h3 className="text-2xl font-bold mb-6">Everything you need to resell at premium.</h3>
              <ul className="space-y-4">
                {[
                  { title: "White-label dashboard", desc: "Your logo, your domain, your colors — clients see your brand, not ours." },
                  { title: "Custom pricing control", desc: "Charge whatever the market will bear. $500, $1,000, $2,000 — your call." },
                  { title: "Client management portal", desc: "Manage all clients from one place. Onboard, configure, and monitor at scale." },
                  { title: "Pre-built proposals and decks", desc: "Done-for-you sales materials so you can close faster with zero setup." },
                  { title: "AI does the delivery", desc: "You sell, we fulfill. No staff, no overhead, no deliverable stress." },
                ].map((item) => (
                  <li key={item.title} className="flex gap-4">
                    <span className="w-5 h-5 bg-violet-600/20 border border-violet-600/40 rounded flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-violet-400 text-xs">✓</span>
                    </span>
                    <div>
                      <p className="font-semibold text-white text-sm">{item.title}</p>
                      <p className="text-gray-500 text-sm mt-0.5">{item.desc}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-gradient-to-br from-violet-950/40 to-gray-900 border border-violet-800/30 rounded-2xl p-8">
              <p className="text-sm font-semibold text-violet-400 uppercase tracking-widest mb-6">Agency revenue model</p>
              <div className="space-y-4">
                {[
                  { clients: "5 clients", charge: "$750/mo each", revenue: "$3,750", cost: "$399", profit: "$3,351" },
                  { clients: "10 clients", charge: "$750/mo each", revenue: "$7,500", cost: "$399", profit: "$7,101" },
                  { clients: "25 clients", charge: "$1,000/mo each", revenue: "$25,000", cost: "$799", profit: "$24,201" },
                  { clients: "50 clients", charge: "$1,000/mo each", revenue: "$50,000", cost: "$1,599", profit: "$48,401" },
                ].map((row) => (
                  <div key={row.clients} className="flex items-center justify-between py-3 border-b border-gray-800/50 last:border-0">
                    <div>
                      <p className="font-semibold text-white text-sm">{row.clients}</p>
                      <p className="text-gray-500 text-xs">at {row.charge}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-emerald-400 font-bold text-sm">{row.profit}/mo profit</p>
                      <p className="text-gray-600 text-xs">{row.revenue} revenue − {row.cost} cost</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Agency CTA */}
          <div className="bg-gradient-to-r from-violet-950/50 to-indigo-950/50 border border-violet-800/30 rounded-2xl p-8 flex flex-col md:flex-row items-center justify-between gap-6">
            <div>
              <p className="text-xl font-bold mb-2">Ready to build your AI agency?</p>
              <p className="text-gray-400 text-sm">Start with the Agency Starter plan at $399/mo. Most partners recoup it with their first client.</p>
            </div>
            <Link
              href="/signup?plan=AGENCY_STARTER"
              className="shrink-0 px-7 py-3.5 bg-violet-600 hover:bg-violet-500 text-white font-bold rounded-xl transition-colors shadow-lg shadow-violet-900/40"
            >
              Start your agency
            </Link>
          </div>
        </div>
      </section>

      {/* ── MEET YOUR AI TEAM (Agency Section) ── */}
      <section id="ai-team" className="px-6 py-24 bg-gray-900/20 border-y border-gray-900">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-2 bg-violet-950/60 border border-violet-800/60 text-violet-400 text-xs font-semibold px-3.5 py-1.5 rounded-full mb-5 tracking-wide uppercase">
              <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-pulse" />
              8 Agents. 8 Services. One Subscription.
            </div>
            <h2 className="text-4xl font-extrabold tracking-tight mb-4">
              Meet your AI team.
            </h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">
              Each agent is a fully deployed service you can sell. Your clients see expert work. You see margin.
            </p>
          </div>

          {/* Total revenue callout */}
          <div className="bg-gradient-to-r from-violet-950/40 to-indigo-950/40 border border-violet-800/30 rounded-2xl p-6 mb-14 flex flex-col md:flex-row items-center justify-between gap-4">
            <div>
              <p className="text-sm text-violet-400 font-semibold uppercase tracking-widest mb-1">If you sold all 8 services to one client</p>
              <p className="text-3xl font-extrabold text-white">$3,000–6,100/month per client</p>
              <p className="text-gray-500 text-sm mt-1">vs. your AutoPilot cost of $40/client on the Agency Starter plan</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-5xl font-extrabold text-emerald-400">97%</p>
              <p className="text-sm text-gray-500 mt-1">gross margin per client</p>
            </div>
          </div>

          {/* Agent cards */}
          <div className="space-y-6">
            {AGENCY_AGENTS.map((agent) => {
              const c = COLOR_MAP[agent.color]
              return (
                <div key={agent.id} className={`${c.bg} border ${c.border} rounded-2xl p-6 md:p-8`}>
                  <div className="grid md:grid-cols-2 gap-8 items-start">
                    {/* Left: agent info */}
                    <div>
                      <div className="flex items-start gap-4 mb-4">
                        <div className={`w-10 h-10 rounded-xl border ${c.border} ${c.bg} flex items-center justify-center shrink-0`}>
                          <span className={`text-lg font-bold ${c.text}`}>{agent.name[0]}</span>
                        </div>
                        <div>
                          <h3 className="font-bold text-white text-xl">{agent.name}</h3>
                          <p className={`text-sm font-medium ${c.text} mt-0.5`}>{agent.tagline}</p>
                        </div>
                      </div>

                      <div className="space-y-3 mb-5">
                        <div className="flex gap-2 items-start">
                          <span className="text-gray-600 text-xs uppercase tracking-widest shrink-0 mt-0.5 w-20">Delivers</span>
                          <span className="text-gray-300 text-sm">{agent.deliverable}</span>
                        </div>
                        <div className="flex gap-2 items-start">
                          <span className="text-gray-600 text-xs uppercase tracking-widest shrink-0 mt-0.5 w-20">Sell as</span>
                          <span className="text-white text-sm font-semibold">{agent.sellAs}</span>
                        </div>
                        <div className="flex gap-2 items-center">
                          <span className="text-gray-600 text-xs uppercase tracking-widest shrink-0 w-20">Bill at</span>
                          <span className={`text-sm font-bold ${c.text}`}>{agent.clientRate}</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {agent.platforms.map(p => (
                          <span key={p} className={`text-xs px-2.5 py-1 rounded-full border ${c.badge}`}>{p}</span>
                        ))}
                      </div>
                    </div>

                    {/* Right: sample output */}
                    <div>
                      <p className="text-xs text-gray-600 uppercase tracking-widest mb-3">{agent.outputLabel}</p>
                      <div className="bg-gray-950/60 border border-gray-800 rounded-xl p-4">
                        <p className="text-gray-300 text-sm leading-relaxed italic whitespace-pre-line">{agent.output}</p>
                      </div>
                      <div className={`mt-3 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border ${c.badge}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${c.text.replace("text-", "bg-")}`} />
                        {agent.metric}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Bottom agency CTA */}
          <div className="mt-12 text-center">
            <p className="text-gray-400 text-lg mb-6">
              Every one of these agents is included in your agency plan. <br className="hidden md:block"/>
              You don&apos;t build them. You don&apos;t hire for them. You just sell them.
            </p>
            <Link
              href="/signup?plan=AGENCY_STARTER"
              className="inline-block px-8 py-4 bg-violet-600 hover:bg-violet-500 text-white font-bold rounded-xl transition-colors text-lg shadow-lg shadow-violet-900/40"
            >
              Start selling these services today
            </Link>
          </div>
        </div>
      </section>

      {/* Social Proof */}
      <section className="px-6 py-20 bg-gray-900/30 border-y border-gray-900">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-extrabold text-center mb-3 tracking-tight">Real businesses. Real numbers.</h2>
          <p className="text-gray-500 text-center mb-12 text-sm">Not hand-picked edge cases — these are typical results from our first 90 days.</p>
          <div className="grid md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t) => (
              <div key={t.name} className="bg-gray-900 border border-gray-800 rounded-2xl p-6 flex flex-col">
                <div className="inline-block bg-indigo-950/60 border border-indigo-800/40 text-indigo-400 text-xs font-bold px-3 py-1.5 rounded-full mb-5 self-start">
                  {t.metric}
                </div>
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

      {/* Pricing */}
      <section id="pricing" className="px-6 py-24">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-extrabold tracking-tight mb-3">Two tracks. One platform.</h2>
            <p className="text-gray-400 text-lg">Growing your business, or building an agency on top of ours?</p>
          </div>

          {/* SaaS plans */}
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="inline-flex items-center gap-2 bg-emerald-950/60 border border-emerald-800/60 text-emerald-400 text-xs font-semibold px-3 py-1 rounded-full tracking-wide uppercase">
                For Business Owners
              </div>
              <div className="h-px bg-gray-800 flex-1" />
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {SAAS_PLANS.map((plan) => (
                <div
                  key={plan.label}
                  className={`rounded-2xl border p-6 flex flex-col relative ${
                    plan.highlight
                      ? "border-indigo-500 bg-indigo-950/30"
                      : "border-gray-800 bg-gray-900"
                  }`}
                >
                  {plan.badge && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs bg-indigo-600 text-white px-3 py-1 rounded-full font-bold whitespace-nowrap">
                      {plan.badge}
                    </span>
                  )}
                  <p className="font-bold text-gray-300 text-sm mb-1">{plan.label}</p>
                  <p className="text-4xl font-extrabold text-white mb-1">
                    {plan.price}
                    <span className="text-base font-normal text-gray-500">{plan.period}</span>
                  </p>
                  <p className="text-xs text-gray-500 mb-5">{plan.description}</p>
                  <ul className="space-y-2 flex-1 mb-6">
                    {plan.features.map((f) => (
                      <li key={f} className="flex gap-2 text-xs text-gray-400">
                        <span className="text-emerald-500 shrink-0">✓</span>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href={plan.href}
                    className={`text-center py-2.5 rounded-lg font-semibold text-sm transition-colors ${
                      plan.highlight
                        ? "bg-indigo-600 hover:bg-indigo-500 text-white"
                        : "bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700"
                    }`}
                  >
                    {plan.cta}
                  </Link>
                </div>
              ))}
            </div>
          </div>

          {/* Agency plans */}
          <div className="mt-14">
            <div className="flex items-center gap-3 mb-6">
              <div className="inline-flex items-center gap-2 bg-violet-950/60 border border-violet-800/60 text-violet-400 text-xs font-semibold px-3 py-1 rounded-full tracking-wide uppercase">
                For Agencies &amp; Resellers
              </div>
              <div className="h-px bg-gray-800 flex-1" />
            </div>
            <div className="grid sm:grid-cols-1 lg:grid-cols-3 gap-5">
              {AGENCY_PLANS.map((plan) => (
                <div
                  key={plan.label}
                  className={`rounded-2xl border p-7 flex flex-col relative ${
                    plan.highlight
                      ? "border-violet-500 bg-violet-950/20"
                      : "border-gray-800 bg-gray-900"
                  }`}
                >
                  {plan.badge && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs bg-violet-600 text-white px-3 py-1 rounded-full font-bold whitespace-nowrap">
                      {plan.badge}
                    </span>
                  )}
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <p className="font-bold text-white text-lg">{plan.label}</p>
                      <p className="text-sm text-gray-500 mt-0.5">{plan.clients}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-3xl font-extrabold text-white">
                        {plan.price}
                        <span className="text-sm font-normal text-gray-500">{plan.period}</span>
                      </p>
                    </div>
                  </div>
                  <div className="bg-emerald-950/30 border border-emerald-900/40 rounded-lg px-4 py-3 mb-5">
                    <p className="text-xs text-emerald-400 leading-relaxed font-medium">{plan.margin}</p>
                  </div>
                  <ul className="space-y-2.5 flex-1 mb-6">
                    {plan.features.map((f) => (
                      <li key={f} className="flex gap-2 text-sm text-gray-400">
                        <span className="text-violet-400 shrink-0 mt-0.5">✓</span>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href={plan.href}
                    className={`text-center py-3 rounded-lg font-bold text-sm transition-colors ${
                      plan.highlight
                        ? "bg-violet-600 hover:bg-violet-500 text-white"
                        : "bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700"
                    }`}
                  >
                    {plan.cta}
                  </Link>
                </div>
              ))}
            </div>
            <p className="text-center text-sm text-gray-600 mt-5">
              All agency plans include white-label dashboard, custom domain, client management portal, and done-for-you proposal templates.
            </p>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="px-6 py-28 text-center relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-t from-indigo-950/30 via-transparent to-transparent pointer-events-none" />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-indigo-600/8 rounded-full blur-3xl pointer-events-none" />
        <div className="max-w-3xl mx-auto relative">
          <h2 className="text-5xl font-extrabold tracking-tight mb-5">
            Every day you wait, your competitor<br />
            <span className="text-indigo-400">is using this instead of you.</span>
          </h2>
          <p className="text-gray-400 text-xl mb-4 leading-relaxed">
            AutoPilot starts working the moment you sign up. First posts go out this week. First leads contacted within 48 hours. First review responded to within minutes.
          </p>
          <p className="text-gray-600 text-base mb-10">
            Free plan available. No credit card required. Cancel anytime.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/signup"
              className="px-10 py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-lg rounded-xl transition-colors shadow-xl shadow-indigo-900/40"
            >
              Get started free
            </Link>
            <Link
              href="/signup?plan=AGENCY_STARTER"
              className="px-10 py-4 bg-gray-900 hover:bg-gray-800 border border-gray-700 text-gray-300 font-semibold text-lg rounded-xl transition-colors"
            >
              Start an agency
            </Link>
          </div>
          <p className="mt-6 text-xs text-gray-700">
            Joining 2,400+ businesses and 180+ agencies already running on AutoPilot
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-900 px-6 py-10">
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
