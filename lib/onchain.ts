// On-chain activity — the crypto equivalent of reading the filings.
//
// This system's whole premise on the equity side is that a company's audited
// numbers can be checked against what management says about them. Crypto has no
// EDGAR, no auditor and no management discussion, so that check appears
// impossible — and most crypto tools therefore score sentiment, price action and
// social volume, all of which are downstream of the thing you want to know.
//
// But crypto has something equities do not: the ledger IS public. Every
// transaction is recorded, permanently, by the network rather than by the
// project. A protocol claiming adoption while its chain processes almost no
// transactions is making a claim its own ledger contradicts — and that is
// exactly the narrative-versus-numbers check, with a source no team controls.
//
// THE METRIC. Market capitalisation per daily transaction: what the market pays
// for each unit of actual on-chain economic activity. It is a valuation ratio
// whose denominator cannot be manufactured by marketing, treasury games or
// exchange wash trading, because it is the chain's own count.
//
// WHERE IT IS NOT VALID, WHICH MATTERS AS MUCH. This is only comparable BETWEEN
// CHAINS WITH THE SAME PURPOSE. Bitcoin is held as a settlement and reserve
// asset, so it deliberately processes few, large transactions and scores
// "expensive" on this measure — that is the design working, not a warning. A
// payments chain and a smart-contract platform are similarly not comparable.
// So this reports the ratio and its peer context and explicitly refuses to rank
// dissimilar chains against each other.
const BLOCKCHAIR = "https://api.blockchair.com"

// Chains Blockchair indexes that we can read directly. An ERC-20 token's
// activity lives in Ethereum contract calls rather than in its own chain, so
// tokens are deliberately out of scope here rather than silently mis-measured.
const SUPPORTED: Record<string, { slug: string; kind: ChainKind }> = {
  BTC:  { slug: "bitcoin",     kind: "settlement" },
  ETH:  { slug: "ethereum",    kind: "smart_contract" },
  LTC:  { slug: "litecoin",    kind: "payments" },
  DOGE: { slug: "dogecoin",    kind: "payments" },
  BCH:  { slug: "bitcoin-cash", kind: "payments" },
  ADA:  { slug: "cardano",     kind: "smart_contract" },
  XLM:  { slug: "stellar",     kind: "payments" },
  XMR:  { slug: "monero",      kind: "payments" },
  ZEC:  { slug: "zcash",       kind: "payments" },
  DASH: { slug: "dash",        kind: "payments" },
}

export type ChainKind = "settlement" | "payments" | "smart_contract"

export interface OnChainRead {
  symbol: string
  chainKind: ChainKind
  transactions24h: number
  holdingAddresses: number | null
  marketCapUsd: number | null
  /** Market value per daily transaction — the denominator cannot be faked. */
  marketCapPerDailyTx: number | null
  /** Market value per address holding a balance, where the chain reports it. */
  marketCapPerHolder: number | null
  notes: string[]
}

export function isOnChainSupported(symbol: string): boolean {
  return symbol.toUpperCase() in SUPPORTED
}

export async function getOnChainActivity(symbol: string): Promise<OnChainRead | null> {
  const entry = SUPPORTED[symbol.toUpperCase()]
  if (!entry) return null

  try {
    const res = await fetch(`${BLOCKCHAIR}/${entry.slug}/stats`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) return null

    const payload = await res.json() as { data?: Record<string, unknown> }
    const d = payload.data
    if (!d) return null

    const num = (v: unknown): number | null => {
      const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN
      return isFinite(n) && n > 0 ? n : null
    }

    const transactions24h = num(d.transactions_24h)
    if (transactions24h === null) return null

    const marketCapUsd = num(d.market_cap_usd)
    const holdingAddresses = num(d.hodling_addresses)

    const marketCapPerDailyTx = marketCapUsd !== null ? marketCapUsd / transactions24h : null
    const marketCapPerHolder =
      marketCapUsd !== null && holdingAddresses !== null ? marketCapUsd / holdingAddresses : null

    const notes: string[] = []
    notes.push(`The chain itself processed ${transactions24h.toLocaleString()} transactions in the last 24 hours — a count recorded by the network, not reported by the project.`)

    if (marketCapPerDailyTx !== null) {
      notes.push(`Market value works out to $${Math.round(marketCapPerDailyTx).toLocaleString()} per daily transaction.`)
    }
    if (holdingAddresses !== null) {
      notes.push(`${holdingAddresses.toLocaleString()} addresses hold a balance.`)
    }
    if (entry.kind === "settlement") {
      notes.push("Read this as a settlement asset: it is designed to process fewer, larger transfers, so a high value-per-transaction reflects that design rather than weak usage.")
    }

    return {
      symbol: symbol.toUpperCase(), chainKind: entry.kind,
      transactions24h, holdingAddresses, marketCapUsd,
      marketCapPerDailyTx, marketCapPerHolder, notes,
    }
  } catch {
    return null
  }
}

export interface OnChainComparison {
  reads: OnChainRead[]
  /** Peer context within the SAME chain purpose only. */
  percentileWithinKind: Record<string, number>
  notes: string[]
}

// Compares each chain only against others built for the same job. Ranking a
// settlement asset against a payments chain on transaction throughput would
// conclude Bitcoin is failing, which is a category error rather than a finding.
export async function compareOnChain(symbols: string[]): Promise<OnChainComparison> {
  const reads: OnChainRead[] = []
  for (const s of symbols) {
    const r = await getOnChainActivity(s)
    if (r) reads.push(r)
  }

  const percentileWithinKind: Record<string, number> = {}
  const byKind = new Map<ChainKind, OnChainRead[]>()
  for (const r of reads) {
    const arr = byKind.get(r.chainKind) ?? []
    arr.push(r)
    byKind.set(r.chainKind, arr)
  }

  const notes: string[] = []
  for (const [kind, group] of byKind) {
    const valued = group.filter(g => g.marketCapPerDailyTx !== null)
    // Two chains are not a distribution; a percentile over them is theatre.
    if (valued.length < 3) {
      notes.push(`Only ${valued.length} ${kind.replace("_", " ")} chain${valued.length === 1 ? "" : "s"} available — too few for a meaningful peer comparison, so none is reported.`)
      continue
    }
    const sorted = [...valued].sort((a, b) => (a.marketCapPerDailyTx ?? 0) - (b.marketCapPerDailyTx ?? 0))
    sorted.forEach((r, i) => {
      // Lower value-per-transaction ranks better: more real usage per dollar
      // of market value.
      percentileWithinKind[r.symbol] = ((sorted.length - 1 - i) / (sorted.length - 1)) * 100
    })
  }

  return { reads, percentileWithinKind, notes }
}
