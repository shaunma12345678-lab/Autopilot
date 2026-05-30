import { runAgent } from "@/lib/claude"

interface StripeData {
  charges: unknown[]
  subscriptions: unknown[]
  balance: unknown
}

async function fetchStripe(endpoint: string, secretKey: string) {
  const res = await fetch(`https://api.stripe.com/v1${endpoint}`, {
    headers: { Authorization: `Basic ${Buffer.from(secretKey + ":").toString("base64")}` },
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error?.message ?? `Stripe API error ${res.status}`)
  }
  return res.json()
}

export async function fetchStripeData(secretKey: string): Promise<StripeData> {
  const thirtyDaysAgo = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60
  const [charges, subscriptions, balance] = await Promise.all([
    fetchStripe(`/charges?limit=100&created[gte]=${thirtyDaysAgo}`, secretKey),
    fetchStripe("/subscriptions?limit=100&status=all", secretKey),
    fetchStripe("/balance", secretKey),
  ])
  return { charges: charges.data, subscriptions: subscriptions.data, balance }
}

export async function analyzeStripeData(data: StripeData) {
  const system = `You are a SaaS financial analyst. Analyze Stripe data and surface the most important insights. Return valid JSON only.`

  const charges = data.charges as Array<Record<string, unknown>>
  const subs = data.subscriptions as Array<Record<string, unknown>>
  const totalRevenue = charges.filter(c => c.paid).reduce((s, c) => s + (c.amount as number), 0) / 100
  const activeSubscriptions = subs.filter(s => s.status === "active").length
  const cancelledSubscriptions = subs.filter(s => s.status === "canceled").length
  const failedCharges = charges.filter(c => !c.paid).length
  const avgChargeAmount = charges.length > 0 ? totalRevenue / charges.length : 0

  const user = `Stripe data summary (last 30 days):
- Total revenue: $${totalRevenue.toFixed(2)}
- Total charges: ${charges.length} (${failedCharges} failed)
- Active subscriptions: ${activeSubscriptions}
- Cancelled subscriptions (all time): ${cancelledSubscriptions}
- Average charge: $${avgChargeAmount.toFixed(2)}
- Balance object: ${JSON.stringify(data.balance)}

Return JSON: {
  "headline": "one-line summary of business health",
  "mrr": 0,
  "arr": 0,
  "churnRate": 0,
  "failedPaymentRate": 0,
  "avgRevenuePerCustomer": 0,
  "healthScore": 0,
  "topInsights": ["insight1","insight2","insight3"],
  "urgentActions": ["action1","action2"],
  "growthOpportunities": ["opp1","opp2"]
}`
  return runAgent(system, user, { jsonMode: true })
}
