import { createSupabaseServerClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

    const business = await prisma.business.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
    })

    return Response.json({ business: business ?? null })
  } catch (err) {
    console.error("[businesses/current]", err)
    return Response.json({ error: "Failed to fetch business" }, { status: 500 })
  }
}
