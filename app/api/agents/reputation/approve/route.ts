import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const { reviewId } = body

    if (!reviewId) return Response.json({ error: "reviewId required" }, { status: 400 })

    const review = await prisma.review.findFirst({
      where: { id: reviewId },
      include: { business: true },
    })
    if (!review || review.business.userId !== user.id) {
      return Response.json({ error: "Not found" }, { status: 404 })
    }

    const updated = await prisma.review.update({
      where: { id: reviewId },
      data: { status: "APPROVED" },
    })

    return Response.json({ review: updated })
  } catch (err) {
    console.error("[reputation approve PATCH]", err)
    return Response.json({ error: "Failed to approve response" }, { status: 500 })
  }
}
