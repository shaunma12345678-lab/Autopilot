// Property-type → best exit strategy, plus carrying-cost estimates (property
// tax + insurance). Encodes the investor's playbook: condo = short-term rental,
// townhouse = mid-term, single-family = flip or long-term, duplex = flip, 3+ =
// long-term hold. Pure, null-safe.

import type { ForeclosureLead } from "@/lib/agents/foreclosure-agent"

export interface StrategyPick { strategy: string; emoji: string; why: string }

export function bestStrategy(lead: ForeclosureLead): StrategyPick {
  const type = (lead.propertyType ?? "").toLowerCase()
  const beds = lead.beds ?? 0

  if (/condo/.test(type))
    return { strategy: "Short-term rental", emoji: "🏖", why: "Condo → short-term (Airbnb) tends to perform best" }
  if (/town/.test(type))
    return { strategy: "Mid-term rental", emoji: "🛏", why: "Townhouse → furnished mid-term (1–6mo, corporate/travel-nurse)" }
  if (/triplex|fourplex|4[\s-]?plex|3[\s-]?plex|multi|apartment|units?/.test(type) || beds >= 6)
    return { strategy: "Long-term rental", emoji: "🏘", why: "3+ units → hold as long-term cash-flow rental" }
  if (/duplex|2[\s-]?unit|two[\s-]?family/.test(type))
    return { strategy: "Flip", emoji: "🔨", why: "Duplex → flip candidate (then redeploy capital)" }
  // Default / single-family.
  return { strategy: "Flip or long-term", emoji: "🏠", why: "Single-family → flip to sell, or hold long-term" }
}

// Effective annual property-tax rate by state (% of value, rough public averages).
const PROP_TAX: Record<string, number> = {
  NJ: 2.2, IL: 2.1, NH: 1.9, CT: 1.9, VT: 1.8, WI: 1.6, TX: 1.6, NE: 1.6, OH: 1.5, IA: 1.5,
  PA: 1.4, NY: 1.4, RI: 1.4, MI: 1.3, KS: 1.3, ND: 1.0, ME: 1.2, MN: 1.1, MA: 1.1, MD: 1.0,
  MO: 1.0, OR: 0.9, IN: 0.8, GA: 0.8, FL: 0.8, OK: 0.9, KY: 0.8, NC: 0.8, VA: 0.8, WA: 0.9,
  CA: 0.7, MT: 0.7, NM: 0.7, MS: 0.8, TN: 0.6, AZ: 0.6, ID: 0.6, AR: 0.6, WV: 0.6, UT: 0.6,
  WY: 0.6, DE: 0.6, SC: 0.5, NV: 0.6, LA: 0.5, AL: 0.4, CO: 0.5, HI: 0.3,
}

export interface CarryingCosts { propertyTaxYr: number | null; insuranceYr: number | null; rate: number | null }

export function carryingCosts(lead: ForeclosureLead): CarryingCosts {
  const val = lead.avmValue ?? lead.estimatedValue ?? 0
  if (val <= 0) return { propertyTaxYr: null, insuranceYr: null, rate: null }
  const rate = PROP_TAX[(lead.state ?? "").toUpperCase()] ?? 1.0
  // Insurance ~0.5%/yr nationally; coastal/FL/LA/TX higher.
  const insRate = /FL|LA|TX|MS|OK/.test((lead.state ?? "").toUpperCase()) ? 0.009 : 0.005
  return {
    propertyTaxYr: Math.round(val * (rate / 100)),
    insuranceYr:   Math.round(val * insRate),
    rate,
  }
}
