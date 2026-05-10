"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: "▦" },
  { href: "/content", label: "Content", icon: "✎" },
  { href: "/reputation", label: "Reputation", icon: "★" },
  { href: "/leads", label: "Leads", icon: "◎" },
  { href: "/reports", label: "Reports", icon: "▤" },
  { href: "/settings", label: "Settings", icon: "⚙" },
  { href: "/billing", label: "Billing", icon: "◈" },
]

export function SidebarNav() {
  const pathname = usePathname()

  return (
    <nav className="flex-1 py-4 px-3 space-y-0.5 overflow-y-auto">
      {NAV_ITEMS.map((item) => {
        const isActive = pathname === item.href
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition group ${
              isActive
                ? "bg-indigo-600 text-white"
                : "text-gray-400 hover:text-white hover:bg-gray-800"
            }`}
          >
            <span
              className={`text-base transition ${
                isActive
                  ? "text-white"
                  : "group-hover:text-indigo-400"
              }`}
            >
              {item.icon}
            </span>
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
