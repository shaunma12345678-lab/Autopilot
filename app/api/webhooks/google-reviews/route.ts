import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { generateReviewResponse } from "@/lib/agents/reputation-agent"
import { sendReviewAlertEmail } from "@/lib/email"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { businessId, review } = body

    if (!businessId || !review) {
      return Response.json({ error: "Missing fields" }, { status: 400 })
    }

    const business = await prisma.business.findUnique({
      where: { id: businessId },
      include: { user: true },
    })
    if (!business) return Response.json({ error: "Business not found" }, { status: 404 })

    const brandVoice = business.brandVoice as Record<string, unknown>
    const response = await generateReviewResponse({
      businessName: business.name,
      brandVoice,
      rating: review.rating,
      reviewText: review.text,
      reviewerName: review.reviewerName,
    })

    const autoApprove = review.rating >= 4
    const created = await prisma.review.create({
      data: {
        businessId,
        platform: "Google",
        rating: review.rating,
        reviewText: review.text,
        reviewerName: review.reviewerName,
        response,
        status: autoApprove ? "APPROVED" : "PENDING",
      },
    })

    if (review.rating <= 3) {
      await sendReviewAlertEmail(
        business.user.email,
        business.name,
        review.rating,
        review.reviewerName
      ).catch(() => {})
    }

    return Response.json({ review: created })
  } catch (err) {
    console.error("[google-reviews-webhook]", err)
    return Response.json({ error: "Failed to process review" }, { status: 500 })
  }
}
