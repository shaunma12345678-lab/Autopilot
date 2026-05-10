import { createSupabaseServerClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import ContentManager from "@/components/dashboard/ContentManager"

export default async function ContentPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const business = await prisma.business.findFirst({ where: { userId: user.id } })
  if (!business) redirect("/onboarding")

  const content = await prisma.content.findMany({
    where: { businessId: business.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  })

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Content</h1>
        <p className="text-gray-400 mt-1">Review and manage your AI-generated content</p>
      </div>
      <ContentManager initialContent={content} businessId={business.id} />
    </div>
  )
}
