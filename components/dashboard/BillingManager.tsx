"use client"

import { useState } from "react"

const PLANS = [
  {
    key: "FREE", label: "Free", price: 0, period: "/mo",
    features: ["5 social posts/month", "1 email newsletter", "3 review responses", "1 business"],
  },
  {
    key: "STARTER", label: "Starter", price: 49, period: "/mo",
    features: ["30 social posts/month", "4 newsletters", "Unlimited review responses", "1 business"],
  },
  {
    key: "GROWTH", label: "Growth", price: 99, period: "/mo",
    features: ["Unlimited posts", "Unlimited emails", "Lead gen (50/mo)", "3 businesses", "Booking + retention agents"],
    highlight: true,
  },
  {
    key: "PRO", label: "Pro", price: 199, period: "/mo",
    features: ["Everything in Growth", "Unlimited leads", "All 16 agents", "White-label", "API access"],
  },
]

interface Props {
  currentPlan: string
  hasStripeId: boolean
  usage: { content: number; reviews: number }
}

export default function BillingManager({ currentPlan, hasStripeId, usage }: Props) {
  const [loading, setLoading] = useState<string | null>(null)

  async function handleUpgrade(plan: string) {
    setLoading(plan)
    const res = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan }),
    })
    const { url } = await res.json()
    if (url) window.location.href = url
    setLoading(null)
  }

  async function openPortal() {
    setLoading("portal")
    const res = await fetch("/api/billing/portal", { method: "POST" })
    const { url } = await res.json()
    if (url) window.location.href = url
    setLoading(null)
  }

  return (
    <div className="space-y-6">
      {/* Current Plan Banner */}
      <div className="bg-indigo-900/20 border border-indigo-800 rounded-xl p-5 flex items-center justify-between">
        <div>
          <p className="text-sm text-indigo-400 font-medium">Current Plan</p>
          <p className="text-xl font-bold mt-0.5">{currentPlan}</p>
          <p className="text-sm text-gray-400 mt-1">
            {usage.content} content pieces created · {usage.reviews} reviews monitored
          </p>
        </div>
        {hasStripeId && (
          <button onClick={openPortal} disabled={loading === "portal"}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium rounded-lg border border-gray-700 transition disabled:opacity-40">
            {loading === "portal" ? "Loading..." : "Manage Billing"}
          </button>
        )}
      </div>

      {/* Plan Cards */}
      <div className="grid grid-cols-4 gap-4">
        {PLANS.map(plan => {
          const isCurrent = plan.key === currentPlan
          return (
            <div key={plan.key} className={`rounded-xl border p-5 flex flex-col ${
              plan.highlight && !isCurrent ? "border-indigo-500 bg-indigo-600/5" :
              isCurrent ? "border-emerald-700 bg-emerald-900/10" :
              "border-gray-800 bg-gray-900"
            }`}>
              {plan.highlight && !isCurrent && (
                <span className="text-xs bg-indigo-600 text-white px-2 py-0.5 rounded-full self-start mb-3">Popular</span>
              )}
              {isCurrent && (
                <span className="text-xs bg-emerald-700 text-white px-2 py-0.5 rounded-full self-start mb-3">Current</span>
              )}
              <p className="font-bold text-lg">{plan.label}</p>
              <p className="text-2xl font-bold mt-1">
                ${plan.price}
                <span className="text-sm font-normal text-gray-400">{plan.period}</span>
              </p>
              <ul className="mt-4 space-y-1.5 flex-1">
                {plan.features.map(f => (
                  <li key={f} className="text-xs text-gray-400 flex items-start gap-1.5">
                    <span className="text-emerald-500 mt-0.5 flex-shrink-0">&#x2713;</span>
                    {f}
                  </li>
                ))}
              </ul>
              <button
                disabled={isCurrent || loading === plan.key || plan.key === "FREE"}
                onClick={() => handleUpgrade(plan.key)}
                className={`mt-4 w-full py-2 text-sm font-medium rounded-lg transition ${
                  isCurrent ? "bg-gray-800 text-gray-500 cursor-default" :
                  plan.key === "FREE" ? "bg-gray-800 text-gray-500 cursor-default" :
                  plan.highlight ? "bg-indigo-600 hover:bg-indigo-500 text-white" :
                  "bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700"
                } disabled:opacity-40`}>
                {loading === plan.key ? "Loading..." :
                 isCurrent ? "Current plan" :
                 plan.key === "FREE" ? "Free forever" :
                 "Upgrade"}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
