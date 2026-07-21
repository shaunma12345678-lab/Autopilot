// Finance store — server-side I/O between the pure engines (ingest /
// categorize / books) and Postgres. Bulk writes go through the admin client
// (one upsert per batch, hash-deduped) so a 2,000-row statement imports in
// one round trip, not 2,000. Server-only. Best-effort — errors surface as
// counts, never crashes.

import { prisma } from "@/lib/prisma"
import { getAdminClient } from "@/lib/supabase/admin"
import { resolveLearningBusinessId } from "@/lib/learning-store"
import { parseStatement, txnHash, type ParseResult } from "@/lib/finance/ingest"
import { normalizeMerchant, detectRecurring, markTransfers, type RecurringStream } from "@/lib/finance/categorize"
import { categorizeBatch } from "@/lib/finance/categorize-ai"
import { summarizeBooks, type FinanceSummary } from "@/lib/finance/books"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const P = () => prisma as any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const txnTable = () => (getAdminClient() as any).from("FinanceTxn")

export interface FinanceAccountRow {
  id: string; businessId: string; name: string; institution: string | null
  kind: string; currency: string; balance: number | null; balanceAt: string | null
}

export interface FinanceTxnRow {
  id: string; accountId: string; businessId: string; date: string; amount: number
  name: string; merchant: string; category: string; catConfidence: number
  catSource: string; recurring: boolean; transfer: boolean; source: string; hash: string
}

export async function bizId(): Promise<string | null> {
  return resolveLearningBusinessId()
}

export async function listAccounts(businessId: string): Promise<FinanceAccountRow[]> {
  return await P().financeAccount.findMany({ where: { businessId }, orderBy: { createdAt: "asc" }, take: 50 }).catch(() => []) as FinanceAccountRow[]
}

export async function ensureAccount(businessId: string, name: string, kind = "checking", institution?: string): Promise<FinanceAccountRow> {
  const existing = (await listAccounts(businessId)).find((a) => a.name.toLowerCase() === name.toLowerCase())
  if (existing) return existing
  const row = {
    id: crypto.randomUUID(), businessId, name: name.slice(0, 80), institution: institution?.slice(0, 80) ?? null,
    kind, currency: "USD", balance: null, balanceAt: null,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  }
  await P().financeAccount.create({ data: row }).catch(() => null)
  return row as FinanceAccountRow
}

export async function setBalance(businessId: string, accountId: string, balance: number): Promise<void> {
  await P().financeAccount.update({
    where: { id: accountId, businessId },
    data: { balance, balanceAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  }).catch(() => null)
}

async function loadRules(businessId: string): Promise<Map<string, string>> {
  const rows = await P().financeRule.findMany({ where: { businessId }, take: 500 }).catch(() => []) as Array<{ merchant: string; category: string }>
  return new Map(rows.map((r) => [r.merchant.toLowerCase(), r.category]))
}

export interface ImportOutcome {
  format: ParseResult["format"]
  parsed: number
  skipped: number
  inserted: number
  duplicates: number
  categorized: { rule: number; builtin: number; keyword: number; ai: number; none: number }
}

// Statement text in → parsed, enriched, hash-deduped rows in Postgres.
export async function importStatement(businessId: string, accountId: string, text: string, fileName?: string): Promise<ImportOutcome> {
  const parsed = parseStatement(text, fileName)
  const outcome: ImportOutcome = {
    format: parsed.format, parsed: parsed.transactions.length, skipped: parsed.skipped,
    inserted: 0, duplicates: 0, categorized: { rule: 0, builtin: 0, keyword: 0, ai: 0, none: 0 },
  }
  if (!parsed.transactions.length) return outcome

  const rules = await loadRules(businessId)
  const inputs = parsed.transactions.map((t) => ({ merchant: normalizeMerchant(t.name), name: t.name, amount: t.amount }))
  const cats = await categorizeBatch(inputs, rules)

  const rows = parsed.transactions.map((t, i) => ({
    id: crypto.randomUUID(), accountId, businessId,
    date: t.date, amount: t.amount, name: t.name, merchant: inputs[i].merchant,
    category: cats[i].category, catConfidence: cats[i].confidence,
    catSource: cats[i].source, recurring: false, transfer: false,
    source: parsed.format === "unknown" ? "csv" : parsed.format,
    hash: txnHash(accountId, t), meta: null, createdAt: new Date().toISOString(),
  }))
  for (const c of cats) outcome.categorized[c.source === "none" ? "none" : c.source]++

  // Bulk insert, hash-deduped: ignoreDuplicates keeps re-uploads harmless.
  const before = await txnCount(businessId)
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await txnTable().upsert(rows.slice(i, i + 500), { onConflict: "hash", ignoreDuplicates: true })
    if (error) break
  }
  const after = await txnCount(businessId)
  outcome.inserted = Math.max(0, after - before)
  outcome.duplicates = rows.length - outcome.inserted

  await refreshDerived(businessId)
  return outcome
}

async function txnCount(businessId: string): Promise<number> {
  const { count } = await txnTable().select("id", { count: "exact", head: true }).eq("businessId", businessId)
  return count ?? 0
}

export async function listTxns(businessId: string, limit = 2000): Promise<FinanceTxnRow[]> {
  return await P().financeTxn.findMany({ where: { businessId }, orderBy: { date: "desc" }, take: limit }).catch(() => []) as FinanceTxnRow[]
}

// Re-derive transfer + recurring marks across the whole book (cheap: one read,
// targeted writes only where a mark changed).
export async function refreshDerived(businessId: string): Promise<void> {
  const txns = await listTxns(businessId)
  const work = txns.map((t) => ({ ...t, wasTransfer: t.transfer, wasRecurring: t.recurring }))
  for (const t of work) t.transfer = false
  markTransfers(work)
  const streams = detectRecurring(work.filter((t) => !t.transfer))
  const recurringMerchants = new Set(streams.map((s) => s.merchant.toLowerCase()))
  for (const t of work) t.recurring = recurringMerchants.has(t.merchant.toLowerCase())
  const changed = work.filter((t) => t.transfer !== t.wasTransfer || t.recurring !== t.wasRecurring)
  for (let i = 0; i < changed.length; i += 200) {
    await Promise.all(changed.slice(i, i + 200).map((t) =>
      P().financeTxn.update({ where: { id: t.id }, data: { transfer: t.transfer, recurring: t.recurring } }).catch(() => null)
    ))
  }
}

// User correction → permanent vendor rule + retroactive recategorization.
export async function learnRule(businessId: string, merchant: string, category: string): Promise<number> {
  const norm = merchant.trim()
  if (!norm) return 0
  await P().financeRule.upsert({
    where: { businessId, merchant: norm },
    create: { id: crypto.randomUUID(), businessId, merchant: norm, category, createdAt: new Date().toISOString() },
    update: { category },
  }).catch(async () => {
    // Wrapper may not support compound-unique upsert — do it manually.
    const existing = await P().financeRule.findFirst({ where: { businessId, merchant: norm } }).catch(() => null)
    if (existing) await P().financeRule.update({ where: { id: existing.id }, data: { category } }).catch(() => null)
    else await P().financeRule.create({ data: { id: crypto.randomUUID(), businessId, merchant: norm, category, createdAt: new Date().toISOString() } }).catch(() => null)
  })
  // Retroactive: every past txn from this merchant follows the correction.
  const { data } = await txnTable().update({ category, catConfidence: 1, catSource: "user" })
    .eq("businessId", businessId).eq("merchant", norm).select("id")
  return Array.isArray(data) ? data.length : 0
}

export async function buildSummary(businessId: string): Promise<FinanceSummary & { accounts: FinanceAccountRow[]; recurring: RecurringStream[] }> {
  const [txns, accounts] = await Promise.all([listTxns(businessId), listAccounts(businessId)])
  const nonTransfer = txns.filter((t) => !t.transfer)
  const recurring = detectRecurring(nonTransfer)
  const known = accounts.filter((a) => a.balance != null)
  const balances = known.length ? known.reduce((s, a) => s + (a.balance ?? 0), 0) : null
  const summary = summarizeBooks(txns, { balances, recurring })
  return { ...summary, accounts, recurring }
}
