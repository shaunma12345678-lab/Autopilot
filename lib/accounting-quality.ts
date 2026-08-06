// Accounting quality — is the reported success real, or is it paper?
//
// This is the "not just bluff on paper" test, and it rests on one idea:
// PROFIT IS AN OPINION, CASH IS A FACT. Net income depends on judgment calls
// about when to recognize revenue, how fast to depreciate, what to capitalize.
// Cash in the bank does not. When those two diverge persistently, the judgment
// calls are doing the work.
//
// What each measure catches:
//
//   CASH CONVERSION (operating cash flow / net income) — the headline test.
//     Persistently below 1.0 means reported profit isn't turning into money.
//     A single year below can be growth-driven working capital; five years
//     below is a pattern.
//
//   DAYS SALES OUTSTANDING trend — receivables growing faster than revenue
//     means sales are being BOOKED that customers haven't PAID for. This is
//     the classic channel-stuffing signature: ship product to distributors at
//     quarter end, book the revenue, collect… eventually, or never.
//
//   INVENTORY TURNS trend — inventory building while revenue flattens means
//     demand is softening before the income statement admits it. Inventory is
//     a leading indicator; revenue is a lagging one.
//
// Every measure is computed over the multi-year series, because a single-year
// reading of any of them is noise.
import type { FundamentalSeries } from "./edgar-normalize"

const MAX_YEARS = 5

function vals(series: { value: number }[], n = MAX_YEARS): number[] {
  return series.slice(0, n).map(o => o.value).reverse() // oldest -> newest
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x))
}

export interface AccountingQuality {
  cashConversionRatio: number | null      // CFO / net income, latest
  avgCashConversion: number | null        // across the window
  yearsOfPoorConversion: number
  dsoDays: number | null
  dsoTrendDays: number | null             // change across window; positive = deteriorating
  inventoryTurns: number | null
  inventoryTurnsTrend: number | null      // negative = slowing
  qualityScore: number | null             // 0-100, higher = cleaner
  riskPenalty: number
  flags: string[]
  notes: string[]
}

export function computeAccountingQuality(s: FundamentalSeries): AccountingQuality {
  const revenue = vals(s.revenue)
  const netIncome = vals(s.netIncome)
  const cfo = vals(s.cfo)
  const receivables = vals(s.receivables)
  const inventory = vals(s.inventory)
  const cogs = vals(s.costOfRevenue)

  const flags: string[] = []
  const notes: string[] = []
  let riskPenalty = 0

  // ── Cash conversion ──────────────────────────────────────────────────────
  const conversions: number[] = []
  for (let i = 0; i < Math.min(cfo.length, netIncome.length); i++) {
    if (netIncome[i] > 0) conversions.push(cfo[i] / netIncome[i])
  }
  const cashConversionRatio = conversions.length > 0 ? conversions[conversions.length - 1] : null
  const avgCashConversion = conversions.length > 0
    ? conversions.reduce((a, b) => a + b, 0) / conversions.length : null
  const yearsOfPoorConversion = conversions.filter(c => c < 0.8).length

  if (avgCashConversion !== null) {
    if (avgCashConversion < 0.7 && conversions.length >= 3) {
      riskPenalty += 15
      flags.push(`⚠ Reported profit is not converting to cash — operating cash flow has averaged only ${(avgCashConversion * 100).toFixed(0)}% of net income across ${conversions.length} years. Profit is an accounting judgment; cash is not.`)
    } else if (avgCashConversion >= 1.1) {
      notes.push(`✓ Converts profit to cash cleanly — operating cash flow averages ${(avgCashConversion * 100).toFixed(0)}% of reported net income.`)
    }
  }

  // ── Days sales outstanding ───────────────────────────────────────────────
  const dsoSeries: number[] = []
  for (let i = 0; i < Math.min(receivables.length, revenue.length); i++) {
    if (revenue[i] > 0) dsoSeries.push((receivables[i] / revenue[i]) * 365)
  }
  const dsoDays = dsoSeries.length > 0 ? dsoSeries[dsoSeries.length - 1] : null
  const dsoTrendDays = dsoSeries.length >= 3 ? dsoSeries[dsoSeries.length - 1] - dsoSeries[0] : null

  if (dsoTrendDays !== null && dsoTrendDays > 20) {
    riskPenalty += 12
    flags.push(`⚠ Customers are taking ${dsoTrendDays.toFixed(0)} days longer to pay than at the start of the window (now ~${dsoDays?.toFixed(0)} days). Revenue is being booked well ahead of collection — the classic channel-stuffing signature.`)
  } else if (dsoTrendDays !== null && dsoTrendDays < -10) {
    notes.push(`✓ Collection is speeding up — receivables are turning ${Math.abs(dsoTrendDays).toFixed(0)} days faster than at the start of the window.`)
  }

  // ── Inventory turns ──────────────────────────────────────────────────────
  const turnsSeries: number[] = []
  for (let i = 0; i < Math.min(inventory.length, cogs.length); i++) {
    if (inventory[i] > 0) turnsSeries.push(cogs[i] / inventory[i])
  }
  const inventoryTurns = turnsSeries.length > 0 ? turnsSeries[turnsSeries.length - 1] : null
  const inventoryTurnsTrend = turnsSeries.length >= 3
    ? turnsSeries[turnsSeries.length - 1] - turnsSeries[0] : null

  if (inventoryTurnsTrend !== null && inventoryTurns !== null && inventoryTurnsTrend < -1 && inventoryTurns > 0) {
    riskPenalty += 8
    flags.push(`⚠ Inventory is turning over more slowly than it was (${inventoryTurns.toFixed(1)}x versus ${turnsSeries[0].toFixed(1)}x). Stock building while sales don't keep pace usually means demand is softening before the income statement shows it.`)
  }

  // ── Composite ────────────────────────────────────────────────────────────
  const parts: Array<{ weight: number; points: number }> = []
  if (avgCashConversion !== null) {
    parts.push({ weight: 50, points: clamp(avgCashConversion * 70, 0, 100) })
  }
  if (dsoTrendDays !== null) {
    parts.push({ weight: 30, points: clamp(70 - dsoTrendDays * 1.5, 0, 100) })
  }
  if (inventoryTurnsTrend !== null) {
    parts.push({ weight: 20, points: clamp(60 + inventoryTurnsTrend * 8, 0, 100) })
  }

  const totalWeight = parts.reduce((a, p) => a + p.weight, 0)
  const qualityScore = totalWeight > 0
    ? Math.round(parts.reduce((a, p) => a + p.points * p.weight, 0) / totalWeight)
    : null

  if (qualityScore === null) {
    notes.push("Not enough multi-year detail to assess whether reported profit is backed by cash.")
  }

  return {
    cashConversionRatio, avgCashConversion, yearsOfPoorConversion,
    dsoDays, dsoTrendDays, inventoryTurns, inventoryTurnsTrend,
    qualityScore, riskPenalty: Math.min(riskPenalty, 30), flags, notes,
  }
}
