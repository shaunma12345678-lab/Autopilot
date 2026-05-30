import { NextRequest } from "next/server"
import { fetchStripeData, analyzeStripeData } from "@/lib/agents/stripe-agent"

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { action, ...params } = body

  try {
    if (action === "analyze") {
      const { stripeKey } = params as { stripeKey: string }
      if (!stripeKey || !stripeKey.startsWith("sk_")) {
        return Response.json({ error: "Invalid Stripe key. Must start with sk_" }, { status: 400 })
      }
      const data = await fetchStripeData(stripeKey)
      const analysis = await analyzeStripeData(data)

      // Compute raw summary stats for display
      const charges = data.charges as Array<Record<string, unknown>>
      const subs = data.subscriptions as Array<Record<string, unknown>>
      const totalRevenue = charges.filter(c => c.paid).reduce((s, c) => s + (c.amount as number), 0) / 100
      const failedCharges = charges.filter(c => !c.paid).length
      const activeSubscriptions = subs.filter(s => s.status === "active").length
      const cancelledSubscriptions = subs.filter(s => s.status === "canceled").length

      return Response.json({
        analysis,
        stats: {
          totalRevenue: totalRevenue.toFixed(2),
          totalCharges: charges.length,
          failedCharges,
          activeSubscriptions,
          cancelledSubscriptions,
        },
      })
    }

    return Response.json({ error: "Unknown action" }, { status: 400 })
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    )
  }
}
