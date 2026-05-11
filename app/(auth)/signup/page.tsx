"use client"

import { useState } from "react"
import { signUp } from "@/app/actions/auth"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Suspense } from "react"

const PLAN_LABELS: Record<string, { name: string; price: string; color: string }> = {
  STARTER:        { name: "Starter",        price: "$49/mo",    color: "text-indigo-400" },
  GROWTH:         { name: "Growth",         price: "$99/mo",    color: "text-indigo-400" },
  PRO:            { name: "Pro",            price: "$199/mo",   color: "text-indigo-400" },
  AGENCY_STARTER: { name: "Agency Starter", price: "$399/mo",   color: "text-violet-400" },
  AGENCY_GROWTH:  { name: "Agency Growth",  price: "$799/mo",   color: "text-violet-400" },
  AGENCY_PREMIUM: { name: "Agency Premium", price: "$1,599/mo", color: "text-violet-400" },
}

function SignupForm() {
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const searchParams = useSearchParams()
  const plan = searchParams.get("plan") || ""
  const planInfo = PLAN_LABELS[plan]

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError("")
    const formData = new FormData(e.currentTarget)
    if (plan) formData.set("plan", plan)
    const result = await signUp(formData)
    if (result?.error) {
      setError(result.error)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative" style={{ background: "#050810" }}>
      {/* Close / back button */}
      <Link
        href="/"
        className="absolute top-6 right-6 w-9 h-9 rounded-full flex items-center justify-center text-gray-600 hover:text-white hover:bg-white/10 transition-all border border-white/[0.07]"
        aria-label="Close"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
      </Link>

      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-6 hover:opacity-80 transition-opacity">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-900/60">
              <span className="text-white font-bold text-sm">AP</span>
            </div>
            <span className="text-white font-bold text-xl tracking-tight">AutoPilot</span>
          </Link>

          {planInfo ? (
            <div>
              <h1 className="text-2xl font-bold text-white">Create your account</h1>
              <div className="mt-3 inline-flex items-center gap-2 bg-indigo-950/70 border border-indigo-800/40 rounded-full px-4 py-1.5">
                <span className="text-gray-500 text-sm">Selected plan:</span>
                <span className={`text-sm font-bold ${planInfo.color}`}>{planInfo.name}</span>
                <span className="text-gray-600 text-sm">{planInfo.price}</span>
              </div>
              <p className="text-gray-600 text-xs mt-2">You&apos;ll enter payment after creating your account</p>
            </div>
          ) : (
            <div>
              <h1 className="text-2xl font-bold text-white">Start your free account</h1>
              <p className="text-gray-500 mt-1">No credit card required</p>
            </div>
          )}
        </div>

        <div
          className="rounded-2xl border border-white/[0.08] p-8"
          style={{ background: "rgba(255,255,255,0.03)", backdropFilter: "blur(20px)" }}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Full name</label>
              <input
                name="name"
                type="text"
                required
                placeholder="Jane Smith"
                className="w-full px-4 py-2.5 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:ring-1 transition border"
                style={{ background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.1)" }}
                onFocus={e => e.currentTarget.style.borderColor = "rgba(99,102,241,0.6)"}
                onBlur={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Email</label>
              <input
                name="email"
                type="email"
                required
                placeholder="you@example.com"
                className="w-full px-4 py-2.5 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:ring-1 transition border"
                style={{ background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.1)" }}
                onFocus={e => e.currentTarget.style.borderColor = "rgba(99,102,241,0.6)"}
                onBlur={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Password</label>
              <input
                name="password"
                type="password"
                required
                minLength={8}
                placeholder="Min 8 characters"
                className="w-full px-4 py-2.5 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:ring-1 transition border"
                style={{ background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.1)" }}
                onFocus={e => e.currentTarget.style.borderColor = "rgba(99,102,241,0.6)"}
                onBlur={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"}
              />
            </div>

            {error && (
              <div className="bg-red-950/40 border border-red-800/50 rounded-lg px-4 py-3 text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold rounded-xl transition-colors shadow-xl shadow-indigo-900/40 text-sm"
            >
              {loading
                ? planInfo ? "Creating account..." : "Creating account..."
                : planInfo ? `Create account & continue to payment` : "Create free account"}
            </button>
          </form>

          {planInfo && (
            <p className="mt-4 text-center text-xs text-gray-700">
              You&apos;ll be taken to Stripe&apos;s secure checkout page to enter your card
            </p>
          )}

          <p className="mt-5 text-center text-sm text-gray-600">
            Already have an account?{" "}
            <Link href="/login" className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" style={{ background: "#050810" }} />}>
      <SignupForm />
    </Suspense>
  )
}
