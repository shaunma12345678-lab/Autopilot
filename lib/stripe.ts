import Stripe from "stripe"

let _stripe: Stripe | undefined

function getInstance(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2026-04-22.dahlia",
    })
  }
  return _stripe
}

export const stripe = new Proxy({} as Stripe, {
  get: (_, prop) => {
    const inst = getInstance()
    const val = Reflect.get(inst, prop, inst)
    return typeof val === "function" ? val.bind(inst) : val
  },
})

export const PLAN_LIMITS = {
  FREE: {
    socialPosts: 5,
    emailsPerMonth: 1,
    reviewResponses: 3,
    leads: 0,
    agents: ["content", "reputation"],
    businesses: 1,
    whiteLabel: false,
    apiAccess: false,
  },
  STARTER: {
    socialPosts: 30,
    emailsPerMonth: 4,
    reviewResponses: -1,
    leads: 0,
    agents: ["content", "reputation", "support"],
    businesses: 1,
    whiteLabel: false,
    apiAccess: false,
  },
  GROWTH: {
    socialPosts: -1,
    emailsPerMonth: -1,
    reviewResponses: -1,
    leads: 50,
    agents: ["content", "reputation", "support", "leads", "booking", "retention"],
    businesses: 3,
    whiteLabel: false,
    apiAccess: false,
  },
  PRO: {
    socialPosts: -1,
    emailsPerMonth: -1,
    reviewResponses: -1,
    leads: -1,
    agents: "all" as const,
    businesses: -1,
    whiteLabel: true,
    apiAccess: true,
  },
  AGENCY_STARTER: {
    socialPosts: -1,
    emailsPerMonth: -1,
    reviewResponses: -1,
    leads: -1,
    agents: "all" as const,
    businesses: 10,
    whiteLabel: true,
    apiAccess: true,
  },
  AGENCY_GROWTH: {
    socialPosts: -1,
    emailsPerMonth: -1,
    reviewResponses: -1,
    leads: -1,
    agents: "all" as const,
    businesses: 25,
    whiteLabel: true,
    apiAccess: true,
  },
  AGENCY_PREMIUM: {
    socialPosts: -1,
    emailsPerMonth: -1,
    reviewResponses: -1,
    leads: -1,
    agents: "all" as const,
    businesses: -1,
    whiteLabel: true,
    apiAccess: true,
  },
  ENTERPRISE: {
    socialPosts: -1,
    emailsPerMonth: -1,
    reviewResponses: -1,
    leads: -1,
    agents: "all" as const,
    businesses: -1,
    whiteLabel: true,
    apiAccess: true,
  },
} as const

export type PlanKey = keyof typeof PLAN_LIMITS

export const STRIPE_PRICE_IDS: Record<string, string> = {
  STARTER: process.env.STRIPE_PRICE_STARTER ?? "",
  GROWTH: process.env.STRIPE_PRICE_GROWTH ?? "",
  PRO: process.env.STRIPE_PRICE_PRO ?? "",
  AGENCY_STARTER: process.env.STRIPE_PRICE_AGENCY_STARTER ?? "",
  AGENCY_GROWTH: process.env.STRIPE_PRICE_AGENCY_GROWTH ?? "",
  AGENCY_PREMIUM: process.env.STRIPE_PRICE_AGENCY_PREMIUM ?? "",
}

export const PLAN_PRICES: Record<string, { monthly: number; label: string; description: string }> = {
  FREE: { monthly: 0, label: "Free", description: "Get started, no credit card required" },
  STARTER: { monthly: 49, label: "Starter", description: "For solo business owners" },
  GROWTH: { monthly: 99, label: "Growth", description: "For growing businesses" },
  PRO: { monthly: 199, label: "Pro", description: "Full platform access + white-label" },
  AGENCY_STARTER: { monthly: 399, label: "Agency Starter", description: "Manage up to 10 clients" },
  AGENCY_GROWTH: { monthly: 799, label: "Agency Growth", description: "Manage up to 25 clients" },
  AGENCY_PREMIUM: { monthly: 1599, label: "Agency Premium", description: "Unlimited clients" },
}
