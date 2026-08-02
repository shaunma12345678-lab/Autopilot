// Token security / rug-risk checks via the GoPlus Security API (free, no key
// required for basic token_security lookups).
//
// This is the highest-value criteria set in the whole crypto vertical, and it's
// worth being explicit about why: these checks aren't predictive, they're
// PROTECTIVE. Mint authority, unlocked liquidity, and honeypot contracts are
// the mechanisms behind the losses that actually wipe retail crypto investors
// out. They're binary, publicly verifiable on-chain, and almost no consumer
// dashboard surfaces them clearly. Preventing a -100% matters more than
// predicting a +20%.
//
// Coverage limit, surfaced honestly rather than hidden: this only works for
// tokens deployed as contracts on a supported EVM chain. Native L1 coins
// (BTC, ETH, SOL) have no token contract, so they return `applicable: false`
// rather than a misleading "passed all checks".

// CoinGecko platform slug → GoPlus chain id
const CHAIN_IDS: Record<string, string> = {
  ethereum: "1",
  "binance-smart-chain": "56",
  "polygon-pos": "137",
  "arbitrum-one": "42161",
  "optimistic-ethereum": "10",
  avalanche: "43114",
  base: "8453",
  "linea-mainnet": "59144",
  fantom: "250",
  cronos: "25",
}

export function resolveChain(platforms: Record<string, string> | null | undefined): { chainId: string; chainSlug: string; address: string } | null {
  if (!platforms) return null
  // Prefer Ethereum when a token is deployed on several chains — it has the
  // deepest liquidity and the most reliable security metadata.
  const preference = ["ethereum", "binance-smart-chain", "base", "arbitrum-one", "polygon-pos", "optimistic-ethereum", "avalanche"]
  for (const slug of preference) {
    const address = platforms[slug]
    if (address && CHAIN_IDS[slug]) return { chainId: CHAIN_IDS[slug], chainSlug: slug, address }
  }
  for (const [slug, address] of Object.entries(platforms)) {
    if (address && CHAIN_IDS[slug]) return { chainId: CHAIN_IDS[slug], chainSlug: slug, address }
  }
  return null
}

export interface TokenSecurity {
  applicable: boolean
  isHoneypot: boolean | null
  isMintable: boolean | null
  ownershipRenounced: boolean | null
  lpLocked: boolean | null
  isProxy: boolean | null
  buyTaxPct: number | null
  sellTaxPct: number | null
  holderCount: number | null
  topHolderPct: number | null
  top10HolderPct: number | null
  creatorPct: number | null
  securityScore: number | null   // 0-100, higher = safer
  flags: string[]
  note: string
}

const NOT_APPLICABLE: TokenSecurity = {
  applicable: false,
  isHoneypot: null, isMintable: null, ownershipRenounced: null, lpLocked: null, isProxy: null,
  buyTaxPct: null, sellTaxPct: null, holderCount: null, topHolderPct: null, top10HolderPct: null,
  creatorPct: null, securityScore: null, flags: [],
  note: "No token contract to inspect — native chain coins (BTC, ETH, SOL and similar) don't have the contract-level risks these checks look for.",
}

// GoPlus returns "1"/"0" strings, and omits fields it couldn't determine.
function bool(v: unknown): boolean | null {
  if (v === "1" || v === 1) return true
  if (v === "0" || v === 0) return false
  return null
}

function pct(v: unknown): number | null {
  const n = Number(v)
  return isFinite(n) ? n * 100 : null
}

interface GoPlusHolder { percent?: string; is_locked?: number; is_contract?: number; tag?: string }

export async function fetchTokenSecurity(chainId: string, address: string): Promise<TokenSecurity | null> {
  try {
    const url = `https://api.gopluslabs.io/api/v1/token_security/${encodeURIComponent(chainId)}?contract_addresses=${encodeURIComponent(address)}`
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(12000) })
    if (!res.ok) return null

    const payload = await res.json()
    const result = payload?.result
    if (!result || typeof result !== "object") return null

    // GoPlus keys the result by lowercased address
    const entry = (result[address.toLowerCase()] ?? Object.values(result)[0]) as Record<string, unknown> | undefined
    if (!entry) return null

    const isHoneypot = bool(entry.is_honeypot)
    const isMintable = bool(entry.is_mintable)
    const isProxy = bool(entry.is_proxy)
    const ownerAddress = typeof entry.owner_address === "string" ? entry.owner_address : ""
    // A zero/empty owner address means ownership was renounced.
    const ownershipRenounced = ownerAddress === "" || /^0x0{40}$/i.test(ownerAddress) ? true
      : ownerAddress.length > 0 ? false : null

    const lpHolders = Array.isArray(entry.lp_holders) ? entry.lp_holders as GoPlusHolder[] : []
    const lpLocked = lpHolders.length === 0 ? null
      : lpHolders.some(h => h.is_locked === 1 || (h.tag ?? "").toLowerCase().includes("lock"))

    const holders = Array.isArray(entry.holders) ? entry.holders as GoPlusHolder[] : []
    // Exclude LP/locked/burn contracts — those aren't concentration risk the
    // way a whale wallet is.
    const realHolders = holders.filter(h => !(h.is_contract === 1 && (h.tag ?? "").toLowerCase().match(/lock|burn|pool|lp/)))
    const holderPcts = realHolders.map(h => Number(h.percent)).filter(n => isFinite(n)).sort((a, b) => b - a)
    const topHolderPct = holderPcts.length > 0 ? holderPcts[0] * 100 : null
    const top10HolderPct = holderPcts.length > 0 ? holderPcts.slice(0, 10).reduce((s, v) => s + v, 0) * 100 : null

    const holderCountRaw = Number(entry.holder_count)
    const holderCount = isFinite(holderCountRaw) ? holderCountRaw : null
    const creatorPct = pct(entry.creator_percent)
    const buyTaxPct = pct(entry.buy_tax)
    const sellTaxPct = pct(entry.sell_tax)

    // Security score starts perfect and is debited per confirmed risk. An
    // unknown (null) never debits — absence of data is not evidence of safety
    // OR danger, and is called out in the note instead.
    const flags: string[] = []
    let securityScore = 100

    if (isHoneypot === true) { securityScore -= 60; flags.push("🚨 Honeypot detected — the contract appears to block selling. Do not buy.") }
    if (isMintable === true) { securityScore -= 20; flags.push("⚠ Supply is mintable — the contract owner can create new tokens and dilute holders at will.") }
    if (ownershipRenounced === false) { securityScore -= 12; flags.push("⚠ Contract ownership has not been renounced — the owner retains privileged control.") }
    if (lpLocked === false) { securityScore -= 20; flags.push("⚠ Liquidity does not appear locked — it could be withdrawn, making the token untradeable.") }
    if (isProxy === true) { securityScore -= 8; flags.push("⚠ Upgradeable proxy contract — the logic can be changed after deployment.") }
    if (bool(entry.can_take_back_ownership) === true) { securityScore -= 15; flags.push("⚠ Contract can reclaim ownership after renouncing it.") }
    if (bool(entry.hidden_owner) === true) { securityScore -= 15; flags.push("⚠ Hidden owner detected in the contract.") }
    if (bool(entry.selfdestruct) === true) { securityScore -= 20; flags.push("⚠ Contract contains a self-destruct function.") }
    if (bool(entry.transfer_pausable) === true) { securityScore -= 10; flags.push("⚠ Transfers can be paused by the contract owner.") }
    if (bool(entry.is_blacklisted) === true) { securityScore -= 10; flags.push("⚠ Contract can blacklist addresses from trading.") }
    if (bool(entry.slippage_modifiable) === true) { securityScore -= 8; flags.push("⚠ Trading tax can be changed after launch.") }

    if (sellTaxPct !== null && sellTaxPct >= 10) { securityScore -= 15; flags.push(`⚠ High sell tax of ${sellTaxPct.toFixed(1)}%.`) }
    else if (sellTaxPct !== null && sellTaxPct >= 5) { securityScore -= 6; flags.push(`Sell tax of ${sellTaxPct.toFixed(1)}%.`) }

    if (topHolderPct !== null && topHolderPct >= 20) { securityScore -= 12; flags.push(`⚠ A single wallet holds ${topHolderPct.toFixed(1)}% of supply — concentrated dump risk.`) }
    if (top10HolderPct !== null && top10HolderPct >= 60) { securityScore -= 10; flags.push(`⚠ Top 10 wallets hold ${top10HolderPct.toFixed(1)}% of supply.`) }
    if (creatorPct !== null && creatorPct >= 10) { securityScore -= 8; flags.push(`⚠ Contract creator still holds ${creatorPct.toFixed(1)}% of supply.`) }

    const unknowns = [
      isHoneypot === null && "honeypot status",
      lpLocked === null && "liquidity lock status",
      isMintable === null && "mint authority",
    ].filter(Boolean) as string[]

    const note = unknowns.length > 0
      ? `Could not determine: ${unknowns.join(", ")}. Unknown checks are not counted for or against the security score.`
      : "All standard contract-security checks returned a determinate result."

    return {
      applicable: true,
      isHoneypot, isMintable, ownershipRenounced, lpLocked, isProxy,
      buyTaxPct, sellTaxPct, holderCount, topHolderPct, top10HolderPct, creatorPct,
      securityScore: Math.max(0, Math.min(100, securityScore)),
      flags, note,
    }
  } catch {
    return null
  }
}

export function notApplicableSecurity(): TokenSecurity {
  return { ...NOT_APPLICABLE }
}
