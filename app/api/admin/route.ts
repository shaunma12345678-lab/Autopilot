import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "ap2026admin"

export async function POST(request: NextRequest) {
  const { password } = await request.json()
  if (password !== ADMIN_PASSWORD) {
    return Response.json({ error: "Invalid password" }, { status: 401 })
  }

  const [
    totalUsers,
    totalBusinesses,
    totalContent,
    totalReviews,
    totalLeads,
    recentUsers,
    recentBusinesses,
    contentByStatus,
    reviewsByRating,
    planDistribution,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.business.count(),
    prisma.content.count(),
    prisma.review.count(),
    prisma.lead.count(),
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, email: true, name: true, plan: true, createdAt: true },
    }),
    prisma.business.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        _count: { select: { content: true, reviews: true, leads: true } },
        user: { select: { email: true } },
      },
    }),
    prisma.content.groupBy({ by: ["status"], _count: true }),
    prisma.review.groupBy({ by: ["rating"], _count: true }),
    prisma.user.groupBy({ by: ["plan"], _count: true }),
  ])

  const approvedContent = contentByStatus.find(c => c.status === "APPROVED")?._count ?? 0
  const pendingContent  = contentByStatus.find(c => c.status === "PENDING")?._count ?? 0
  const avgRating = reviewsByRating.length
    ? (reviewsByRating.reduce((s, r) => s + r.rating * r._count, 0) / totalReviews).toFixed(1)
    : "0"

  return Response.json({
    stats: {
      totalUsers,
      totalBusinesses,
      totalContent,
      totalReviews,
      totalLeads,
      approvedContent,
      pendingContent,
      avgRating,
    },
    planDistribution,
    recentUsers,
    recentBusinesses,
  })
}
