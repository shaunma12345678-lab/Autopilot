// Shared orchestration for the crypto vertical, mirroring lib/stock-pipeline.ts:
// one code path for both the on-demand lookup route and the recurring
// re-scoring cron. A user's lookup permanently seeds CryptoAsset.
//
// Every enrichment source is best-effort and independently guarded — a token
// with no DefiLlama entry, no GitHub repo, and no exchange listing still scores
// on whatever IS available, at correspondingly lower confidence, rather than
// failing outright.
import { prisma } from "@/lib/prisma"
import { searchCoin, getCoinMarketData, getCoinPriceHistory, getBtcHistory } from "@/lib/coingecko-client"
import { getDevActivity } from "@/lib/github-activity"
import { resolveProtocolSlug, getProtocolRevenue30d, getNextUnlock } from "@/lib/defillama-client"
import { resolveChain, fetchTokenSecurity, notApplicableSecurity } from "@/lib/token-security"
import { fetchOrderbookDepth } from "@/lib/orderbook-depth"
import { computeMetricsFromCloses } from "@/lib/price-history"
import { scoreCrypto } from "@/lib/crypto-scoring"
import { captureSnapshot, detectDeterioration } from "@/lib/score-history"
import { stampFields, type ProvenanceMap } from "@/lib/data-integrity"

export interface AnalyzeCryptoResult {
  ok: boolean
  error?: string
  asset?: Record<string, unknown>
}

export async function analyzeAndUpsertCrypto(queryRaw: string): Promise<AnalyzeCryptoResult> {
  const query = queryRaw.trim()
  if (!query) return { ok: false, error: "Symbol or coin name is required" }

  const found = await searchCoin(query)
  if (!found) return { ok: false, error: `Could not resolve "${query}" — either it is not listed on CoinGecko, or the API is currently rate-limiting. Retrying in a minute usually resolves the latter.` }

  const market = await getCoinMarketData(found.coingeckoId)
  if (!market) return { ok: false, error: `No market data available for ${found.symbol}` }

  const chain = resolveChain(market.platforms)

  const slug = await resolveProtocolSlug(found.name).catch(() => null)
  const [revenue30d, nextUnlock, devActivity, security, depth, priceHistory, btcHistory] = await Promise.all([
    slug ? getProtocolRevenue30d(slug).catch(() => null) : Promise.resolve(null),
    slug ? getNextUnlock(slug).catch(() => null) : Promise.resolve(null),
    getDevActivity(market.githubRepoUrl).catch(() => null),
    chain ? fetchTokenSecurity(chain.chainId, chain.address).catch(() => null) : Promise.resolve(notApplicableSecurity()),
    fetchOrderbookDepth(found.symbol).catch(() => null),
    getCoinPriceHistory(found.coingeckoId).catch(() => [] as number[]),
    getBtcHistory().catch(() => [] as number[]),
  ])

  const historyMetrics = computeMetricsFromCloses(priceHistory, btcHistory)

  const deterioration = await detectDeterioration({
    subjectType: "crypto",
    symbol: found.symbol,
    qualityScore: null,
    riskScore: null,
    forwardScore: null,
    hardExits: [
      { active: security?.isHoneypot === true, reason: "Honeypot contract detected — the code appears to prevent selling. Anyone holding this should treat it as a total-loss condition." },
    ],
  }).catch(() => null)

  const result = scoreCrypto({
    market,
    protocolRevenue30dUsd: revenue30d,
    devActivity,
    nextUnlock,
    security,
    depth,
    volatility30dPct: historyMetrics.volatility30dPct,
    maxDrawdown1yPct: historyMetrics.maxDrawdown1yPct,
    btcCorrelation: historyMetrics.benchmarkCorrelation,
    deterioration: deterioration ? { shouldSell: deterioration.shouldSell, reasons: deterioration.reasons } : null,
  })

  const fieldSources: ProvenanceMap = {
    ...stampFields([
      "priceUsd", "volume24hUsd", "marketCapUsd", "marketCapRank",
      "priceChange24hPct", "priceChange7dPct", "circulatingSupplyPct", "fdvUsd",
    ], "coingecko"),
    ...stampFields(["protocolRevenue30dUsd", "nextUnlockDate", "nextUnlockPctSupply"], "defillama"),
    ...stampFields(["devActivityScore"], "github"),
    ...stampFields([
      "isHoneypot", "isMintable", "ownershipRenounced", "lpLocked", "isProxy",
      "buyTaxPct", "sellTaxPct", "holderCount", "topHolderPct", "top10HolderPct", "creatorPct",
    ], "goplus"),
    ...stampFields(["orderbookDepth2PctUsd"], "exchange-orderbook"),
    ...stampFields(["volatility30dPct", "maxDrawdown1yPct", "btcCorrelation", "fdvToMcapRatio", "securityScore"], "derived", { isEstimate: true }),
  }

  const data = {
    coingeckoId: found.coingeckoId,
    symbol: found.symbol,
    name: found.name,

    marketCapRank: market.marketCapRank,
    priceUsd: market.priceUsd,
    volume24hUsd: market.volume24hUsd,
    marketCapUsd: market.marketCapUsd,
    priceChange24hPct: market.priceChange24hPct,
    priceChange7dPct: market.priceChange7dPct,
    circulatingSupplyPct: (market.maxSupply && market.maxSupply > 0 && market.circulatingSupply)
      ? (market.circulatingSupply / market.maxSupply) * 100 : null,

    fdvUsd: market.fdvUsd,
    fdvToMcapRatio: result.fdvToMcapRatio,

    protocolRevenue30dUsd: revenue30d,
    devActivityScore: devActivity?.devActivityScore ?? null,
    nextUnlockDate: nextUnlock?.date ? new Date(nextUnlock.date).toISOString() : null,
    nextUnlockPctSupply: nextUnlock?.pctOfSupply ?? null,

    contractAddress: chain?.address ?? null,
    chainId: chain?.chainId ?? null,
    chainSlug: chain?.chainSlug ?? null,

    isHoneypot: security?.isHoneypot ?? null,
    isMintable: security?.isMintable ?? null,
    ownershipRenounced: security?.ownershipRenounced ?? null,
    lpLocked: security?.lpLocked ?? null,
    isProxy: security?.isProxy ?? null,
    buyTaxPct: security?.buyTaxPct ?? null,
    sellTaxPct: security?.sellTaxPct ?? null,
    holderCount: security?.holderCount ?? null,
    topHolderPct: security?.topHolderPct ?? null,
    top10HolderPct: security?.top10HolderPct ?? null,
    creatorPct: security?.creatorPct ?? null,
    securityScore: security?.securityScore ?? null,
    securityFlags: security?.flags ?? [],

    orderbookDepth2PctUsd: depth?.totalDepth2PctUsd ?? null,
    volatility30dPct: historyMetrics.volatility30dPct,
    maxDrawdown1yPct: historyMetrics.maxDrawdown1yPct,
    btcCorrelation: historyMetrics.benchmarkCorrelation,

    qualityScore: result.qualityScore,
    qualityReasons: result.qualityReasons,
    riskScore: result.riskScore,
    riskFlags: result.riskFlags,
    strengthTier: result.strengthTier,
    actionSignal: result.actionSignal,
    actionRationale: result.actionRationale,
    dataCompletenessPct: result.dataCompletenessPct,
    dataConfidence: result.dataConfidence,
    fieldSources,
    lastScoredAt: new Date().toISOString(),
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existing = await (prisma.cryptoAsset as any).findFirst({ where: { coingeckoId: found.coingeckoId } })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const saved = existing
    ? await (prisma.cryptoAsset as any).update({ where: { id: existing.id }, data })
    : await (prisma.cryptoAsset as any).create({ data })

  await captureSnapshot({
    subjectType: "crypto",
    subjectId: saved.id,
    symbol: found.symbol,
    qualityScore: result.qualityScore,
    riskScore: result.riskScore,
    forwardScore: null,
    actionSignal: result.actionSignal,
    priceUsd: market.priceUsd,
  })

  return { ok: true, asset: saved }
}
