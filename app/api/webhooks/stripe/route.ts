import { NextRequest } from "next/server"
import { stripe } from "@/lib/stripe"
import { prisma } from "@/lib/prisma"
import type Stripe from "stripe"

export async function POST(request: NextRequest) {
  const body = await request.text()
  const sig = request.headers.get("stripe-signature")

  if (!sig) return Response.json({ error: "No signature" }, { status: 400 })

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err) {
    console.error("[stripe-webhook] signature verification failed", err)
    return Response.json({ error: "Invalid signature" }, { status: 400 })
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session
        const userId = session.metadata?.userId
        const plan = session.metadata?.plan
        if (userId && plan) {
          await prisma.user.update({
            where: { id: userId },
            data: {
              stripeId: session.customer as string,
              plan: plan as
                | "FREE"
                | "STARTER"
                | "GROWTH"
                | "PRO"
                | "AGENCY_STARTER"
                | "AGENCY_GROWTH"
                | "AGENCY_PREMIUM"
                | "ENTERPRISE",
            },
          })
        }
        break
      }
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription
        const user = await prisma.user.findFirst({ where: { stripeId: sub.customer as string } })
        if (user) {
          const priceId = sub.items.data[0]?.price.id
          const planEntry = Object.entries({
            STARTER: process.env.STRIPE_PRICE_STARTER,
            GROWTH: process.env.STRIPE_PRICE_GROWTH,
            PRO: process.env.STRIPE_PRICE_PRO,
            AGENCY_STARTER: process.env.STRIPE_PRICE_AGENCY_STARTER,
            AGENCY_GROWTH: process.env.STRIPE_PRICE_AGENCY_GROWTH,
            AGENCY_PREMIUM: process.env.STRIPE_PRICE_AGENCY_PREMIUM,
          }).find(([, id]) => id === priceId)
          if (planEntry) {
            await prisma.user.update({
              where: { id: user.id },
              data: {
                plan: planEntry[0] as
                  | "STARTER"
                  | "GROWTH"
                  | "PRO"
                  | "AGENCY_STARTER"
                  | "AGENCY_GROWTH"
                  | "AGENCY_PREMIUM",
              },
            })
          }
        }
        break
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription
        const user = await prisma.user.findFirst({ where: { stripeId: sub.customer as string } })
        if (user) {
          await prisma.user.update({ where: { id: user.id }, data: { plan: "FREE" } })
        }
        break
      }
    }
  } catch (err) {
    console.error("[stripe-webhook] handler error", err)
    return Response.json({ error: "Handler failed" }, { status: 500 })
  }

  return Response.json({ received: true })
}
