// Capital allocation scorecard — a quantitative read on management judgment.
//
// This is the criterion almost no retail tool computes, and it's buildable here
// only because the system already stores both buyback spending (XBRL) and full
// daily price history. Combining them answers a question that is otherwise pure
// opinion: DID MANAGEMENT BUY BACK STOCK WHEN IT WAS CHEAP, OR WHEN IT WAS
// EXPENSIVE?
//
// Buying back shares near a peak destroys value — the company converts cash
// into fewer shares than it could have. Buying during a drawdown creates it.
// Every management team says they are disciplined capital allocators; this
// measures whether the record supports it.
//
// The other half is the M&A verdict: goodwill impairments are the accounting
// system's admission that an acquisition didn't deliver what was paid for.
//
// HONEST LIMITATION, stated because it bounds the conclusion: buyback data is
// annual, so this compares a full year's repurchase spend against that year's
// price range. It cannot see intra-year timing. A company that bought heavily
// in a Q1 crash and nothing afterward looks identical to one that bought evenly
// all year. It answers "did they buy in cheap years or expensive years", not
// "did they time the exact bottom".
import type { FundamentalSeries } from "./edgar-normalize"
import type { DailyBar } from "./price-history"

export interface CapitalAllocationResult {
  score: number | null              // 0-100, higher = better allocator
  buybackYearsAnalyzed: number
  avgBuybackPricePercentile: number | null  // 0 = bought at lows, 100 = bought at highs
  totalBuybackUsd: number | null
  hadImpairment: boolean
  reasons: string[]
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x))
}

// Where a fiscal year's average price sat within that year's own range.
function pricePercentileForPeriod(bars: DailyBar[], endDate: string): number | null {
  const end = new Date(endDate).getTime()
  const start = end - 365 * 86400000
  const window = bars.filter(b => {
    const t = new Date(b.date).getTime()
    return t >= start && t <= end
  })
  if (window.length < 60) return null

  const closes = window.map(b => b.close)
  const high = Math.max(...closes)
  const low = Math.min(...closes)
  if (high <= low) return null

  const avg = closes.reduce((s, v) => s + v, 0) / closes.length
  return ((avg - low) / (high - low)) * 100
}

export function computeCapitalAllocation(
  s: FundamentalSeries,
  bars: DailyBar[]
): CapitalAllocationResult {
  const empty: CapitalAllocationResult = {
    score: null, buybackYearsAnalyzed: 0, avgBuybackPricePercentile: null,
    totalBuybackUsd: null, hadImpairment: false, reasons: [],
  }

  const impairments = s.goodwillImpairment.slice(0, 5)
  const hadImpairment = impairments.some(o => o.value > 0)

  if (bars.length < 120) {
    return {
      ...empty,
      hadImpairment,
      reasons: hadImpairment
        ? ["⚠ Recorded a goodwill impairment — an acquisition was written down below what was paid."]
        : ["Not enough price history to evaluate buyback timing."],
    }
  }

  // Weight each year's price percentile by how much was actually spent, so a
  // large repurchase at a peak counts more than a token one at a low.
  const buybacks = s.treasuryStockPurchased.slice(0, 5).filter(o => o.value > 0)
  let weightedPercentileSum = 0
  let weightSum = 0
  let totalBuybackUsd = 0
  let yearsAnalyzed = 0

  for (const obs of buybacks) {
    const percentile = pricePercentileForPeriod(bars, obs.end)
    if (percentile === null) continue
    const spend = Math.abs(obs.value)
    weightedPercentileSum += percentile * spend
    weightSum += spend
    totalBuybackUsd += spend
    yearsAnalyzed++
  }

  const reasons: string[] = []

  if (yearsAnalyzed === 0) {
    if (hadImpairment) reasons.push("⚠ Recorded a goodwill impairment — an acquisition was written down below what was paid.")
    else reasons.push("No meaningful share repurchases in the period analyzed, so buyback discipline can't be assessed.")
    return { ...empty, hadImpairment, totalBuybackUsd: totalBuybackUsd || null, reasons }
  }

  const avgBuybackPricePercentile = weightedPercentileSum / weightSum

  // Buying at the low end of the range is good allocation, so the score is the
  // inverse of the percentile.
  let score = clamp(100 - avgBuybackPricePercentile, 0, 100)

  if (avgBuybackPricePercentile <= 35) {
    reasons.push(`✓ Repurchases were concentrated in years when the stock traded near the low end of its range (${avgBuybackPricePercentile.toFixed(0)}th percentile) — buying back cheap is the version of this that creates value.`)
  } else if (avgBuybackPricePercentile >= 70) {
    reasons.push(`⚠ Repurchases were concentrated when the stock traded near the high end of its range (${avgBuybackPricePercentile.toFixed(0)}th percentile) — buying back expensive converts cash into fewer shares than it could have.`)
  } else {
    reasons.push(`Repurchases were spread across mid-range prices (${avgBuybackPricePercentile.toFixed(0)}th percentile) — neither notably disciplined nor notably poor timing.`)
  }

  if (totalBuybackUsd > 0) {
    reasons.push(`$${(totalBuybackUsd / 1e9).toFixed(1)}B of stock repurchased across ${yearsAnalyzed} year${yearsAnalyzed === 1 ? "" : "s"}.`)
  }

  if (hadImpairment) {
    score = Math.min(score, 45)
    reasons.push("⚠ Also recorded a goodwill impairment — the accounting admission that an acquisition didn't deliver what was paid for. Buyback discipline and M&A discipline are separate skills, and this record is mixed.")
  }

  return {
    score: Math.round(score),
    buybackYearsAnalyzed: yearsAnalyzed,
    avgBuybackPricePercentile,
    totalBuybackUsd,
    hadImpairment,
    reasons,
  }
}
