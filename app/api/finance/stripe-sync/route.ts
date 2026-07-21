// Pull Stripe balance transactions into the books — gross sales, exact fees,
// refunds, payouts. Data Plaid can't see from the bank side.

export const maxDuration = 120

import { NextRequest } from "next/server"
import { financeAuth } from "../_shared"
import { bizId } from "@/lib/finance/store"
import { syncStripe } from "@/lib/finance/stripe-sync"

export async function POST(request: NextRequest) {
  if (!(await financeAuth(request))) return Response.json({ error: "Unauthorized" }, { status: 401 })
  try {
    const businessId = await bizId()
    if (!businessId) return Response.json({ error: "No business context" }, { status: 500 })
    const result = await syncStripe(businessId)
    return Response.json(result)
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Stripe sync failed" }, { status: 500 })
  }
}
