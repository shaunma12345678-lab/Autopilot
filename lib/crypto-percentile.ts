// Crypto's answer to lib/market-percentile.ts — same idea, honestly weaker
// evidence, and the file says so rather than pretending otherwise.
//
// Crypto has no SEC-frames equivalent: no universal, external, free,
// cross-sectional fundamentals API covering every tracked asset. What it DOES
// have is this system's own accumulated CryptoAsset table — the same kind of
// own-sample comparison lib/sector-benchmarks.ts uses for stocks, and
// lib/market-percentile.ts's own header explicitly calls "noise wearing a
// number's clothing" at small N.
//
// The honest position: an own-sample percentile is still real information
// once the sample clears a real floor — it just can't claim the frames
// approach's "this is the actual market" and shouldn't be scored as if it
// could. MIN_PEERS is set higher than the stock frames' 100-filer floor for
// exactly that reason: this sample is smaller and grows slower, so a smaller
// floor would trade honesty for having something to say.
import { prisma } from "@/lib/prisma"

const MIN_PEERS = 30
// PostgREST caps an unbounded select at 1,000 rows and truncates silently —
// the same failure mode lib/opportunity-screen.ts already found and paginates
// around. Same fix here.
const PAGE = 1000
const MAX_ROWS = 6000

interface RevenueRow {
  protocolRevenue30dUsd: number | null
  marketCapUsd: number | null
}

export interface CryptoPercentileResult {
  percentile: number
  peerCount: number
}

function percentileIn(sorted: number[], value: number): number {
  let lo = 0, hi = sorted.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (sorted[mid] < value) lo = mid + 1
    else hi = mid
  }
  return (lo / sorted.length) * 100
}

// Protocol revenue yield — annualized 30-day protocol revenue over market
// cap — is the closest thing crypto has to an earnings yield (see
// lib/crypto-scoring.ts). Ranking it against every OTHER scored asset with
// both fields present turns a fixed multiplier into a real comparison.
export async function getRevenueYieldPercentile(ownYieldPct: number): Promise<CryptoPercentileResult | null> {
  const rows: RevenueRow[] = []
  for (let skip = 0; skip < MAX_ROWS; skip += PAGE) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page = await (prisma.cryptoAsset as any).findMany({
      where: { protocolRevenue30dUsd: { not: null }, marketCapUsd: { not: null } },
      take: PAGE, skip,
    }).catch(() => [] as RevenueRow[]) as RevenueRow[]
    rows.push(...page)
    if (page.length < PAGE) break
  }

  const yields: number[] = []
  for (const r of rows) {
    if (r.protocolRevenue30dUsd === null || r.marketCapUsd === null || r.marketCapUsd <= 0) continue
    yields.push(((r.protocolRevenue30dUsd * 12) / r.marketCapUsd) * 100)
  }

  if (yields.length < MIN_PEERS) return null
  yields.sort((a, b) => a - b)
  return { percentile: percentileIn(yields, ownYieldPct), peerCount: yields.length }
}
