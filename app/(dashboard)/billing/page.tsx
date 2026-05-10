import { createSupabaseServerClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import BillingManager from "@/components/dashboard/BillingManager"

export default async function BillingPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const dbUser = await prisma.user.findUnique({ where: { id: user.id } })
  if (!dbUser) redirect("/login")

  const business = await prisma.business.findFirst({ where: { userId: user.id } })
  if (!business) redirect("/onboarding")

  const [contentCount, reviewCount] = await Promise.all([
    prisma.content.count({ where: { businessId: business.id } }),
    prisma.review.count({ where: { businessId: business.id } }),
  ])

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Billing</h1>
        <p className="text-gray-400 mt-1">Manage your plan and billing</p>
      </div>
      <BillingManager
        currentPlan={dbUser.plan}
        hasStripeId={!!dbUser.stripeId}
        usage={{ content: contentCount, reviews: reviewCount }}
      />
    </div>
  )
}
