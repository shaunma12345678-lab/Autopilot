import { getSessionOrAdminUser } from "@/lib/auth-helper"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"

export default async function ReportsPage() {
  const user = await getSessionOrAdminUser()
  if (!user) redirect("/onboarding")

  const business = await prisma.business.findFirst({ where: { userId: user.id } })
  if (!business) redirect("/onboarding")

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const [contentTotal, reviewsTotal, leadsTotal, leadsConverted, reports, avgRating] = await Promise.all([
    prisma.content.count({ where: { businessId: business.id, createdAt: { gte: startOfMonth } } }),
    prisma.review.count({ where: { businessId: business.id, createdAt: { gte: startOfMonth } } }),
    prisma.lead.count({ where: { businessId: business.id, createdAt: { gte: startOfMonth } } }),
    prisma.lead.count({ where: { businessId: business.id, status: "CONVERTED", createdAt: { gte: startOfMonth } } }),
    prisma.report.findMany({
      where: { businessId: business.id },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
    prisma.review.aggregate({
      where: { businessId: business.id },
      _avg: { rating: true },
    }),
  ])

  const conversionRate = leadsTotal > 0 ? ((leadsConverted / leadsTotal) * 100).toFixed(0) : "0"

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="text-gray-400 mt-1">Monthly performance overview for {business.name}</p>
      </div>

      {/* Month Summary */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: "Content Created", value: contentTotal, color: "text-indigo-400" },
          { label: "Reviews Received", value: reviewsTotal, color: "text-amber-400" },
          { label: "Avg Rating", value: avgRating._avg.rating?.toFixed(1) ?? "—", color: "text-amber-400" },
          { label: "Lead Conversion", value: `${conversionRate}%`, color: "text-emerald-400" },
        ].map(m => (
          <div key={m.label} className="bg-gray-900 border border-gray-800 rounded-xl p-5 text-center">
            <p className={`text-3xl font-bold ${m.color}`}>{m.value}</p>
            <p className="text-sm text-gray-400 mt-1">{m.label}</p>
            <p className="text-xs text-gray-600 mt-0.5">This month</p>
          </div>
        ))}
      </div>

      {/* Reports History */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h2 className="font-semibold mb-4">Report History</h2>
        {reports.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-gray-500 text-sm">Monthly reports will appear here after your first month</p>
          </div>
        ) : (
          <div className="space-y-3">
            {reports.map((r: { id: string; type: string; createdAt: Date; summary: string }) => (
              <div key={r.id} className="flex items-center justify-between border border-gray-800 rounded-lg px-4 py-3">
                <div>
                  <p className="font-medium text-sm">{r.type} Report</p>
                  <p className="text-xs text-gray-500 mt-0.5">{new Date(r.createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" })}</p>
                </div>
                <p className="text-sm text-gray-400 max-w-xs truncate">{r.summary}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
