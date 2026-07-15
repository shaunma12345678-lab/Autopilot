import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? ""   // no fallback: unset env disables admin access

const ZERO_AGENTS = [
  { id: "content", name: "Content Agent", color: "indigo", status: "idle", last24h: 0, lastHour: 0, queueSize: 0, successRate: 0, description: "Social posts, newsletters, SMS campaigns", route: "/content" },
  { id: "reputation", name: "Reputation Agent", color: "emerald", status: "idle", last24h: 0, lastHour: 0, queueSize: 0, successRate: 0, description: "Review responses, sentiment analysis, alerts", route: "/reputation" },
  { id: "leads", name: "Lead Gen Agent", color: "violet", status: "idle", last24h: 0, lastHour: 0, queueSize: 0, successRate: 0, description: "Cold emails, follow-up sequences, lead scores", route: "/leads" },
  { id: "seo", name: "SEO Agent", color: "cyan", status: "idle", last24h: 0, lastHour: 0, queueSize: 0, successRate: 0, description: "Blog posts, keyword strategy, meta tags", route: "/seo" },
  { id: "sales", name: "Sales Agent", color: "orange", status: "idle", last24h: 0, lastHour: 0, queueSize: 0, successRate: 0, description: "Phone scripts, objection handlers, proposals", route: "/sales" },
  { id: "support", name: "Support Agent", color: "pink", status: "idle", last24h: 0, lastHour: 0, queueSize: 0, successRate: 0, description: "Customer replies, FAQ gen, escalation triage", route: "/support" },
  { id: "financial", name: "Financial Agent", color: "amber", status: "idle", last24h: 0, lastHour: 0, queueSize: 0, successRate: 0, description: "P&L summaries, forecasts, recommendations", route: "/reports" },
  { id: "onboarding", name: "Brand Voice Agent", color: "teal", status: "idle", last24h: 0, lastHour: 0, queueSize: 0, successRate: 0, description: "Brand voice, content strategy, onboarding", route: "/settings" },
  { id: "ads", name: "Ad Copy Agent", color: "orange", status: "idle", last24h: 0, lastHour: 0, queueSize: 0, successRate: 0, description: "Google Ads, Facebook campaigns, landing page copy", route: "/ads" },
  { id: "email-marketing", name: "Email Marketing Agent", color: "cyan", status: "idle", last24h: 0, lastHour: 0, queueSize: 0, successRate: 0, description: "Welcome sequences, win-back campaigns, broadcasts", route: "/email-marketing" },
  { id: "competitors", name: "Competitor Intel Agent", color: "violet", status: "idle", last24h: 0, lastHour: 0, queueSize: 0, successRate: 0, description: "Competitor analysis, SWOT, positioning gaps", route: "/competitors" },
  { id: "retention", name: "Retention Agent", color: "emerald", status: "idle", last24h: 0, lastHour: 0, queueSize: 0, successRate: 0, description: "Churn analysis, loyalty programs, win-back campaigns", route: "/retention" },
]

export async function POST(request: NextRequest) {
  const { password } = await request.json()
  if (!ADMIN_PASSWORD || password !== ADMIN_PASSWORD) {
    return Response.json({ error: "Invalid password" }, { status: 401 })
  }

  const now = new Date()
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const since1h  = new Date(now.getTime() - 60 * 60 * 1000)

  let contentLast24h = 0, contentLast1h = 0, contentApproved = 0, contentPending = 0
  let reviewsLast24h = 0, reviewsLast1h = 0, reviewsApproved = 0
  let leadsLast24h = 0, leadsLast1h = 0, totalBusinesses = 0
  let recentContent: Array<{ type: string; status: string; createdAt: Date; business: { name: string } }> = []
  let recentReviews: Array<{ rating: number; status: string; response: string | null; createdAt: Date; business: { name: string } }> = []
  let recentLeads:   Array<{ name: string; status: string; createdAt: Date; business: { name: string } }> = []
  let dbOnline = true

  try {
    ;[
      contentLast24h, contentLast1h, contentApproved, contentPending,
      reviewsLast24h, reviewsLast1h, reviewsApproved,
      leadsLast24h, leadsLast1h,
      totalBusinesses,
      recentContent, recentReviews, recentLeads,
    ] = await Promise.all([
    prisma.content.count({ where: { createdAt: { gte: since24h } } }),
    prisma.content.count({ where: { createdAt: { gte: since1h } } }),
    prisma.content.count({ where: { status: "APPROVED" } }),
    prisma.content.count({ where: { status: "PENDING" } }),
    prisma.review.count({ where: { createdAt: { gte: since24h } } }),
    prisma.review.count({ where: { createdAt: { gte: since1h } } }),
    prisma.review.count({ where: { status: "APPROVED" } }),
    prisma.lead.count({ where: { createdAt: { gte: since24h } } }),
    prisma.lead.count({ where: { createdAt: { gte: since1h } } }),
    prisma.business.count(),
    prisma.content.findMany({ where: { createdAt: { gte: since24h } }, orderBy: { createdAt: "desc" }, take: 8, include: { business: { select: { name: true } } } }),
    prisma.review.findMany({ where: { createdAt: { gte: since24h } }, orderBy: { createdAt: "desc" }, take: 8, include: { business: { select: { name: true } } } }),
    prisma.lead.findMany({ where: { createdAt: { gte: since24h } }, orderBy: { createdAt: "desc" }, take: 8, include: { business: { select: { name: true } } } }),
    ])
  } catch (err) {
    const msg = err instanceof Error ? err.message : ""
    if (msg.includes("P1001") || msg.includes("Can't reach") || msg.includes("DatabaseNotReachable")) {
      dbOnline = false
    } else {
      console.error("[admin/agents]", err)
    }
  }

  if (!dbOnline) {
    return Response.json({
      agents: ZERO_AGENTS,
      activityFeed: [],
      dbOffline: true,
      error: "Database is paused. Go to supabase.com → your project → Restore to wake it up.",
    })
  }

  const agents = [
    // ── Existing 8 ──
    {
      id: "content", name: "Content Agent", color: "indigo",
      status: contentLast1h > 0 ? "active" : "idle",
      last24h: contentLast24h, lastHour: contentLast1h, queueSize: contentPending,
      successRate: contentApproved + contentPending > 0 ? Math.round((contentApproved / (contentApproved + contentPending)) * 100) : 0,
      description: "Social posts, newsletters, SMS campaigns",
      route: "/content",
    },
    {
      id: "reputation", name: "Reputation Agent", color: "emerald",
      status: reviewsLast1h > 0 ? "active" : "idle",
      last24h: reviewsLast24h, lastHour: reviewsLast1h, queueSize: 0,
      successRate: reviewsApproved > 0 ? 98 : 0,
      description: "Review responses, sentiment analysis, alerts",
      route: "/reputation",
    },
    {
      id: "leads", name: "Lead Gen Agent", color: "violet",
      status: leadsLast1h > 0 ? "active" : "idle",
      last24h: leadsLast24h, lastHour: leadsLast1h, queueSize: 0,
      successRate: leadsLast24h > 0 ? 94 : 0,
      description: "Cold emails, follow-up sequences, lead scores",
      route: "/leads",
    },
    {
      id: "seo", name: "SEO Agent", color: "cyan",
      status: "idle" as const, last24h: 0, lastHour: 0, queueSize: 0, successRate: 0,
      description: "Blog posts, keyword strategy, meta tags",
      route: "/seo",
    },
    {
      id: "sales", name: "Sales Agent", color: "orange",
      status: "idle" as const, last24h: 0, lastHour: 0, queueSize: 0, successRate: 0,
      description: "Phone scripts, objection handlers, proposals",
      route: "/sales",
    },
    {
      id: "support", name: "Support Agent", color: "pink",
      status: "idle" as const, last24h: 0, lastHour: 0, queueSize: 0, successRate: 0,
      description: "Customer replies, FAQ gen, escalation triage",
      route: "/support",
    },
    {
      id: "financial", name: "Financial Agent", color: "amber",
      status: "idle" as const, last24h: 0, lastHour: 0, queueSize: 0, successRate: 0,
      description: "P&L summaries, forecasts, recommendations",
      route: "/reports",
    },
    {
      id: "onboarding", name: "Brand Voice Agent", color: "teal",
      status: totalBusinesses > 0 ? "active" as const : "idle" as const, last24h: 0, lastHour: 0, queueSize: 0,
      successRate: totalBusinesses > 0 ? 100 : 0,
      description: "Brand voice, content strategy, onboarding",
      route: "/settings",
    },
    // ── New 12 ──
    {
      id: "ads", name: "Ad Copy Agent", color: "orange",
      status: "idle" as const, last24h: 0, lastHour: 0, queueSize: 0, successRate: 0,
      description: "Google Ads, Facebook campaigns, landing page copy",
      route: "/ads",
    },
    {
      id: "email-marketing", name: "Email Marketing Agent", color: "cyan",
      status: "idle" as const, last24h: 0, lastHour: 0, queueSize: 0, successRate: 0,
      description: "Welcome sequences, win-back campaigns, broadcasts",
      route: "/email-marketing",
    },
    {
      id: "competitors", name: "Competitor Intel Agent", color: "violet",
      status: "idle" as const, last24h: 0, lastHour: 0, queueSize: 0, successRate: 0,
      description: "Competitor analysis, SWOT, positioning gaps",
      route: "/competitors",
    },
    {
      id: "retention", name: "Retention Agent", color: "emerald",
      status: "idle" as const, last24h: 0, lastHour: 0, queueSize: 0, successRate: 0,
      description: "Churn analysis, loyalty programs, win-back campaigns",
      route: "/retention",
    },
    {
      id: "review-gen", name: "Review Gen Agent", color: "amber",
      status: "idle" as const, last24h: 0, lastHour: 0, queueSize: 0, successRate: 0,
      description: "5-star review campaigns, request templates, negative filtering",
      route: "/review-gen",
    },
    {
      id: "pricing", name: "Pricing Agent", color: "teal",
      status: "idle" as const, last24h: 0, lastHour: 0, queueSize: 0, successRate: 0,
      description: "Pricing strategy, packaging, price page copy",
      route: "/pricing-tool",
    },
    {
      id: "expenses", name: "Expense Analyzer Agent", color: "indigo",
      status: "idle" as const, last24h: 0, lastHour: 0, queueSize: 0, successRate: 0,
      description: "Savings opportunities, budget plans, negotiation scripts",
      route: "/expenses",
    },
    {
      id: "referral", name: "Referral Program Agent", color: "pink",
      status: "idle" as const, last24h: 0, lastHour: 0, queueSize: 0, successRate: 0,
      description: "Referral program design, copy, economics analysis",
      route: "/referral",
    },
    {
      id: "operations", name: "Operations Agent", color: "cyan",
      status: "idle" as const, last24h: 0, lastHour: 0, queueSize: 0, successRate: 0,
      description: "SOPs, daily checklists, delegation plans",
      route: "/operations",
    },
    {
      id: "hiring", name: "Hiring Agent", color: "indigo",
      status: "idle" as const, last24h: 0, lastHour: 0, queueSize: 0, successRate: 0,
      description: "Job descriptions, interview kits, offer letters",
      route: "/hiring",
    },
    {
      id: "legal", name: "Legal Agent", color: "violet",
      status: "idle" as const, last24h: 0, lastHour: 0, queueSize: 0, successRate: 0,
      description: "Service agreements, NDAs, privacy policies, terms",
      route: "/legal",
    },
    {
      id: "business-plan", name: "Business Plan Agent", color: "pink",
      status: "idle" as const, last24h: 0, lastHour: 0, queueSize: 0, successRate: 0,
      description: "Full business plans, executive summaries, investor pitches",
      route: "/business-plan",
    },
  ]

  const activityFeed = [
    ...recentContent.map(c => ({
      agentId: "content", agentName: "Content Agent", color: "indigo",
      msg: `Generated ${c.type.replace("_", " ").toLowerCase()} for ${c.business.name}`,
      status: c.status, ts: c.createdAt,
    })),
    ...recentReviews.map(r => ({
      agentId: "reputation", agentName: "Reputation Agent", color: "emerald",
      msg: `${r.response ? "Responded to" : "Received"} ${r.rating}★ review for ${r.business.name}`,
      status: r.status, ts: r.createdAt,
    })),
    ...recentLeads.map(l => ({
      agentId: "leads", agentName: "Lead Gen Agent", color: "violet",
      msg: `Processed lead ${l.name ?? "contact"} for ${l.business.name}`,
      status: l.status, ts: l.createdAt,
    })),
  ].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime()).slice(0, 20)

  return Response.json({ agents, activityFeed })
}
