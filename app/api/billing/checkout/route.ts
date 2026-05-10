import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { stripe, STRIPE_PRICE_IDS } from "@/lib/stripe"
import { prisma } from "@/lib/prisma"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

    const { plan } = await request.json()
    const priceId = STRIPE_PRICE_IDS[plan]
    if (!priceId) return Response.json({ error: "Invalid plan" }, { status: 400 })

    const dbUser = await prisma.user.findUnique({ where: { id: user.id } })
    if (!dbUser) return Response.json({ error: "User not found" }, { status: 404 })

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      customer_email: dbUser.email,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing?success=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing`,
      metadata: { userId: user.id, plan },
    })

    return Response.json({ url: session.url })
  } catch (err) {
    console.error("[billing-checkout]", err)
    return Response.json({ error: "Failed to create checkout session" }, { status: 500 })
  }
}
