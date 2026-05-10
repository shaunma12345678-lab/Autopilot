import { createSupabaseServerClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import ReputationManager from "@/components/dashboard/ReputationManager"

export default async function ReputationPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const business = await prisma.business.findFirst({ where: { userId: user.id } })
  if (!business) redirect("/onboarding")

  const reviews = await prisma.review.findMany({
    where: { businessId: business.id },
    orderBy: { createdAt: "desc" },
  })

  const avgRating = reviews.length > 0
    ? (reviews.reduce((sum: number, r: { rating: number }) => sum + r.rating, 0) / reviews.length).toFixed(1)
    : "—"

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Reputation</h1>
          <p className="text-gray-400 mt-1">Monitor and respond to reviews across all platforms</p>
        </div>
        <div className="text-right">
          <p className="text-4xl font-bold text-amber-400">{avgRating}</p>
          <p className="text-xs text-gray-500 mt-0.5">{reviews.length} reviews total</p>
        </div>
      </div>
      <ReputationManager initialReviews={reviews} businessId={business.id} />
    </div>
  )
}
