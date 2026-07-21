// Native Stripe sync — data Plaid literally cannot see (Plaid watches the bank
// account the payout LANDS in; we read the gross charges, exact fees, and
// refunds inside Stripe itself). Balance transactions in → enriched FinanceTxn
// rows: gross as income, fees as processing fees, refunds/payouts labeled.
// Server-only, key-gated, graceful when Stripe isn't configured.

import { getAdminClient } from "@/lib/supabase/admin"
import { ensureAccount, refreshDerived } from "@/lib/finance/store"
import { txnHash } from "@/lib/finance/ingest"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const txnTable = () => (getAdminClient() as any).from("FinanceTxn")

export async function syncStripe(businessId: string, days = 90): Promise<{ ok: boolean; imported: number; note: string }> {
  if (!process.env.STRIPE_SECRET_KEY) return { ok: false, imported: 0, note: "STRIPE_SECRET_KEY not set — Stripe sync is off." }
  try {
    const { stripe } = await import("@/lib/stripe")
    const account = await ensureAccount(businessId, "Stripe", "stripe", "Stripe")
    const since = Math.floor(Date.now() / 1000) - days * 86400

    const rows: Array<Record<string, unknown>> = []
    let startingAfter: string | undefined
    for (let page = 0; page < 5; page++) {
      const batch = await stripe.balanceTransactions.list({ limit: 100, created: { gte: since }, ...(startingAfter ? { starting_after: startingAfter } : {}) })
      for (const bt of batch.data) {
        const date = new Date(bt.created * 1000).toISOString().slice(0, 10)
        const gross = bt.amount / 100
        const fee = bt.fee / 100
        const desc = bt.description ?? bt.type
        const base = { accountId: account.id, businessId, source: "stripe", recurring: false, transfer: false, meta: null, createdAt: new Date().toISOString() }
        const isPayout = bt.type === "payout" || bt.type === "transfer"
        const isRefund = bt.type.includes("refund") || bt.type === "adjustment"
        rows.push({
          ...base, id: crypto.randomUUID(), date, amount: gross,
          name: `Stripe ${bt.type}: ${desc}`.slice(0, 200),
          merchant: isPayout ? "Stripe Payout" : isRefund ? "Stripe Refund" : "Stripe Sales",
          category: isPayout ? "transfer" : isRefund ? "refund" : gross >= 0 ? "income" : "other",
          catConfidence: 0.95, catSource: "builtin",
          hash: txnHash(account.id, { date, amount: gross, name: desc, fitId: bt.id }),
        })
        if (fee > 0) {
          rows.push({
            ...base, id: crypto.randomUUID(), date, amount: -fee,
            name: `Stripe fee on ${bt.id}`.slice(0, 200), merchant: "Stripe Fees",
            category: "fees-processing", catConfidence: 1, catSource: "builtin",
            hash: txnHash(account.id, { date, amount: -fee, name: `fee ${bt.id}`, fitId: `${bt.id}-fee` }),
          })
        }
      }
      if (!batch.has_more || batch.data.length === 0) break
      startingAfter = batch.data[batch.data.length - 1].id
    }

    let inserted = 0
    for (let i = 0; i < rows.length; i += 500) {
      const { error, data } = await txnTable().upsert(rows.slice(i, i + 500), { onConflict: "hash", ignoreDuplicates: true }).select("id")
      if (error) break
      inserted += Array.isArray(data) ? data.length : 0
    }
    await refreshDerived(businessId)
    return { ok: true, imported: inserted, note: rows.length ? `${inserted} new of ${rows.length} Stripe entries (${days}d window) — gross sales, exact fees, refunds, payouts.` : "No Stripe activity in the window." }
  } catch (err) {
    return { ok: false, imported: 0, note: err instanceof Error ? err.message : "Stripe sync failed" }
  }
}
