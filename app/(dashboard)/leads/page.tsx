import { createSupabaseServerClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import LeadsPipeline from "@/components/dashboard/LeadsPipeline"

export default async function LeadsPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const business = await prisma.business.findFirst({ where: { userId: user.id } })
  if (!business) redirect("/onboarding")

  const leads = await prisma.lead.findMany({
    where: { businessId: business.id },
    orderBy: { createdAt: "desc" },
  })

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Leads</h1>
        <p className="text-gray-400 mt-1">Track and manage your prospect pipeline</p>
      </div>
      <LeadsPipeline initialLeads={leads} businessId={business.id} />
    </div>
  )
}
