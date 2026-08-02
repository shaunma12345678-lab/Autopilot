import { createSupabaseServerClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import CREEarlyWarningDashboard from "@/components/dashboard/CREEarlyWarningDashboard"

export const metadata = {
  title: "Commercial Real Estate Leads | Autopilot",
}

export default async function CRELeadsPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const business = await prisma.business.findFirst({ where: { userId: user.id } })
  if (!business) redirect("/onboarding")

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Commercial Real Estate Distress Leads</h1>
        <p className="text-gray-400 mt-1 text-sm">
          CMBS special servicing, SBA loan defaults, LLC bankruptcies, UCC-1 liens, code violations, and
          vacancy signals — discovered automatically across San Diego, Riverside, San Bernardino, and
          Orange County commercial parcels.
        </p>
      </div>

      <CREEarlyWarningDashboard businessId={business.id} />
    </div>
  )
}
