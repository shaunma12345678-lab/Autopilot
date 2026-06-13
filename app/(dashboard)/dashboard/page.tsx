import { getSessionOrAdminUser } from "@/lib/auth-helper"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import Link from "next/link"
import ContentApprovalQueue from "@/components/dashboard/ContentApprovalQueue"

export default async function DashboardPage() {
  const user = await getSessionOrAdminUser()
  if (!user) redirect("/onboarding")

  const business = await prisma.business.findFirst({ where: { userId: user.id } })
  if (!business) redirect("/foreclosure-leads")

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startOfWeek  = new Date(now); startOfWeek.setDate(now.getDate() - now.getDay())

  const [
    contentThisMonth,
    reviewsThisWeek,
    leadsThisMonth,
    pendingContent,
    recentReviews,
    totalLeads,
    approvedContent,
  ] = await Promise.all([
    prisma.content.count({ where: { businessId: business.id, createdAt: { gte: startOfMonth } } }),
    prisma.review.count({ where: { businessId: business.id, createdAt: { gte: startOfWeek } } }),
    prisma.lead.count({ where: { businessId: business.id, createdAt: { gte: startOfMonth } } }),
    prisma.content.findMany({
      where: { businessId: business.id, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.review.findMany({
      where: { businessId: business.id },
      orderBy: { createdAt: "desc" },
      take: 4,
    }),
    prisma.lead.count({ where: { businessId: business.id } }),
    prisma.content.count({ where: { businessId: business.id, status: "APPROVED" } }),
  ])

  const activeAgents = business.activeAgents.length

  // Agent registry — every agent the platform provides
  const ALL_AGENTS = [
    { name: "Content",          href: "/content",          icon: "✎",  color: "indigo" },
    { name: "Leads",            href: "/leads",            icon: "◎",  color: "cyan" },
    { name: "Ad Copy",          href: "/ads",              icon: "📢", color: "orange" },
    { name: "Email Marketing",  href: "/email-marketing",  icon: "✉",  color: "violet" },
    { name: "SEO",              href: "/seo",              icon: "🔎", color: "teal" },
    { name: "Sales Scripts",    href: "/sales",            icon: "📞", color: "green" },
    { name: "Reputation",       href: "/reputation",       icon: "★",  color: "amber" },
    { name: "Cashflow",         href: "/cashflow",         icon: "💰", color: "emerald" },
    { name: "Legal Docs",       href: "/legal",            icon: "⚖",  color: "blue" },
    { name: "Tax Strategy",     href: "/tax-strategy",     icon: "🏛️", color: "slate" },
    { name: "Hiring",           href: "/hiring",           icon: "👥", color: "rose" },
    { name: "Competitors",      href: "/competitors",      icon: "🔍", color: "fuchsia" },
  ]

  return (
    <div className="p-8 max-w-7xl mx-auto">

      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{business.name}</h1>
          <p className="text-gray-400 mt-1 text-sm">
            Your AI business engine — {ALL_AGENTS.length} agents available, {activeAgents} active
          </p>
        </div>
        <div className="flex items-center gap-2 bg-emerald-950/40 border border-emerald-800/50 rounded-full px-3 py-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-emerald-400 text-xs font-semibold">All systems operational</span>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KPICard
          label="Content Generated"
          value={contentThisMonth}
          sub="this month"
          detail={`${approvedContent} approved`}
          color="indigo"
          icon="✎"
        />
        <KPICard
          label="Reviews Managed"
          value={reviewsThisWeek}
          sub="this week"
          detail={`${recentReviews.length} recent`}
          color="amber"
          icon="★"
        />
        <KPICard
          label="New Leads"
          value={leadsThisMonth}
          sub="this month"
          detail={`${totalLeads} total`}
          color="cyan"
          icon="◎"
        />
        <KPICard
          label="Active Agents"
          value={activeAgents}
          sub="running"
          detail={`${ALL_AGENTS.length} available`}
          color="violet"
          icon="⚡"
        />
      </div>

      {/* Middle row */}
      <div className="grid grid-cols-3 gap-6 mb-6">
        {/* Pending approvals — spans 2 cols */}
        <div className="col-span-2 bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="font-semibold text-white">Pending Approvals</h2>
              <p className="text-xs text-gray-500 mt-0.5">AI-generated content awaiting your review</p>
            </div>
            <Link href="/content" className="text-xs text-indigo-400 hover:text-indigo-300 bg-indigo-950/40 border border-indigo-800/50 px-3 py-1.5 rounded-full transition">
              View all
            </Link>
          </div>
          <ContentApprovalQueue initialContent={pendingContent} businessId={business.id} />
        </div>

        {/* Recent reviews */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="font-semibold text-white">Recent Reviews</h2>
              <p className="text-xs text-gray-500 mt-0.5">Auto-monitored 24/7</p>
            </div>
            <Link href="/reputation" className="text-xs text-amber-400 hover:text-amber-300 bg-amber-950/40 border border-amber-800/50 px-3 py-1.5 rounded-full transition">
              Manage
            </Link>
          </div>
          {recentReviews.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-4xl mb-2">⭐</p>
              <p className="text-sm text-gray-500">No reviews yet</p>
              <Link href="/review-gen" className="text-xs text-amber-400 underline mt-2 inline-block">Generate your first review request →</Link>
            </div>
          ) : (
            <div className="space-y-3">
              {recentReviews.map((r: { id: string; reviewerName: string; rating: number; reviewText: string; status: string }) => (
                <div key={r.id} className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-white">{r.reviewerName}</span>
                    <span className="text-amber-400 text-xs tracking-wider">
                      {"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 line-clamp-2 leading-relaxed">{r.reviewText}</p>
                  <span className={`inline-block text-xs px-2 py-0.5 rounded-full mt-2 ${
                    r.status === "APPROVED" ? "bg-emerald-900/40 text-emerald-400 border border-emerald-800/40" :
                    r.status === "PENDING"  ? "bg-amber-900/40 text-amber-400 border border-amber-800/40" :
                    "bg-gray-800 text-gray-500 border border-gray-700"
                  }`}>{r.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Agent grid */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-semibold text-white">AI Agent Suite</h2>
            <p className="text-xs text-gray-500 mt-0.5">{ALL_AGENTS.length} agents — click any to activate</p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            Powered by Claude Sonnet
          </div>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {ALL_AGENTS.map(agent => (
            <Link
              key={agent.href}
              href={agent.href}
              className="group flex flex-col items-center gap-2 bg-gray-800/40 hover:bg-gray-800 border border-gray-700/50 hover:border-gray-600 rounded-xl p-3 transition-all duration-150"
            >
              <span className="text-2xl group-hover:scale-110 transition-transform duration-150">
                {agent.icon}
              </span>
              <span className="text-xs font-medium text-gray-300 group-hover:text-white text-center leading-tight">
                {agent.name}
              </span>
            </Link>
          ))}
        </div>
      </div>

    </div>
  )
}

function KPICard({
  label, value, sub, detail, color, icon,
}: {
  label: string; value: number; sub: string; detail: string; color: string; icon: string
}) {
  const palettes: Record<string, { bg: string; border: string; text: string; dot: string }> = {
    indigo: { bg: "bg-indigo-950/30",  border: "border-indigo-800/40",  text: "text-indigo-400",  dot: "bg-indigo-500" },
    cyan:   { bg: "bg-cyan-950/30",    border: "border-cyan-800/40",    text: "text-cyan-400",    dot: "bg-cyan-500" },
    amber:  { bg: "bg-amber-950/30",   border: "border-amber-800/40",   text: "text-amber-400",   dot: "bg-amber-500" },
    violet: { bg: "bg-violet-950/30",  border: "border-violet-800/40",  text: "text-violet-400",  dot: "bg-violet-500" },
    emerald:{ bg: "bg-emerald-950/30", border: "border-emerald-800/40", text: "text-emerald-400", dot: "bg-emerald-500" },
  }
  const p = palettes[color] ?? palettes.indigo

  return (
    <div className={`${p.bg} border ${p.border} rounded-2xl p-5`}>
      <div className="flex items-center justify-between mb-3">
        <div className={`w-8 h-8 rounded-xl ${p.bg} border ${p.border} flex items-center justify-center text-sm`}>
          {icon}
        </div>
        <div className={`w-2 h-2 rounded-full ${p.dot}`} />
      </div>
      <p className="text-3xl font-bold tracking-tight text-white">{value.toLocaleString()}</p>
      <p className={`text-sm font-semibold ${p.text} mt-1`}>{label}</p>
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-gray-500">{sub}</span>
        <span className="text-xs text-gray-600">{detail}</span>
      </div>
    </div>
  )
}
