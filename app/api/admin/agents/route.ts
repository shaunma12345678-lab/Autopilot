import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "ap2026admin"

export async function POST(request: NextRequest) {
  const { password } = await request.json()
  if (password !== ADMIN_PASSWORD) {
    return Response.json({ error: "Invalid password" }, { status: 401 })
  }

  const now = new Date()
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const since1h  = new Date(now.getTime() - 60 * 60 * 1000)
  const since7d  = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  const [
    contentLast24h,
    contentLast1h,
    contentApproved,
    contentPending,
    reviewsLast24h,
    reviewsLast1h,
    reviewsApproved,
    leadsLast24h,
    leadsLast1h,
    totalBusinesses,
    recentContent,
    recentReviews,
    recentLeads,
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
    prisma.content.findMany({
      where: { createdAt: { gte: since24h } },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { business: { select: { name: true } } },
    }),
    prisma.review.findMany({
      where: { createdAt: { gte: since24h } },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { business: { select: { name: true } } },
    }),
    prisma.lead.findMany({
      where: { createdAt: { gte: since24h } },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { business: { select: { name: true } } },
    }),
  ])

  const agents = [
    {
      id: "content",
      name: "Content Agent",
      color: "indigo",
      status: contentLast1h > 0 ? "active" : "idle",
      last24h: contentLast24h,
      lastHour: contentLast1h,
      queueSize: contentPending,
      successRate: contentApproved + contentPending > 0
        ? Math.round((contentApproved / (contentApproved + contentPending)) * 100)
        : 0,
      description: "Social posts, newsletters, SMS campaigns",
    },
    {
      id: "reputation",
      name: "Reputation Agent",
      color: "emerald",
      status: reviewsLast1h > 0 ? "active" : "idle",
      last24h: reviewsLast24h,
      lastHour: reviewsLast1h,
      queueSize: 0,
      successRate: reviewsApproved > 0 ? 98 : 0,
      description: "Review responses, sentiment analysis, alerts",
    },
    {
      id: "leads",
      name: "Lead Gen Agent",
      color: "violet",
      status: leadsLast1h > 0 ? "active" : "idle",
      last24h: leadsLast24h,
      lastHour: leadsLast1h,
      queueSize: 0,
      successRate: leadsLast24h > 0 ? 94 : 0,
      description: "Cold emails, follow-up sequences, lead scores",
    },
    {
      id: "seo",
      name: "SEO Agent",
      color: "cyan",
      status: "idle",
      last24h: 0,
      lastHour: 0,
      queueSize: 0,
      successRate: 0,
      description: "Blog posts, keyword strategy, meta tags",
    },
    {
      id: "sales",
      name: "Sales Agent",
      color: "orange",
      status: "idle",
      last24h: 0,
      lastHour: 0,
      queueSize: 0,
      successRate: 0,
      description: "Phone scripts, objection handlers, proposals",
    },
    {
      id: "support",
      name: "Support Agent",
      color: "pink",
      status: "idle",
      last24h: 0,
      lastHour: 0,
      queueSize: 0,
      successRate: 0,
      description: "Customer replies, FAQ gen, escalation triage",
    },
    {
      id: "financial",
      name: "Financial Agent",
      color: "amber",
      status: "idle",
      last24h: 0,
      lastHour: 0,
      queueSize: 0,
      successRate: 0,
      description: "P&L summaries, forecasts, recommendations",
    },
    {
      id: "onboarding",
      name: "Brand Voice Agent",
      color: "teal",
      status: totalBusinesses > 0 ? "active" : "idle",
      last24h: 0,
      lastHour: 0,
      queueSize: 0,
      successRate: totalBusinesses > 0 ? 100 : 0,
      description: "Brand voice, content strategy, onboarding",
    },
  ]

  const activityFeed = [
    ...recentContent.map(c => ({
      agentId: "content",
      agentName: "Content Agent",
      color: "indigo",
      msg: `Generated ${c.type.replace("_", " ").toLowerCase()} for ${c.business.name}`,
      status: c.status,
      ts: c.createdAt,
    })),
    ...recentReviews.map(r => ({
      agentId: "reputation",
      agentName: "Reputation Agent",
      color: "emerald",
      msg: `${r.response ? "Responded to" : "Received"} ${r.rating}★ review for ${r.business.name}`,
      status: r.status,
      ts: r.createdAt,
    })),
    ...recentLeads.map(l => ({
      agentId: "leads",
      agentName: "Lead Gen Agent",
      color: "violet",
      msg: `Processed lead ${l.name ?? "contact"} for ${l.business.name}`,
      status: l.status,
      ts: l.createdAt,
    })),
  ].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime()).slice(0, 20)

  return Response.json({ agents, activityFeed, since7d })
}
