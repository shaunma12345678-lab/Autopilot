import { createSupabaseServerClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import ForeclosureSearch from "@/components/dashboard/ForeclosureSearch"
import { hasGmailConnected } from "@/lib/gmail"

export const metadata = {
  title: "Pre-Foreclosure Leads | Autopilot",
}

interface ServiceStatus {
  key: string
  label: string
  configured: boolean
  tier: string
  signupUrl?: string
  envVar?: string
  note?: string
}

export default async function ForeclosureLeadsPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const business = await prisma.business.findFirst({ where: { userId: user.id } })
  if (!business) redirect("/onboarding")

  const gmailConnected = await hasGmailConnected(user.id)

  const services: ServiceStatus[] = [
    {
      key: "data",
      label: "Foreclosure Data",
      configured: !!process.env.ATTOM_API_KEY || !!process.env.TAVILY_API_KEY,
      tier: process.env.ATTOM_API_KEY ? "ATTOM (deep)" : process.env.TAVILY_API_KEY ? "Free public records" : "Not configured",
      signupUrl: "https://app.tavily.com/sign-up",
      envVar: "TAVILY_API_KEY",
      note: process.env.ATTOM_API_KEY ? "ATTOM configured — full equity/lien data" : "Add TAVILY_API_KEY free at tavily.com → 1,000 searches/month",
    },
    {
      key: "ai",
      label: "AI Scoring",
      configured: !!(process.env.GROQ_API_KEY || process.env.ANTHROPIC_API_KEY),
      tier: process.env.ANTHROPIC_API_KEY ? "Claude" : process.env.GROQ_API_KEY ? "Groq (free)" : "Not set",
      note: "Already configured ✓",
    },
    {
      key: "email",
      label: "Email Sending",
      configured: gmailConnected || !!process.env.RESEND_API_KEY,
      tier: gmailConnected ? "Gmail (free)" : process.env.RESEND_API_KEY ? "Resend" : "Not configured",
      signupUrl: "/integrations",
      note: gmailConnected ? "Gmail connected — unlimited free" : "Connect Gmail at /integrations (free) or add RESEND_API_KEY",
    },
    {
      key: "sms",
      label: "SMS Sending",
      configured: !!(process.env.TWILIO_ACCOUNT_SID || process.env.TEXTBELT_API_KEY || gmailConnected),
      tier: process.env.TWILIO_ACCOUNT_SID ? "Twilio" : process.env.TEXTBELT_API_KEY ? "TextBelt" : gmailConnected ? "Email-to-SMS (free)" : "Not configured",
      note: gmailConnected ? "Email-to-SMS available free via Gmail (need carrier)" : "Connect Gmail for free email-to-SMS, or add TEXTBELT_API_KEY ($10 = 1,000 texts)",
    },
  ]

  const allConfigured = services.every(s => s.configured)
  const configuredCount = services.filter(s => s.configured).length

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Pre-Foreclosure Lead Finder</h1>
        <p className="text-gray-400 mt-1 text-sm">
          Find distressed homeowners before anyone else — NOD, Lis Pendens, at-risk signals, AI scoring, and outreach generation.
        </p>
      </div>

      {/* Setup status bar */}
      <div className={`rounded-2xl border p-4 ${allConfigured ? "bg-emerald-950/30 border-emerald-500/20" : "bg-gray-900/60 border-gray-700/40"}`}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-white">
            Setup Status — {configuredCount}/{services.length} configured
          </p>
          {!allConfigured && (
            <p className="text-[11px] text-gray-500">
              The tool works right now with {configuredCount} service{configuredCount !== 1 ? "s" : ""}. Steps below unlock more features.
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {services.map(s => (
            <div key={s.key} className={`rounded-xl p-3 border ${s.configured ? "bg-emerald-950/30 border-emerald-500/20" : "bg-gray-800/40 border-gray-700/40"}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className={`w-2 h-2 rounded-full ${s.configured ? "bg-emerald-400" : "bg-gray-600"}`} />
                <span className="text-xs font-semibold text-white">{s.label}</span>
              </div>
              <p className={`text-[11px] ${s.configured ? "text-emerald-400" : "text-gray-500"}`}>{s.tier}</p>
              {s.note && <p className="text-[10px] text-gray-600 mt-1 leading-tight">{s.note}</p>}
              {!s.configured && s.signupUrl && (
                <a
                  href={s.signupUrl}
                  target={s.signupUrl.startsWith("http") ? "_blank" : undefined}
                  rel="noreferrer"
                  className="text-[10px] text-indigo-400 hover:underline mt-1 inline-block"
                >
                  {s.signupUrl.startsWith("/") ? "Set up →" : "Sign up free →"}
                </a>
              )}
            </div>
          ))}
        </div>

        {!process.env.TAVILY_API_KEY && !process.env.ATTOM_API_KEY && (
          <div className="mt-3 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
            <p className="text-xs text-amber-300 font-semibold">One step to activate live searches:</p>
            <p className="text-[11px] text-amber-400/80 mt-1">
              1. Go to <a href="https://app.tavily.com/sign-up" target="_blank" rel="noreferrer" className="underline">app.tavily.com/sign-up</a> (free, takes 2 minutes)<br />
              2. Copy your API key<br />
              3. Add <code className="text-amber-300 bg-amber-500/10 px-1 rounded">TAVILY_API_KEY=tvly-xxxx</code> to your .env.local and Vercel env vars<br />
              4. Redeploy — free public records search will be live
            </p>
          </div>
        )}
      </div>

      <ForeclosureSearch businessId={business.id} />
    </div>
  )
}
