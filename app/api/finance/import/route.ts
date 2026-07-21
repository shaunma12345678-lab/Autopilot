// Statement import: raw file text in (CSV / OFX / QFX / QIF — any bank's
// export), parsed + enriched + hash-deduped rows out. Optional balance sets
// the account's current balance for days-cash-on-hand.

export const maxDuration = 120

import { NextRequest } from "next/server"
import { financeAuth } from "../_shared"
import { bizId, ensureAccount, importStatement, setBalance } from "@/lib/finance/store"

export async function POST(request: NextRequest) {
  if (!(await financeAuth(request))) return Response.json({ error: "Unauthorized" }, { status: 401 })
  let body: { accountName?: string; kind?: string; fileText?: string; fileName?: string; balance?: number }
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }) }
  const text = (body.fileText ?? "").slice(0, 3_000_000)
  if (!text.trim()) return Response.json({ error: "fileText is required — paste or upload a statement export" }, { status: 400 })
  try {
    const businessId = await bizId()
    if (!businessId) return Response.json({ error: "No business context" }, { status: 500 })
    const account = await ensureAccount(businessId, (body.accountName ?? "Main account").trim() || "Main account", body.kind === "card" || body.kind === "savings" ? body.kind : "checking")
    const outcome = await importStatement(businessId, account.id, text, body.fileName)
    if (typeof body.balance === "number" && Number.isFinite(body.balance)) await setBalance(businessId, account.id, body.balance)
    return Response.json({ ok: true, account: { id: account.id, name: account.name }, ...outcome })
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Import failed" }, { status: 500 })
  }
}
