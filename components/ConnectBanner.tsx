"use client"

import { useState, useEffect } from "react"
import Link from "next/link"

export type Provider =
  | "gmail"
  | "google"
  | "facebook"
  | "linkedin"
  | "buffer"
  | "twilio"
  | "stripe"
  | "hubspot"
  | "yelp"

const CONFIG: Record<Provider, {
  name:    string
  logo:    string
  color:   string        // tailwind colour key
  what:    string        // what this enables on THIS page
}> = {
  gmail:    { name: "Gmail",              logo: "📧", color: "red",    what: "Send emails directly from your Gmail address" },
  google:   { name: "Google",             logo: "🔵", color: "blue",   what: "Access Google reviews and Google Business" },
  facebook: { name: "Facebook/Instagram", logo: "📘", color: "blue",   what: "Post content to your Facebook Page and Instagram" },
  linkedin: { name: "LinkedIn",           logo: "💼", color: "cyan",   what: "Publish posts to your LinkedIn profile or company page" },
  buffer:   { name: "Buffer",             logo: "📅", color: "orange", what: "Schedule posts across all your social channels" },
  twilio:   { name: "Twilio",             logo: "📱", color: "red",    what: "Send SMS campaigns to your customers" },
  stripe:   { name: "Stripe",             logo: "💳", color: "violet", what: "Read your Stripe revenue and payment data" },
  hubspot:  { name: "HubSpot",            logo: "🧡", color: "orange", what: "Sync leads and contacts with HubSpot" },
  yelp:     { name: "Yelp",              logo: "⭐", color: "red",    what: "Monitor and respond to your Yelp reviews" },
}

const BORDER: Record<string, string> = {
  red:    "border-red-800/40 bg-red-950/20",
  blue:   "border-blue-800/40 bg-blue-950/20",
  cyan:   "border-cyan-800/40 bg-cyan-950/20",
  orange: "border-orange-800/40 bg-orange-950/20",
  violet: "border-violet-800/40 bg-violet-950/20",
}

const BTN: Record<string, string> = {
  red:    "bg-red-600 hover:bg-red-500",
  blue:   "bg-blue-600 hover:bg-blue-500",
  cyan:   "bg-cyan-700 hover:bg-cyan-600",
  orange: "bg-orange-600 hover:bg-orange-500",
  violet: "bg-violet-600 hover:bg-violet-500",
}

interface Props {
  provider:   Provider
  /** Extra line shown below the main description */
  detail?:    string
  /** Rendered only when the account IS connected */
  children?:  React.ReactNode
}

/**
 * Drop this at the top of any automation page.
 * - Not connected → shows a "Connect [Provider]" banner
 * - Connected     → renders `children` (or a compact green badge)
 */
export function ConnectBanner({ provider, detail, children }: Props) {
  const [status, setStatus] = useState<"loading" | "connected" | "disconnected">("loading")
  const [accountEmail, setAccountEmail] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/integrations")
      .then(r => r.json())
      .then((data: { accounts?: Array<{ provider: string; accountEmail: string | null }> }) => {
        const match = data.accounts?.find(a => a.provider === provider)
        if (match) {
          setAccountEmail(match.accountEmail)
          setStatus("connected")
        } else {
          setStatus("disconnected")
        }
      })
      .catch(() => setStatus("disconnected"))
  }, [provider])

  const cfg = CONFIG[provider]

  if (status === "loading") {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-600 mb-6">
        <span className="w-3 h-3 border border-gray-700 border-t-transparent rounded-full animate-spin" />
        Checking connection…
      </div>
    )
  }

  if (status === "connected") {
    return (
      <>
        {/* Connected badge */}
        <div className="flex items-center gap-2 mb-5 bg-emerald-950/20 border border-emerald-800/30 rounded-xl px-4 py-2.5 w-fit">
          <span className="text-base">{cfg.logo}</span>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-emerald-400">{cfg.name} connected</span>
              {accountEmail && <span className="text-xs text-gray-400">{accountEmail}</span>}
            </div>
          </div>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 ml-1" />
          <Link href="/integrations" className="text-xs text-gray-600 hover:text-gray-400 transition ml-2">
            Manage →
          </Link>
        </div>
        {children}
      </>
    )
  }

  // Not connected
  const border = BORDER[cfg.color] ?? BORDER.blue
  const btn    = BTN[cfg.color] ?? BTN.blue

  return (
    <div className={`border rounded-2xl p-5 mb-6 flex items-start gap-4 ${border}`}>
      <div className="text-2xl mt-0.5 flex-shrink-0">{cfg.logo}</div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-white text-sm">Connect {cfg.name} to use this feature</p>
        <p className="text-sm text-gray-400 mt-0.5">{cfg.what}</p>
        {detail && <p className="text-xs text-gray-500 mt-1">{detail}</p>}
      </div>
      <Link
        href="/integrations"
        className={`flex-shrink-0 text-sm font-bold text-white px-4 py-2 rounded-xl transition ${btn}`}
      >
        Connect {cfg.name}
      </Link>
    </div>
  )
}

/** Lightweight hook — returns connected account info for a provider */
export function useConnection(provider: Provider) {
  const [connected, setConnected] = useState<boolean | null>(null)
  const [accountEmail, setAccountEmail] = useState<string | null>(null)
  const [metadata, setMetadata] = useState<Record<string, unknown>>({})

  useEffect(() => {
    fetch("/api/integrations")
      .then(r => r.json())
      .then((data: { accounts?: Array<{ provider: string; accountEmail: string | null; metadata?: Record<string, unknown> }> }) => {
        const match = data.accounts?.find(a => a.provider === provider)
        if (match) {
          setConnected(true)
          setAccountEmail(match.accountEmail)
          setMetadata(match.metadata ?? {})
        } else {
          setConnected(false)
        }
      })
      .catch(() => setConnected(false))
  }, [provider])

  return { connected, accountEmail, metadata, loading: connected === null }
}
