// DealPilot / AutoPilot RE pricing tiers — mapped onto the EXISTING Plan enum
// keys (FREE / STARTER / PRO / AGENCY_GROWTH) so the current Stripe checkout,
// webhook, and User.plan column work unchanged. The anchor is deal ROI: one
// wholesale assignment fee ($10-30k) pays for years of any tier.

export interface PlanTier {
  key: "FREE" | "STARTER" | "PRO" | "AGENCY_GROWTH"
  name: string
  monthly: number
  founding: number         // founding-member price (locked forever while it lasts)
  tagline: string
  cta: string
  highlight: boolean
  features: string[]
}

export const RE_TIERS: PlanTier[] = [
  {
    key: "FREE",
    name: "Scout",
    monthly: 0,
    founding: 0,
    tagline: "Prove it to yourself — no card required",
    cta: "Start free",
    highlight: false,
    features: [
      "5 instant deal analyses per day",
      "Market snapshots for any city",
      "The live prediction accuracy record",
      "Deal math, MAO + offer calculators",
    ],
  },
  {
    key: "STARTER",
    name: "Investor",
    monthly: 99,
    founding: 49,
    tagline: "Find and underwrite deals in your market",
    cta: "Start finding deals",
    highlight: false,
    features: [
      "Unlimited deep searches (20+ sources)",
      "Full deal analysis, deal sheets & distress map",
      "Market Analysis with every factor rated",
      "Fixer-Upper & Best Deals finders",
      "Import your list from any tool (CSV)",
      "Print-ready offer letters (LOIs)",
    ],
  },
  {
    key: "PRO",
    name: "Deal Machine",
    monthly: 299,
    founding: 149,
    tagline: "The full acquisition system — find, work, and close",
    cta: "Get the machine",
    highlight: true,
    features: [
      "Everything in Investor",
      "🔮 Predictive pre-foreclosure forecasts (outcome-verified)",
      "🧲 Seller Finder — who's likely to sell, and why",
      "🚀 Acquisition Agent — sequences, drafts & action queue",
      "🤝 Buyer Intelligence — dossiers on every cash buyer",
      "🧬 The Index — provenance-verified records + Potential Scores",
      "Owner & mailing records, bulk skip-trace, mail merge",
    ],
  },
  {
    key: "AGENCY_GROWTH",
    name: "Empire",
    monthly: 799,
    founding: 399,
    tagline: "Exclusive inbound sellers + we build your machine with you",
    cta: "Build the empire",
    highlight: false,
    features: [
      "Everything in Deal Machine",
      "📥 Inbound Sellers — exclusive homeowners who came to YOU",
      "Your markets prioritized for county-connector coverage",
      "White-glove onboarding — first farm set up together",
      "Priority support, direct line",
    ],
  },
]

// Feature gates by plan — single source of truth for enforcement as public
// signups open up. Order matters: each tier includes everything below it.
const TIER_ORDER: PlanTier["key"][] = ["FREE", "STARTER", "PRO", "AGENCY_GROWTH"]

export type GatedFeature =
  | "deep-search" | "deal-sheets" | "markets" | "fixers" | "best-deals" | "csv-import" | "offer-letters"
  | "predictive" | "seller-finder" | "acquisition-agent" | "buyer-intel" | "index" | "skip-trace"
  | "inbound-sellers"

const FEATURE_MIN_TIER: Record<GatedFeature, PlanTier["key"]> = {
  "deep-search": "STARTER", "deal-sheets": "STARTER", "markets": "STARTER", "fixers": "STARTER",
  "best-deals": "STARTER", "csv-import": "STARTER", "offer-letters": "STARTER",
  "predictive": "PRO", "seller-finder": "PRO", "acquisition-agent": "PRO",
  "buyer-intel": "PRO", "index": "PRO", "skip-trace": "PRO",
  "inbound-sellers": "AGENCY_GROWTH",
}

// Plans not in the RE ladder (GROWTH, AGENCY_STARTER, …) map to their nearest
// tier so legacy accounts keep working.
function tierRank(plan: string): number {
  const direct = TIER_ORDER.indexOf(plan as PlanTier["key"])
  if (direct >= 0) return direct
  if (plan === "GROWTH") return TIER_ORDER.indexOf("STARTER")
  if (plan === "AGENCY_STARTER" || plan === "AGENCY_PREMIUM" || plan === "ENTERPRISE") return TIER_ORDER.indexOf("AGENCY_GROWTH")
  return 0
}

export function hasFeature(plan: string | null | undefined, feature: GatedFeature): boolean {
  return tierRank(plan ?? "FREE") >= TIER_ORDER.indexOf(FEATURE_MIN_TIER[feature])
}
