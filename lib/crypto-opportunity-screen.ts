// The crypto opportunity screen — same job as lib/opportunity-screen.ts, same
// reason it has to exist separately from a plain quality-score sort.
//
// /api/markets/top-ranked?kind=crypto ranks by qualityScore, which returns
// Bitcoin and Ethereum — excellent assets, and not a "find," in the same way
// Apple isn't one on the stock side. Nothing in this system has EVER measured
// whether quality predicts crypto forward returns; the backtest in
// lib/backtest.ts only covers equities. So unlike the stock screen, this does
// NOT claim a validated edge for ranking on cheapness. What it can honestly
// claim: quality and risk are gates that remove assets a reasonable person
// wouldn't hold regardless of price, and among what survives, ranking by
// "cheap versus its own recent trading range" is at minimum not worse than
// ranking by raw quality, which the stock backtest already showed has ~zero
// signal. Read the list as "sound, liquid, and currently out of favor with
// its own history" — not as a claim this converts to outperformance.
//
// EXCLUSIONS ARE GATES, NOT PENALTIES — same reasoning as the stock screen.
// A honeypot doesn't lower a score, it removes the asset, because averaging a
// disqualifying fact into a composite is exactly how a screen ends up
// recommending something about to go to zero.
//
// NO MEGA-CAP EXCLUSION. The stock screen excludes mega-caps because the
// Piotroski literature specifically documents the edge concentrating in
// small, under-covered names — a citable, testable claim. No equivalent
// study exists for crypto market-cap rank, so inventing a cutoff here would
// be a threshold chosen to feel right rather than one backed by evidence.
import { prisma } from "@/lib/prisma"

export interface CryptoOpportunityRow {
  symbol: string
  name: string
  marketCapRank: number | null
  qualityScore: number | null
  riskScore: number | null
  pricePercentile1y: number | null
  liquidityGrade: string | null
  venueCount: number | null
  fdvToMcapRatio: number | null
  onchainPercentile: number | null
  reasons: string[]
  cautions: string[]
}

const MIN_QUALITY = 55
const MAX_RISK = 55
// pricePercentile1y: 0 = bottom of its own 1-year range, 100 = top. "Cheap"
// here means the low half of that range — a much looser bar than the stock
// screen's valuation percentile, deliberately, since this is a price-only
// proxy with no earnings or FCF yield behind it (see computePricePercentile
// in lib/price-history.ts).
const MAX_PRICE_PERCENTILE = 45

interface CryptoAssetRow {
  symbol: string; name: string; marketCapRank: number | null
  qualityScore: number | null; riskScore: number | null; dataConfidence: string
  pricePercentile1y: number | null
  isHoneypot: boolean | null; isMintable: boolean | null
  liquidityGrade: string | null; venueCount: number | null
  fdvToMcapRatio: number | null; onchainPercentile: number | null
  convictionTier: string | null; convictionSummary: string | null
  riskFlags: unknown
}

// Every fact here is a hard disqualifier, mirroring
// lib/opportunity-screen.ts's hasDisqualifyingRedFlag — nothing that fails
// one of these should be called a "top" anything regardless of how it ranks.
export function hasCryptoDisqualifyingRedFlag(t: CryptoAssetRow): string | null {
  if (t.dataConfidence !== "high" && t.dataConfidence !== "medium") {
    return "not enough verified market data to judge"
  }
  if (t.isHoneypot === true) {
    return "contract security check flagged this as a honeypot — the code appears to prevent selling"
  }
  if (t.venueCount === null || t.venueCount === 0) {
    return "not listed on any regulated exchange this system tracks — no independent listing diligence, and exiting may require an unregulated venue"
  }
  if (t.liquidityGrade === "fragmented") {
    return "liquidity is fragmented across venues with no single deep, reliable market"
  }
  if (t.convictionTier === "below-bar") {
    return t.convictionSummary ?? "failed too many of the independent conviction gates (security, liquidity, dilution, or revenue)"
  }
  return null
}

// Exported for unit testing; runCryptoOpportunityScreen is the only
// production caller.
export function disqualify(t: CryptoAssetRow): string | null {
  const redFlag = hasCryptoDisqualifyingRedFlag(t)
  if (redFlag) return redFlag

  if (t.qualityScore === null || t.qualityScore < MIN_QUALITY) {
    return "does not score as sound on the fundamentals this system can check"
  }
  if (t.riskScore !== null && t.riskScore > MAX_RISK) {
    return "carries too many simultaneous risk flags"
  }
  if (t.pricePercentile1y === null) {
    return "not enough price history to judge where it sits in its own range"
  }
  if (t.pricePercentile1y > MAX_PRICE_PERCENTILE) {
    return "trading in the upper half of its own 1-year range — no discount to collect"
  }
  if (t.isMintable === true) {
    return "supply can be minted arbitrarily by the contract owner — dilution is not bounded by anything this system can verify"
  }

  return null
}

function buildReasons(t: CryptoAssetRow): string[] {
  const out: string[] = []
  if (t.pricePercentile1y !== null) {
    out.push(`Trading in the bottom ${t.pricePercentile1y}% of its own 1-year price range.`)
  }
  if (t.onchainPercentile !== null) {
    out.push(`On-chain activity ranks in the ${t.onchainPercentile.toFixed(0)}th percentile against same-purpose chains — real network usage, not marketing.`)
  }
  if (t.venueCount !== null && t.venueCount >= 2) {
    out.push(`Listed on ${t.venueCount} independent regulated exchanges.`)
  }
  if (t.fdvToMcapRatio !== null && t.fdvToMcapRatio <= 1.15) {
    out.push("Supply is essentially fully circulating — little dilution overhang ahead.")
  }
  return out
}

function buildCautions(t: CryptoAssetRow): string[] {
  const out: string[] = []
  if (t.riskScore !== null && t.riskScore >= 40) {
    out.push(`Risk score ${t.riskScore} — meaningful even though it clears the bar.`)
  }
  if (t.fdvToMcapRatio !== null && t.fdvToMcapRatio > 2) {
    out.push(`Fully diluted valuation is ${t.fdvToMcapRatio.toFixed(1)}x current market cap — most supply has yet to enter circulation.`)
  }
  if (t.convictionTier === "standard") {
    out.push(`Conviction: ${t.convictionSummary ?? "cleared the bar but failed some independent gates"}.`)
  }
  if (t.onchainPercentile === null) {
    out.push("Not a base-layer chain this system reads on-chain activity for — real usage is unverified here.")
  }
  const flags = Array.isArray(t.riskFlags) ? (t.riskFlags as string[]) : []
  for (const f of flags.slice(0, 3)) out.push(f)
  if (out.length === 0) {
    out.push("No material caution surfaced — which means none was found, not that none exists.")
  }
  return out
}

export async function runCryptoOpportunityScreen(limit = 25): Promise<{
  rows: CryptoOpportunityRow[]
  screened: number
  rejected: Record<string, number>
}> {
  const all: CryptoAssetRow[] = []
  const PAGE = 1000
  for (let skip = 0; skip < 12000; skip += PAGE) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page = await (prisma.cryptoAsset as any).findMany({
      where: { dataConfidence: { not: "insufficient" } },
      take: PAGE, skip,
    }) as CryptoAssetRow[]
    // Until the pricePercentile1y/onchain* columns exist in the database,
    // the REST layer omits them from the response entirely rather than
    // returning null — so the key is `undefined`, not `null`. Normalize here
    // rather than at every read site, since `!== null` checks throughout this
    // file (correctly) don't treat undefined as equivalent to null.
    for (const row of page) {
      all.push({
        ...row,
        pricePercentile1y: row.pricePercentile1y ?? null,
        onchainPercentile: row.onchainPercentile ?? null,
      })
    }
    if (page.length < PAGE) break
  }

  const rejected: Record<string, number> = {}
  const survivors: CryptoAssetRow[] = []
  for (const t of all) {
    const reason = disqualify(t)
    if (reason) {
      rejected[reason] = (rejected[reason] ?? 0) + 1
      continue
    }
    survivors.push(t)
  }

  // Cheapest-vs-own-range first. Ranked on price percentile, NOT quality —
  // quality already did its job as a gate, and ranking on it would reproduce
  // the Bitcoin/Ethereum list this screen exists to avoid.
  survivors.sort((a, b) => (a.pricePercentile1y ?? 100) - (b.pricePercentile1y ?? 100))

  const top = survivors.slice(0, limit)

  return {
    rows: top.map(t => ({
      symbol: t.symbol, name: t.name, marketCapRank: t.marketCapRank,
      qualityScore: t.qualityScore, riskScore: t.riskScore,
      pricePercentile1y: t.pricePercentile1y, liquidityGrade: t.liquidityGrade,
      venueCount: t.venueCount, fdvToMcapRatio: t.fdvToMcapRatio,
      onchainPercentile: t.onchainPercentile,
      reasons: buildReasons(t), cautions: buildCautions(t),
    })),
    screened: all.length,
    rejected,
  }
}
