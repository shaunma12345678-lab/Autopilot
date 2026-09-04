// How this asset actually produces a return — mechanically.
//
// THE GAP THIS CLOSES. The system scores protocol revenue, TVL and supply
// dynamics, but never says the thing a holder most needs to know: through what
// mechanism does money actually reach me, and what does it cost to get it.
//
// Those mechanisms are genuinely different in kind, and conflating them is how
// people lose money without understanding why:
//
//   PRICE APPRECIATION alone is the only mechanism most tokens have. It
//   requires someone later to pay more than you did. That is not a yield, it is
//   a resale, and it is the entire return for the majority of assets.
//
//   FEE ACCRUAL means the protocol earns income and that income reaches
//   holders — by burning supply, by distributing to stakers, or by buybacks.
//   This is the closest thing crypto has to a dividend, and unlike price
//   appreciation it does not require anyone else to buy.
//
//   STAKING pays for securing the network. The headline rate is usually quoted
//   in the token itself, so a 12% staking yield on an asset whose supply
//   inflates 10% is roughly a 2% real return — a distinction the advertised
//   number is designed to obscure.
//
//   LIQUIDITY PROVISION earns trading fees but carries impermanent loss, which
//   is a real cost that quoted APRs almost never net out.
//
// WHAT THIS IS NOT. A recommendation, a projection, or a claim that any of
// these will be profitable. It describes the mechanisms an asset SUPPORTS and
// what each one costs, from disclosed and measured facts, uniformly for every
// asset. Whether to use any of them is the reader's decision.

export type MechanismKind = "price_only" | "fee_accrual" | "staking" | "liquidity_provision"

export interface ReturnMechanism {
  kind: MechanismKind
  label: string
  /** Present on this asset, as opposed to theoretically possible. */
  available: boolean
  /** Where the money comes from, in one sentence. */
  source: string
  /** What it costs or risks — never omitted, since the cost is the part the
   *  advertised yield leaves out. */
  cost: string
  /** Measured figure where one exists. */
  measure: string | null
}

export interface ReturnMechanicsRead {
  mechanisms: ReturnMechanism[]
  /** True when price appreciation is the ONLY way this asset can pay. */
  priceOnly: boolean
  /** Real yield after supply inflation, where both are known. */
  realYieldPct: number | null
  summary: string
}

export interface ReturnMechanicsInput {
  symbol: string
  protocolRevenue30dUsd: number | null
  marketCapUsd: number | null
  tvlUsd: number | null
  stakingYieldPct: number | null
  /** Annual supply growth. A staking yield paid in an inflating token is not
   *  the return it appears to be. */
  supplyInflationPct: number | null
  /** Base-layer chains secure themselves by staking; most tokens do not. */
  isBaseLayerChain: boolean
  liquidityGrade: string | null
  venueCount: number | null
}

export function describeReturnMechanics(input: ReturnMechanicsInput): ReturnMechanicsRead {
  const {
    protocolRevenue30dUsd, marketCapUsd, tvlUsd, stakingYieldPct,
    supplyInflationPct, isBaseLayerChain, liquidityGrade, venueCount,
  } = input

  const mechanisms: ReturnMechanism[] = []

  // ── Fee accrual ───────────────────────────────────────────────────────────
  const hasRevenue = (protocolRevenue30dUsd ?? 0) > 0
  const revenueYieldPct = hasRevenue && marketCapUsd && marketCapUsd > 0
    ? ((protocolRevenue30dUsd! * 12) / marketCapUsd) * 100
    : null

  mechanisms.push({
    kind: "fee_accrual",
    label: "Protocol fee income",
    available: hasRevenue,
    source: hasRevenue
      ? "The protocol charges users fees and earns real income. Whether that income reaches holders depends on the token's design — a burn reduces supply, staking distributions pay it out directly, and buybacks convert it into demand."
      : "This protocol earns no measurable fee income, so there is nothing for holders to accrue from usage.",
    cost: hasRevenue
      ? "Fee income can fall as fast as it rose. It is not contractual, and a competing protocol undercutting on fees removes it without warning."
      : "Not applicable — there is no fee income.",
    measure: revenueYieldPct !== null
      ? `${revenueYieldPct.toFixed(2)}% annualised against market cap`
      : null,
  })

  // ── Staking ───────────────────────────────────────────────────────────────
  const canStake = isBaseLayerChain || (stakingYieldPct ?? 0) > 0
  const realYieldPct = stakingYieldPct !== null && supplyInflationPct !== null
    ? stakingYieldPct - supplyInflationPct
    : null

  mechanisms.push({
    kind: "staking",
    label: "Staking rewards",
    available: canStake,
    source: canStake
      ? "Locking tokens helps secure the network, and the protocol pays for that service in newly issued tokens."
      : "This token does not secure a network, so there is no staking reward to earn.",
    cost: canStake
      ? "Rewards are paid in the token itself, so they are only a real gain to the extent they exceed supply inflation — a headline rate below the inflation rate is a loss of ownership share dressed as a yield. Staked tokens are also typically locked for an unbonding period during which they cannot be sold."
      : "Not applicable.",
    measure: stakingYieldPct !== null
      ? realYieldPct !== null
        ? `${stakingYieldPct.toFixed(1)}% nominal, ${realYieldPct.toFixed(1)}% after ${supplyInflationPct!.toFixed(1)}% supply inflation`
        : `${stakingYieldPct.toFixed(1)}% nominal (supply inflation unknown, so the real rate cannot be stated)`
      : null,
  })

  // ── Liquidity provision ───────────────────────────────────────────────────
  const tradable = (venueCount ?? 0) > 0 && liquidityGrade !== "fragmented"
  mechanisms.push({
    kind: "liquidity_provision",
    label: "Providing liquidity",
    available: tradable,
    source: tradable
      ? "Depositing the token into a trading pool earns a share of the fees traders pay to swap against it."
      : "Liquidity is too thin or fragmented for pool provision to be practical.",
    cost: "Impermanent loss: if the token's price diverges from its pair, the pool rebalances you into the losing side, and that loss can exceed the fees earned. Quoted pool APRs almost never net this out.",
    measure: tvlUsd && tvlUsd > 0 ? `$${Math.round(tvlUsd).toLocaleString()} of capital currently in the protocol` : null,
  })

  // ── Price appreciation ────────────────────────────────────────────────────
  const otherAvailable = mechanisms.some(m => m.kind !== "liquidity_provision" && m.available)
  mechanisms.push({
    kind: "price_only",
    label: "Price appreciation",
    available: true,   // always technically available
    source: "Selling the token to someone later at a higher price.",
    cost: "This requires a future buyer willing to pay more. It is a resale rather than a yield: nothing about holding the asset produces income, so the entire return depends on demand from someone else.",
    measure: null,
  })

  const priceOnly = !otherAvailable

  const summary = priceOnly
    ? `${input.symbol} has no fee income and no staking mechanism, so price appreciation is the only way it can pay. ` +
      `The entire return depends on a later buyer paying more — there is no income stream underneath it.`
    : hasRevenue && canStake
      ? `${input.symbol} can pay in two ways beyond resale: it earns real protocol fees, and it can be staked. ` +
        `Read the staking rate against supply inflation rather than on its own — that is where the advertised number ` +
        `and the real one part company.`
      : hasRevenue
        ? `${input.symbol} earns real protocol fee income, so part of any return can come from usage rather than ` +
          `purely from resale. Whether that income reaches holders depends on whether the design burns, distributes ` +
          `or buys back.`
        : `${input.symbol} can be staked, so some return comes from securing the network — but the reward is paid in ` +
          `the token, so it only counts to the extent it beats supply inflation.`

  return { mechanisms, priceOnly, realYieldPct, summary }
}
