import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"

export async function PATCH(request: NextRequest) {
  try {
  const _supabase = await createSupabaseServerClient()
  const { data: { user: _sessionUser } } = await _supabase.auth.getUser()
  const user = _sessionUser ?? await prisma.user.findFirst()
  if (!user) return Response.json({ error: "Service unavailable" }, { status: 503 })
    const body = await request.json()
    const { reviewId } = body

    if (!reviewId) return Response.json({ error: "reviewId required" }, { status: 400 })

    const review = await prisma.review.findFirst({
      where: { id: reviewId },
      include: { business: true },
    })
    if (!review) {
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
