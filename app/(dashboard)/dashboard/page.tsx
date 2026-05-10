import { createSupabaseServerClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import Link from "next/link"
import ContentApprovalQueue from "@/components/dashboard/ContentApprovalQueue"

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const business = await prisma.business.findFirst({ where: { userId: user.id } })
  if (!business) redirect("/onboarding")

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startOfWeek = new Date(now)
  startOfWeek.setDate(now.getDate() - now.getDay())

  const [contentThisMonth, reviewsThisWeek, leadsThisMonth, pendingContent, recentReviews, activeAgents] = await Promise.all([
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
      take: 3,
    }),
    Promise.resolve(business.activeAgents.length),
  ])

  const metrics = [
    { label: "Content Generated", value: contentThisMonth, sub: "this month", color: "bg-indigo-500" },
    { label: "Reviews Responded", value: reviewsThisWeek, sub: "this week", color: "bg-emerald-500" },
    { label: "New Leads", value: leadsThisMonth, sub: "this month", color: "bg-amber-500" },
    { label: "Active Agents", value: activeAgents, sub: "running now", color: "bg-violet-500" },
  ]

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-gray-400 mt-1">{business.name} — Here&apos;s what&apos;s happening</p>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {metrics.map((m) => (
          <div key={m.label} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className={`w-2 h-2 rounded-full ${m.color} mb-3`} />
            <p className="text-3xl font-bold">{m.value}</p>
            <p className="text-sm font-medium text-white mt-1">{m.label}</p>
            <p className="text-xs text-gray-500 mt-0.5">{m.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Content Queue */}
        <div className="col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Pending Approvals</h2>
            <Link href="/content" className="text-sm text-indigo-400 hover:text-indigo-300">View all</Link>
          </div>
          <ContentApprovalQueue initialContent={pendingContent} businessId={business.id} />
        </div>

        {/* Recent Reviews */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Recent Reviews</h2>
            <Link href="/reputation" className="text-sm text-indigo-400 hover:text-indigo-300">View all</Link>
          </div>
          {recentReviews.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">No reviews yet</p>
          ) : (
            <div className="space-y-3">
              {recentReviews.map((r: { id: string; reviewerName: string; rating: number; reviewText: string; status: string }) => (
                <div key={r.id} className="border border-gray-800 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">{r.reviewerName}</span>
                    <span className="text-amber-400 text-sm">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
                  </div>
                  <p className="text-xs text-gray-400 line-clamp-2">{r.reviewText}</p>
                  <span className={`inline-block text-xs px-2 py-0.5 rounded-full mt-2 ${
                    r.status === "APPROVED" ? "bg-emerald-900/40 text-emerald-400" :
                    r.status === "PENDING" ? "bg-amber-900/40 text-amber-400" :
                    "bg-gray-800 text-gray-400"
                  }`}>{r.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
