// The accounting brain — the layer Plaid doesn't have at all. Deterministic
// math over enriched transactions: monthly P&L, burn rate, days cash on hand,
// anomaly detection (vs each vendor's own history), subscription roll-up with
// price-hike flags, deductible tracking, and a plain-language weekly briefing.
// Pure and synchronous. Transfers are excluded from P&L (moving your own money
// isn't income or expense — the #1 way naive tools inflate revenue).

import { CATEGORIES, type RecurringStream } from "@/lib/finance/categorize"

export interface BookTxn {
  date: string; amount: number; merchant: string; category: string
  transfer: boolean; catSource: string
}

export interface MonthRow { month: string; income: number; expenses: number; net: number }
export interface CategoryRow { category: string; label: string; emoji: string; thisMonth: number; lastMonth: number; deltaPct: number | null; deductible: boolean }
export interface Anomaly { merchant: string; date: string; amount: number; usual: number; ratio: number; note: string }

export interface FinanceSummary {
  cash: number | null              // sum of account balances (when known)
  income30: number
  expenses30: number
  net30: number
  burnRate: number                 // avg monthly net over trailing 3mo (negative = burning)
  daysCashOnHand: number | null
  months: MonthRow[]               // last 12, oldest first
  categories: CategoryRow[]        // this month vs last, by spend size
  anomalies: Anomaly[]
  subscriptions: { streams: RecurringStream[]; monthlyTotal: number }
  deductibleYtd: number
  uncategorizedPct: number
  briefing: string[]               // plain-language paragraphs
}

const monthOf = (d: string) => d.slice(0, 7)
const round2 = (n: number) => Math.round(n * 100) / 100

export function summarizeBooks(
  txns: BookTxn[],
  opts: { balances?: number | null; recurring?: RecurringStream[]; now?: Date },
): FinanceSummary {
  const now = opts.now ?? new Date()
  const today = now.toISOString().slice(0, 10)
  const real = txns.filter((t) => !t.transfer && t.category !== "transfer")

  // ── Monthly series, last 12 ──
  const monthKeys: string[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    monthKeys.push(d.toISOString().slice(0, 7))
  }
  const byMonth = new Map<string, { inc: number; exp: number }>(monthKeys.map((m) => [m, { inc: 0, exp: 0 }]))
  for (const t of real) {
    const m = byMonth.get(monthOf(t.date))
    if (!m) continue
    if (t.amount > 0) m.inc += t.amount
    else m.exp += -t.amount
  }
  const months: MonthRow[] = monthKeys.map((m) => {
    const v = byMonth.get(m)!
    return { month: m, income: round2(v.inc), expenses: round2(v.exp), net: round2(v.inc - v.exp) }
  })

  // ── Trailing 30 days ──
  const d30 = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10)
  let income30 = 0, expenses30 = 0
  for (const t of real) {
    if (t.date < d30 || t.date > today) continue
    if (t.amount > 0) income30 += t.amount
    else expenses30 += -t.amount
  }

  // ── Burn + runway (use COMPLETE months — the current partial month lies) ──
  const complete = months.slice(-4, -1)
  const burnRate = complete.length ? round2(complete.reduce((s, m) => s + m.net, 0) / complete.length) : 0
  const cash = opts.balances ?? null
  const dailyBurn = burnRate < 0 ? -burnRate / 30.4 : 0
  const daysCashOnHand = cash != null && dailyBurn > 0 ? Math.round(cash / dailyBurn) : null

  // ── Category table: this month vs last ──
  const thisM = monthKeys[11], lastM = monthKeys[10]
  const catAgg = new Map<string, { cur: number; prev: number }>()
  for (const t of real) {
    if (t.amount >= 0) continue
    const m = monthOf(t.date)
    if (m !== thisM && m !== lastM) continue
    const agg = catAgg.get(t.category) ?? { cur: 0, prev: 0 }
    if (m === thisM) agg.cur += -t.amount
    else agg.prev += -t.amount
    catAgg.set(t.category, agg)
  }
  const categories: CategoryRow[] = [...catAgg.entries()].map(([key, v]) => {
    const meta = CATEGORIES.find((c) => c.key === key)
    return {
      category: key, label: meta?.label ?? key, emoji: meta?.emoji ?? "❔",
      thisMonth: round2(v.cur), lastMonth: round2(v.prev),
      deltaPct: v.prev > 0 ? Math.round(((v.cur - v.prev) / v.prev) * 100) : null,
      deductible: meta?.deductible ?? false,
    }
  }).sort((a, b) => b.thisMonth - a.thisMonth)

  // ── Anomalies: each vendor judged against ITS OWN history ──
  const anomalies: Anomaly[] = []
  const vendorHistory = new Map<string, number[]>()
  for (const t of real) {
    if (t.amount >= 0) continue
    const k = t.merchant.toLowerCase()
    vendorHistory.set(k, [...(vendorHistory.get(k) ?? []), -t.amount])
  }
  const d45 = new Date(now.getTime() - 45 * 86400000).toISOString().slice(0, 10)
  for (const t of real) {
    if (t.amount >= 0 || t.date < d45) continue
    const hist = vendorHistory.get(t.merchant.toLowerCase()) ?? []
    if (hist.length < 4) continue
    const sorted = [...hist].sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)]
    const spend = -t.amount
    if (median > 0 && spend >= median * 3 && spend - median >= 75) {
      anomalies.push({
        merchant: t.merchant, date: t.date, amount: round2(spend), usual: round2(median),
        ratio: Math.round((spend / median) * 10) / 10,
        note: `${t.merchant} charged $${round2(spend).toLocaleString()} on ${t.date} — ${Math.round(spend / median)}× its usual ~$${round2(median).toLocaleString()}.`,
      })
    }
  }
  anomalies.sort((a, b) => b.ratio - a.ratio)

  // ── Subscriptions roll-up ──
  const streams = (opts.recurring ?? []).filter((s) => s.avgAmount < 0)
  const monthlyTotal = round2(streams.reduce((s, r) => {
    const perMonth = r.cadence === "weekly" ? r.avgAmount * 4.35 : r.cadence === "biweekly" ? r.avgAmount * 2.17 : r.cadence === "yearly" ? r.avgAmount / 12 : r.avgAmount
    return s + Math.abs(perMonth)
  }, 0))

  // ── Deductible YTD ──
  const yearStart = `${now.getUTCFullYear()}-01-01`
  const deductibleKeys = new Set(CATEGORIES.filter((c) => c.deductible).map((c) => c.key))
  const deductibleYtd = round2(real.filter((t) => t.amount < 0 && t.date >= yearStart && deductibleKeys.has(t.category)).reduce((s, t) => s + -t.amount, 0))

  const uncategorized = real.filter((t) => t.category === "other" || t.catSource === "none").length
  const uncategorizedPct = real.length ? Math.round((uncategorized / real.length) * 100) : 0

  // ── The briefing — plain language, only what moved ──
  const briefing: string[] = []
  const cur = months[11], prev = months[10]
  if (real.length === 0) {
    briefing.push("No transactions yet — import a bank statement (CSV, OFX/QFX, or QIF — any bank's export works) or sync Stripe to start the books.")
  } else {
    const incDelta = prev.income > 0 ? Math.round(((cur.income - prev.income) / prev.income) * 100) : null
    briefing.push(`This month so far: $${cur.income.toLocaleString()} in, $${cur.expenses.toLocaleString()} out (net ${cur.net >= 0 ? "+" : ""}$${cur.net.toLocaleString()})${incDelta != null ? ` — revenue tracking ${incDelta >= 0 ? "+" : ""}${incDelta}% vs last month` : ""}.`)
    if (burnRate < 0) {
      briefing.push(`You're burning ~$${Math.abs(burnRate).toLocaleString()}/month on the 3-month trend${daysCashOnHand != null ? ` — about ${daysCashOnHand} days of cash on hand at that pace` : ""}.`)
    } else if (burnRate > 0) {
      briefing.push(`Profitable on trend: averaging +$${burnRate.toLocaleString()}/month over the last 3 complete months.`)
    }
    const mover = categories.find((c) => c.deltaPct != null && Math.abs(c.deltaPct) >= 30 && Math.max(c.thisMonth, c.lastMonth) >= 100)
    if (mover) briefing.push(`${mover.emoji} ${mover.label} moved most: $${mover.lastMonth.toLocaleString()} → $${mover.thisMonth.toLocaleString()} (${mover.deltaPct! >= 0 ? "+" : ""}${mover.deltaPct}%).`)
    if (anomalies.length) briefing.push(`⚠ ${anomalies[0].note}${anomalies.length > 1 ? ` (+${anomalies.length - 1} more anomal${anomalies.length > 2 ? "ies" : "y"} below)` : ""}`)
    const hiked = streams.find((s) => s.priceChangePct != null && s.priceChangePct > 0)
    if (hiked) briefing.push(`📈 ${hiked.merchant} raised its price ~${hiked.priceChangePct}% vs its usual — worth a look.`)
    if (streams.length) briefing.push(`🔁 ${streams.length} recurring charges ≈ $${monthlyTotal.toLocaleString()}/month.`)
    if (uncategorizedPct > 20) briefing.push(`${uncategorizedPct}% of transactions are uncategorized — correct a few in the table and the engine learns your vendors permanently.`)
    briefing.push(`🧾 Deductible spend YTD: $${deductibleYtd.toLocaleString()} — already tagged for tax time.`)
  }

  return {
    cash, income30: round2(income30), expenses30: round2(expenses30), net30: round2(income30 - expenses30),
    burnRate, daysCashOnHand, months, categories, anomalies: anomalies.slice(0, 8),
    subscriptions: { streams: streams.slice(0, 20), monthlyTotal },
    deductibleYtd, uncategorizedPct, briefing,
  }
}
