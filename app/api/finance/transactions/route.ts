// Transactions list (most recent first), capped for the UI table.

export const maxDuration = 30

import { NextRequest } from "next/server"
import { financeAuth } from "../_shared"
import { bizId, listTxns } from "@/lib/finance/store"

export async function GET(request: NextRequest) {
  if (!(await financeAuth(request))) return Response.json({ error: "Unauthorized" }, { status: 401 })
  try {
    const businessId = await bizId()
    if (!businessId) return Response.json({ error: "No business context" }, { status: 500 })
    const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get("limit")) || 200, 20), 1000)
    const txns = await listTxns(businessId, limit)
    return Response.json({ transactions: txns })
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 })
  }
}
