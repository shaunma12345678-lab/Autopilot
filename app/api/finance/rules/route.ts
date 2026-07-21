// Category correction → permanent vendor rule + retroactive recategorization.
// This is how the engine gets smarter than any static categorizer: every
// correction is remembered forever and applied to the vendor's whole history.

export const maxDuration = 30

import { NextRequest } from "next/server"
import { financeAuth } from "../_shared"
import { bizId, learnRule } from "@/lib/finance/store"
import { CATEGORY_KEYS } from "@/lib/finance/categorize"

export async function POST(request: NextRequest) {
  if (!(await financeAuth(request))) return Response.json({ error: "Unauthorized" }, { status: 401 })
  let body: { merchant?: string; category?: string }
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }) }
  const merchant = (body.merchant ?? "").trim()
  const category = (body.category ?? "").trim()
  if (!merchant || !CATEGORY_KEYS.has(category)) return Response.json({ error: "merchant and a valid category are required" }, { status: 400 })
  try {
    const businessId = await bizId()
    if (!businessId) return Response.json({ error: "No business context" }, { status: 500 })
    const updated = await learnRule(businessId, merchant, category)
    return Response.json({ ok: true, updated })
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Rule save failed" }, { status: 500 })
  }
}
