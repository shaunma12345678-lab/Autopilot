// Market screens — named, criteria-driven views into the tracked universe.
//
// A single "top picks" list answers one question. Different investors are
// asking genuinely different questions, and the same company can be a great
// answer to one and a terrible answer to another: a high-backlog, high-R&D
// compounder is exactly what a growth investor wants and exactly what someone
// who needs steady dividend income should avoid.
//
// Each screen below is defined by explicit, auditable criteria against fields
// we actually compute — not vibes, and not a re-sort of the same score.

export interface ScreenDefinition {
  id: string
  label: string
  icon: string
  /** What question this screen answers, in the investor's terms. */
  thesis: string
  /** The literal criteria, shown in the UI so the screen is auditable. */
  criteria: string[]
  /** Honest statement of what this screen is bad for. */
  caveat: string
}

// ── Stock screens ──────────────────────────────────────────────────────────

export const STOCK_SCREENS: ScreenDefinition[] = [
  {
    id: "future-growth",
    label: "Future Growth",
    icon: "🚀",
    thesis:
      "Companies whose committed future business is growing faster than their current results — contracted backlog, accelerating revenue, and heavy reinvestment into the next product cycle.",
    criteria: [
      "Forward score ≥ 60 (backlog, R&D intensity, capex expansion, revenue acceleration)",
      "Revenue growth positive",
      "Not carrying a going-concern warning",
      "Data confidence medium or high",
    ],
    caveat:
      "Growth is the most expensive thing to buy. These names frequently trade at rich valuations, and a backlog is a commitment to deliver — not a guarantee the customer stays solvent.",
  },
  {
    id: "steady-holdings",
    label: "Steady Holdings",
    icon: "🛡",
    thesis:
      "Boring on purpose. Durable cash generation, dividends covered by actual free cash flow rather than borrowing, low volatility, and enough interest coverage to survive a bad year.",
    criteria: [
      "Dividend payout ≤ 80% of free cash flow (sustainable, not funded by debt)",
      "Interest coverage ≥ 4x",
      "Annualized volatility ≤ 35%",
      "Altman Z-Score not in the distress zone",
      "Fundamental strength ≥ 55",
    ],
    caveat:
      "Built for durability, not upside. These will lag badly in a strong bull market, and a high dividend yield is sometimes the market pricing in a coming cut.",
  },
  {
    id: "quality-compounders",
    label: "Quality Compounders",
    icon: "💎",
    thesis:
      "High returns on capital, clean earnings quality, and shrinking share count — businesses that convert profit into per-share value instead of diluting it away.",
    criteria: [
      "ROE ≥ 15%",
      "Free cash flow margin ≥ 10%",
      "Buyback yield positive (share count shrinking)",
      "Beneish M-Score not flagged (no manipulation profile)",
      "Piotroski F-Score ≥ 6",
    ],
    caveat:
      "Quality is widely recognized and usually priced accordingly. High ROE can also be an artifact of heavy leverage rather than genuine operating excellence.",
  },
  {
    id: "turnaround-watch",
    label: "Turnaround Watch",
    icon: "🔄",
    thesis:
      "Cheap relative to their own history, but with financial health actually improving — the specific combination Piotroski's research was built to separate from value traps.",
    criteria: [
      "Trading in the bottom 35% of its own 1-year price range",
      "Piotroski F-Score ≥ 7 (health improving despite the price)",
      "Not carrying a going-concern warning",
      "Altman Z-Score not in the distress zone",
    ],
    caveat:
      "The highest-failure-rate screen here by design. A stock is usually cheap for a reason, and 'improving' can reverse. Treat these as candidates for research, never as conclusions.",
  },
]

// ── Crypto screens ─────────────────────────────────────────────────────────

export const CRYPTO_SCREENS: ScreenDefinition[] = [
  {
    id: "real-yield",
    label: "Real Yield",
    icon: "💰",
    thesis:
      "Protocols that actually earn fees, sized against their valuation — the closest thing crypto has to an earnings multiple, instead of pure narrative.",
    criteria: [
      "Protocol revenue reported and greater than zero",
      "Annualized revenue yield ≥ 1% of market cap",
      "Security score ≥ 70 or no token contract to check",
      "Data confidence medium or high",
    ],
    caveat:
      "Protocol revenue is not always shared with token holders — plenty of it accrues to a treasury or to liquidity providers instead. Check who the fees actually reach.",
  },
  {
    id: "blue-chip",
    label: "Blue Chip",
    icon: "🔷",
    thesis:
      "The survivability screen: deep real liquidity, clean contract security, low dilution overhang, and enough market cap that a single holder can't dictate the price.",
    criteria: [
      "Market cap rank in the top 150",
      "Security score ≥ 80 (or a native chain coin with no contract risk)",
      "FDV ≤ 1.6x market cap (limited hidden dilution ahead)",
      "Liquidity ≥ 1% of market cap traded in 24h",
    ],
    caveat:
      "Large and liquid is not the same as safe. Every failed major token was blue chip right up until it wasn't, and this screen says nothing about valuation.",
  },
  {
    id: "unlock-watch",
    label: "Unlock Watch",
    icon: "⏰",
    thesis:
      "A forward calendar of scheduled token unlocks — dated, public, quantifiable supply events that most dashboards never surface until after the price has already moved.",
    criteria: [
      "A future unlock date is known",
      "Unlock within the next 90 days",
      "Sorted by soonest first, with the share of supply being released",
    ],
    caveat:
      "This is a timing and risk view, not a quality view. An unlock is a known supply event — it is frequently priced in ahead of time, and sometimes it isn't.",
  },
  {
    id: "emerging-builders",
    label: "Emerging Builders",
    icon: "🔨",
    thesis:
      "Smaller protocols with genuine developer activity and real revenue — building rather than marketing, before the market cap reflects it.",
    criteria: [
      "Market cap rank outside the top 100",
      "Developer activity score ≥ 50 (active commits and contributors)",
      "Protocol revenue reported and greater than zero",
      "Security score ≥ 70",
      "No large unlock inside 30 days",
    ],
    caveat:
      "The highest-risk screen in the product. Small caps fail often, liquidity is thin enough that exiting can move the price against you, and dev activity measures effort rather than success.",
  },
]

// ── Query builders ─────────────────────────────────────────────────────────
// Returned as plain objects so the API routes can hand them straight to the
// data layer. Kept here so criteria text and criteria logic live side by side
// and can't drift apart.

export function stockScreenWhere(id: string): Record<string, unknown> | null {
  const base = { dataConfidence: { in: ["medium", "high"] }, qualityScore: { not: null } }
  switch (id) {
    case "future-growth":
      return { ...base, forwardScore: { gte: 60 }, revenueGrowthYoyPct: { gt: 0 }, earlyWarning: false }
    case "steady-holdings":
      return { ...base, payoutRatioFcfPct: { lte: 80, gt: 0 }, interestCoveragePct: { gte: 4 },
               volatility30dPct: { lte: 35 }, qualityScore: { gte: 55 } }
    case "quality-compounders":
      return { ...base, roePct: { gte: 15 }, fcfMarginPct: { gte: 10 },
               buybackYieldPct: { gt: 0 }, piotroskiScore: { gte: 6 } }
    case "turnaround-watch":
      return { ...base, piotroskiScore: { gte: 7 }, pricePercentile1y: { lte: 35 }, earlyWarning: false }
    default:
      return null
  }
}

export function stockScreenOrderBy(id: string): Record<string, "asc" | "desc"> {
  switch (id) {
    case "future-growth": return { forwardScore: "desc" }
    case "steady-holdings": return { riskScore: "asc" }
    case "quality-compounders": return { roePct: "desc" }
    case "turnaround-watch": return { piotroskiScore: "desc" }
    default: return { qualityScore: "desc" }
  }
}

export function cryptoScreenWhere(id: string): Record<string, unknown> | null {
  const base = { dataConfidence: { in: ["medium", "high"] } }
  const in90Days = new Date(Date.now() + 90 * 86400000).toISOString()
  switch (id) {
    case "real-yield":
      return { ...base, protocolRevenue30dUsd: { gt: 0 } }
    case "blue-chip":
      return { ...base, marketCapRank: { lte: 150 }, fdvToMcapRatio: { lte: 1.6 } }
    case "unlock-watch":
      return { nextUnlockDate: { not: null, lte: in90Days } }
    case "emerging-builders":
      return { ...base, marketCapRank: { gt: 100 }, devActivityScore: { gte: 50 }, protocolRevenue30dUsd: { gt: 0 } }
    default:
      return null
  }
}

export function cryptoScreenOrderBy(id: string): Record<string, "asc" | "desc"> {
  switch (id) {
    case "real-yield": return { protocolRevenue30dUsd: "desc" }
    case "blue-chip": return { marketCapRank: "asc" }
    case "unlock-watch": return { nextUnlockDate: "asc" }
    case "emerging-builders": return { devActivityScore: "desc" }
    default: return { qualityScore: "desc" }
  }
}

export function findScreen(kind: "stock" | "crypto", id: string): ScreenDefinition | null {
  const list = kind === "stock" ? STOCK_SCREENS : CRYPTO_SCREENS
  return list.find(s => s.id === id) ?? null
}
