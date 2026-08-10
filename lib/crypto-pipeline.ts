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
import { getConsensusQuote, listingQualityScore } from "@/lib/exchange-aggregator"
import { computeMetricsFromCloses, computePricePercentile } from "@/lib/price-history"
import { isOnChainSupported, compareOnChain, ONCHAIN_SUPPORTED_SYMBOLS } from "@/lib/onchain"
import { scoreCrypto } from "@/lib/crypto-scoring"
import { captureSnapshot, detectDeterioration } from "@/lib/score-history"
import { assessCryptoConviction } from "@/lib/conviction"
import { stampFields, type ProvenanceMap } from "@/lib/data-integrity"

export interface AnalyzeCryptoResult {
  ok: boolean
  error?: string
  asset?: Record<string, unknown>
}

export async function analyzeAndUpsertCrypto(queryRaw: string): Promise<AnalyzeCryptoResult> {
  const query = queryRaw.trim()
  if (!query) return { ok: false, error: "Symbol or coin name is required" }

  // INDEPENDENCE: our own exchange data is tried first and the aggregator is
  // optional. Previously a CoinGecko rate limit hard-failed the whole analysis
  // even when we had live regulated-venue prices in hand — the system couldn't
  // run without a third party it doesn't actually need for scoring.
  //
  // The aggregator now supplies only what exchanges don't publish: circulating
  // supply, market cap rank and token contract addresses. If it's unavailable,
  // the asset still scores on our own price, spread, divergence and depth, at
  // correspondingly lower data completeness.
  const found = await searchCoin(query).catch(() => null)

  // Resolve a tradeable symbol even when the aggregator can't be reached.
  const fallbackSymbol = query.toUpperCase().replace(/[^A-Z0-9]/g, "")
  const symbolForExchange = found?.symbol ?? fallbackSymbol

  const [marketRaw, exchangeEarly] = await Promise.all([
    found ? getCoinMarketData(found.coingeckoId).catch(() => null) : Promise.resolve(null),
    getConsensusQuote(symbolForExchange).catch(() => null),
  ])

  if (!marketRaw && !exchangeEarly) {
    return { ok: false, error: `Could not resolve "${query}" on any regulated exchange, and aggregator metadata is unavailable. Either it isn't listed on a venue we track, or both sources are temporarily rate-limiting.` }
  }

  // Synthesize a market record from our own data when the aggregator is down.
  const market: NonNullable<Awaited<ReturnType<typeof getCoinMarketData>>> = marketRaw ?? {
    priceUsd: exchangeEarly!.consensusPrice,
    volume24hUsd: exchangeEarly!.volume24hUsd,
    marketCapUsd: null,
    marketCapRank: null,
    priceChange24hPct: null,
    priceChange7dPct: null,
    circulatingSupply: null,
    totalSupply: null,
    maxSupply: null,
    fdvUsd: null,
    githubRepoUrl: null,
    platforms: null,
  }

  const resolvedId = found?.coingeckoId ?? symbolForExchange.toLowerCase()
  const resolvedSymbol = found?.symbol ?? symbolForExchange
  const resolvedName = found?.name ?? symbolForExchange

  const chain = resolveChain(market.platforms)

  const slug = await resolveProtocolSlug(resolvedName).catch(() => null)
  // On-chain read only applies to the base-layer chains lib/onchain.ts can
  // read directly (ERC-20 tokens live in Ethereum contract calls, not their
  // own chain, so they're correctly out of scope rather than mismeasured).
  // The comparison needs the FULL peer set fetched together — a single-asset
  // read has nothing to rank a percentile against — so this is one extra
  // batch of cheap Blockchair calls, gated behind the symbol actually being
  // on the supported list rather than running on every token.
  const onChainEligible = isOnChainSupported(resolvedSymbol)
  const [revenue30d, nextUnlock, devActivity, security, depth, exchange, priceHistory, btcHistory, onChain] = await Promise.all([
    slug ? getProtocolRevenue30d(slug).catch(() => null) : Promise.resolve(null),
    slug ? getNextUnlock(slug).catch(() => null) : Promise.resolve(null),
    getDevActivity(market.githubRepoUrl).catch(() => null),
    chain ? fetchTokenSecurity(chain.chainId, chain.address).catch(() => null) : Promise.resolve(notApplicableSecurity()),
    fetchOrderbookDepth(resolvedSymbol).catch(() => null),
    Promise.resolve(exchangeEarly),
    getCoinPriceHistory(resolvedId).catch(() => [] as number[]),
    getBtcHistory().catch(() => [] as number[]),
    onChainEligible ? compareOnChain(ONCHAIN_SUPPORTED_SYMBOLS).catch(() => null) : Promise.resolve(null),
  ])

  const onChainRead = onChain?.reads.find(r => r.symbol === resolvedSymbol.toUpperCase()) ?? null
  const onChainPercentile = onChain?.percentileWithinKind[resolvedSymbol.toUpperCase()] ?? null

  const historyMetrics = computeMetricsFromCloses(priceHistory, btcHistory)
  const pricePercentile1y = computePricePercentile(priceHistory)

  const deterioration = await detectDeterioration({
    subjectType: "crypto",
    symbol: resolvedSymbol,
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
    exchange,
    onChainPercentile,
    onChainNotes: onChainRead?.notes ?? [],
    deterioration: deterioration ? { shouldSell: deterioration.shouldSell, reasons: deterioration.reasons } : null,
  })

  const conviction = assessCryptoConviction({
    qualityScore: result.qualityScore,
    riskScore: result.riskScore,
    securityScore: security?.securityScore ?? null,
    isHoneypot: security?.isHoneypot ?? null,
    isMintable: security?.isMintable ?? null,
    venueCount: exchange?.venueCount ?? null,
    liquidityGrade: exchange?.liquidityGrade ?? null,
    fdvToMcapRatio: result.fdvToMcapRatio,
    protocolRevenue30dUsd: revenue30d,
    devActivityScore: devActivity?.devActivityScore ?? null,
    dataConfidence: result.dataConfidence,
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
    ...stampFields(["orderbookDepth2PctUsd", "consensusPriceUsd", "venueCount",
      "venueDivergencePct", "bidAskSpreadPct", "regulatedVolume24hUsd"], "exchange-orderbook"),
    ...stampFields(["volatility30dPct", "maxDrawdown1yPct", "btcCorrelation", "fdvToMcapRatio", "securityScore"], "derived", { isEstimate: true }),
  }

  const data = {
    coingeckoId: resolvedId,
    symbol: resolvedSymbol,
    name: resolvedName,

    marketCapRank: market.marketCapRank,
    // Our own consensus price from regulated venues takes precedence; the
    // aggregator figure is the fallback when an asset isn't listed there.
    priceUsd: exchange?.consensusPrice ?? market.priceUsd,
    consensusPriceUsd: exchange?.consensusPrice ?? null,
    venueCount: exchange?.venueCount ?? 0,
    venueDivergencePct: exchange?.divergencePct ?? null,
    bidAskSpreadPct: exchange?.spreadPct ?? null,
    regulatedVolume24hUsd: exchange?.volume24hUsd ?? null,
    liquidityGrade: exchange?.liquidityGrade ?? null,
    listingQualityScore: listingQualityScore(exchange?.venueCount ?? 0),
    exchangeNotes: exchange?.notes ?? [],
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
    pricePercentile1y,

    onchainTransactions24h: onChainRead?.transactions24h ?? null,
    onchainMarketCapPerTx: onChainRead?.marketCapPerDailyTx ?? null,
    onchainPercentile: onChainPercentile,

    convictionTier: conviction.tier,
    convictionGates: conviction.gates,
    convictionSummary: conviction.summary,

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
  const existing = await (prisma.cryptoAsset as any).findFirst({ where: { coingeckoId: resolvedId } })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const saved = existing
    ? await (prisma.cryptoAsset as any).update({ where: { id: existing.id }, data })
    : await (prisma.cryptoAsset as any).create({ data })

  await captureSnapshot({
    subjectType: "crypto",
    subjectId: saved.id,
    symbol: resolvedSymbol,
    qualityScore: result.qualityScore,
    riskScore: result.riskScore,
    forwardScore: null,
    actionSignal: result.actionSignal,
    priceUsd: exchange?.consensusPrice ?? market.priceUsd,
    top10HolderPct: security?.top10HolderPct ?? null,
  })

  return { ok: true, asset: saved }
}
