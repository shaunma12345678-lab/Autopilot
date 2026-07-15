"use client"

// Admin Real Estate tab — the full ForeclosureSearch tool in admin mode (no
// Supabase sign-in required). Extracted from app/admin/page.tsx.

import { useEffect, useState } from "react"
import ForeclosureSearch from "@/components/dashboard/ForeclosureSearch"

export default function AdminRealEstate({ password }: { password: string }) {
  const [businessId, setBusinessId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/admin/foreclosure", { headers: { "x-admin-password": password } })
      .then(r => r.json())
      .then(d => { setBusinessId(d.businessId ?? "admin"); setLoading(false) })
      .catch(() => { setBusinessId("admin"); setLoading(false) })
  }, [password])

  if (loading) {
    return <div className="flex items-center gap-2 text-gray-500 text-sm py-8"><span className="w-4 h-4 border-2 border-gray-700 border-t-indigo-400 rounded-full animate-spin" />Loading tool…</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-bold text-white">🏚 Pre-Foreclosure Leads</h2>
        <span className="text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full">Admin mode — no sign-in required</span>
      </div>
      <ForeclosureSearch businessId={businessId!} adminPw={password} />
    </div>
  )
}
