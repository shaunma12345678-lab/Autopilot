import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { generateReviewResponse } from "@/lib/agents/reputation-agent"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const { reviewId, businessId } = body

    const review = await prisma.review.findFirst({
      where: { id: reviewId },
      include: { business: true },
    })
    if (!review || review.business.userId !== user.id) {
      return Response.json({ error: "Review not found" }, { status: 404 })
    }

    const brandVoice = review.business.brandVoice as Record<string, unknown>
    const response = await generateReviewResponse({
      businessName: review.business.name,
      brandVoice,
      rating: review.rating,
      reviewText: review.reviewText,
      reviewerName: review.reviewerName,
    })

    const updated = await prisma.review.update({
      where: { id: reviewId },
      data: { response, status: review.rating >= 4 ? "APPROVED" : "PENDING" },
    })

    return Response.json({ review: updated })
  } catch (err) {
    console.error("[reputation-agent]", err)
    return Response.json({ error: "Failed to generate response" }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const businessId = searchParams.get("businessId")
    if (!businessId) return Response.json({ error: "businessId required" }, { status: 400 })

    const business = await prisma.business.findFirst({
      where: { id: businessId, userId: user.id },
    })
    if (!business) return Response.json({ error: "Not found" }, { status: 404 })

    const reviews = await prisma.review.findMany({
      where: { businessId },
      orderBy: { createdAt: "desc" },
    })

    return Response.json({ reviews })
  } catch (err) {
    console.error("[reputation-agent GET]", err)
    return Response.json({ error: "Failed to fetch reviews" }, { status: 500 })
  }
}
