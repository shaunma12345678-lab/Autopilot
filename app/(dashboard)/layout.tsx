import { createSupabaseServerClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import Link from "next/link"
import { signOut } from "@/app/actions/auth"
import { SidebarNav } from "./sidebar-nav"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Fall back to first user in DB for direct admin access (no login required)
  const dbUser = user
    ? await prisma.user.findUnique({ where: { id: user.id }, include: { businesses: { take: 1 } } })
    : await prisma.user.findFirst({ include: { businesses: { take: 1 } } })

  if (!dbUser) redirect("/onboarding")

  const business = dbUser?.businesses[0]
  const needsOnboarding = !business

  const planLabel = dbUser?.plan ?? "FREE"
  const planColors: Record<string, string> = {
    FREE:           "bg-gray-800 text-gray-400 border-gray-700",
    STARTER:        "bg-indigo-950/60 text-indigo-400 border-indigo-800/50",
    GROWTH:         "bg-violet-950/60 text-violet-400 border-violet-800/50",
    PRO:            "bg-amber-950/60 text-amber-400 border-amber-800/50",
    AGENCY_STARTER: "bg-teal-950/60 text-teal-400 border-teal-800/50",
    AGENCY_GROWTH:  "bg-cyan-950/60 text-cyan-400 border-cyan-800/50",
    AGENCY_PREMIUM: "bg-rose-950/60 text-rose-400 border-rose-800/50",
  }
  const planColor = planColors[planLabel] ?? planColors.FREE

  return (
    <div className="flex h-screen bg-gray-950 text-white overflow-hidden">

      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside className="w-60 flex-shrink-0 flex flex-col bg-[#0c0c0e] border-r border-gray-800/60">

        {/* Logo + business identity */}
        <div className="px-4 pt-5 pb-4 border-b border-gray-800/60">
          <Link href="/dashboard" className="flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-900/40">
              <span className="text-white font-bold text-xs">AP</span>
            </div>
            <div>
              <span className="font-bold text-white text-sm tracking-tight">AutoPilot</span>
              <p className="text-[10px] text-gray-500 -mt-0.5 tracking-wide">AI BUSINESS ENGINE</p>
            </div>
          </Link>

          {business ? (
            <div className="bg-gray-800/40 border border-gray-700/40 rounded-xl px-3 py-2.5">
              <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-0.5">Active Business</p>
              <p className="text-sm font-semibold text-white truncate">{business.name}</p>
              <span className={`inline-block text-[10px] font-bold border rounded-full px-2 py-0.5 mt-1.5 tracking-wide ${planColor}`}>
                {planLabel}
              </span>
            </div>
          ) : null}
        </div>

        {/* Nav */}
        <SidebarNav />

        {/* User footer */}
        <div className="px-4 py-4 border-t border-gray-800/60 bg-[#0c0c0e]">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-xs font-bold shadow">
              {dbUser?.name?.[0]?.toUpperCase() ?? "U"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-white truncate">{dbUser?.name ?? "User"}</p>
              <p className="text-[10px] text-gray-500 truncate">{dbUser?.email}</p>
            </div>
          </div>
          <form action={signOut}>
            <button
              type="submit"
              className="w-full text-left text-[11px] text-gray-600 hover:text-gray-400 transition px-1 py-1 rounded"
            >
              Sign out →
            </button>
          </form>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto bg-[#0f0f12]">
        {needsOnboarding ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-sm px-6">
              <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-lg shadow-indigo-900/40">
                <span className="text-2xl">🚀</span>
              </div>
              <h2 className="text-xl font-bold mb-2">Set up your business</h2>
              <p className="text-gray-400 mb-6 text-sm leading-relaxed">
                Complete a quick 2-minute onboarding so your AI agents know your business inside out.
              </p>
              <Link
                href="/onboarding"
                className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 rounded-xl font-semibold text-sm transition shadow-lg shadow-indigo-900/30"
              >
                Start Onboarding →
              </Link>
            </div>
          </div>
        ) : (
          children
        )}
      </main>
    </div>
  )
}
