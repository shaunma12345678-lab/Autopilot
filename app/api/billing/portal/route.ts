import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { stripe } from "@/lib/stripe"
import { prisma } from "@/lib/prisma"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

    const dbUser = await prisma.user.findUnique({ where: { id: user.id } })
    if (!dbUser?.stripeId) {
      return Response.json({ error: "No active subscription" }, { status: 400 })
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: dbUser.stripeId,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing`,
    })

    return Response.json({ url: session.url })
  } catch (err) {
    console.error("[billing-portal]", err)
    return Response.json({ error: "Failed to create portal session" }, { status: 500 })
  }
}
