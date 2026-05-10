import { createSupabaseServerClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import SettingsForm from "@/components/dashboard/SettingsForm"

export default async function SettingsPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const business = await prisma.business.findFirst({ where: { userId: user.id } })
  if (!business) redirect("/onboarding")

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-gray-400 mt-1">Manage your business profile and agent preferences</p>
      </div>
      <SettingsForm business={business} />
    </div>
  )
}
