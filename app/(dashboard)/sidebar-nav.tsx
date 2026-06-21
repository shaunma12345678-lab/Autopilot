"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

type NavItem  = { href: string; label: string; icon: string }
type NavGroup = { label: string; items: NavItem[] }

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: "▦" },
    ],
  },
  {
    label: "Revenue",
    items: [
      { href: "/content",         label: "Content",         icon: "✎" },
      { href: "/leads",           label: "Leads",           icon: "◎" },
      { href: "/ads",             label: "Ad Copy",         icon: "📢" },
      { href: "/email-marketing", label: "Email Marketing", icon: "✉" },
      { href: "/referral",        label: "Referral",        icon: "🤝" },
      { href: "/seo",             label: "SEO",             icon: "🔎" },
    ],
  },
  {
    label: "Sales & Closing",
    items: [
      { href: "/sales",         label: "Sales Scripts",  icon: "📞" },
      { href: "/pricing",       label: "Pricing",        icon: "💲" },
      { href: "/business-plan", label: "Business Plan",  icon: "📋" },
    ],
  },
  {
    label: "Real Estate",
    items: [
      { href: "/foreclosure-leads", label: "Pre-Foreclosure Leads", icon: "🏚" },
      { href: "/foreclosure-leads?tab=early-warning", label: "Early Warning",         icon: "⚡" },
      { href: "/agents",            label: "Agent Health",           icon: "🛰" },
    ],
  },
  {
    label: "Customers",
    items: [
      { href: "/reputation",  label: "Reputation",  icon: "★" },
      { href: "/review-gen",  label: "Get Reviews", icon: "⭐" },
      { href: "/retention",   label: "Retention",   icon: "♻" },
      { href: "/support",     label: "Support",     icon: "💬" },
      { href: "/competitors", label: "Competitors", icon: "🔍" },
    ],
  },
  {
    label: "Finance & Ops",
    items: [
      { href: "/reports",          label: "Reports",         icon: "▤" },
      { href: "/expenses",         label: "Expenses",        icon: "📊" },
      { href: "/cashflow",         label: "Cash Flow",       icon: "💰" },
      { href: "/profit-maximizer", label: "Profit Max",      icon: "📈" },
      { href: "/tax-strategy",     label: "Tax Strategy",    icon: "🏛️" },
      { href: "/invoicing",        label: "Invoicing",       icon: "🧾" },
      { href: "/funding",          label: "Funding",         icon: "🏦" },
      { href: "/stripe-intel",     label: "Stripe Intel",    icon: "💳" },
      { href: "/operations",       label: "Operations",      icon: "⚙" },
      { href: "/hiring",           label: "Hiring",          icon: "👥" },
      { href: "/legal",            label: "Legal Docs",      icon: "⚖" },
    ],
  },
  {
    label: "AI Chat",
    items: [
      { href: "/chat/financial-command-center", label: "Finance AI",      icon: "💬" },
      { href: "/chat/content-factory",           label: "Content AI",      icon: "💬" },
      { href: "/chat/lead-qualifier",            label: "Sales AI",        icon: "💬" },
      { href: "/chat/seo-monitor",               label: "SEO AI",          icon: "💬" },
      { href: "/chat/competitive-intel",         label: "Competitor AI",   icon: "💬" },
      { href: "/chat/operations-agent",          label: "Operations AI",   icon: "💬" },
    ],
  },
  {
    label: "Automations",
    items: [
      { href: "/integrations",  label: "Integrations",    icon: "🔌" },
      { href: "/scheduled",     label: "Scheduled Runs",  icon: "🕐" },
      { href: "/tools",         label: "Agent Tools",     icon: "⚡" },
      { href: "/meta-poster",   label: "Meta Poster",     icon: "📱" },
      { href: "/linkedin",      label: "LinkedIn",        icon: "💼" },
      { href: "/buffer-poster", label: "Buffer Scheduler",icon: "📅" },
      { href: "/sms",           label: "SMS Campaigns",   icon: "💬" },
    ],
  },
  {
    label: "Monitoring",
    items: [
      { href: "/activity", label: "Agent Activity", icon: "⚡" },
    ],
  },
  {
    label: "Account",
    items: [
      { href: "/settings", label: "Settings", icon: "⚙" },
      { href: "/billing",  label: "Billing",  icon: "◈" },
    ],
  },
]

const TOTAL_AGENTS = NAV_GROUPS
  .flatMap(g => g.items)
  .filter(i => i.href !== "/dashboard" && i.href !== "/settings" && i.href !== "/billing").length

export function SidebarNav() {
  const pathname = usePathname()

  return (
    <nav className="flex-1 py-3 px-2.5 space-y-5 overflow-y-auto scrollbar-thin">
      {/* Agent count badge */}
      <div className="mx-1 bg-gradient-to-r from-indigo-950/60 to-violet-950/60 border border-indigo-800/30 rounded-xl px-3 py-2.5 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-white">{TOTAL_AGENTS} AI Agents</p>
          <p className="text-xs text-indigo-400 mt-0.5">All systems active</p>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs text-emerald-400">Live</span>
        </div>
      </div>

      {NAV_GROUPS.map(group => (
        <div key={group.label}>
          <p className="text-[10px] font-bold text-gray-600 uppercase tracking-[0.12em] px-2.5 mb-1.5">
            {group.label}
          </p>
          <div className="space-y-0.5">
            {group.items.map(item => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-all duration-100 group ${
                    isActive
                      ? "bg-indigo-600/90 text-white shadow-sm shadow-indigo-900/50"
                      : "text-gray-400 hover:text-white hover:bg-gray-800/80"
                  }`}
                >
                  <span className={`text-sm flex-shrink-0 transition-transform duration-100 ${
                    isActive ? "text-white scale-110" : "group-hover:scale-110 group-hover:text-indigo-400"
                  }`}>
                    {item.icon}
                  </span>
                  <span className="truncate">{item.label}</span>
                  {isActive && (
                    <span className="ml-auto w-1 h-4 rounded-full bg-white/40" />
                  )}
                </Link>
              )
            })}
          </div>
        </div>
      ))}
    </nav>
  )
}
