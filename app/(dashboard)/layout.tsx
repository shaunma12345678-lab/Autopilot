import { createSupabaseServerClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import Link from "next/link"
import { signOut } from "@/app/actions/auth"
import { SidebarNav } from "./sidebar-nav"
import AIHelperWidget from "@/components/AIHelperWidget"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Get user record — session if available, otherwise first DB user (admin direct access).
  // IMPORTANT: never use include:{businesses} here — the custom Supabase REST client
  // silently ignores `include` and returns no related rows. Query business separately.
  const dbUser = user
    ? await prisma.user.findUnique({ where: { id: user.id } })
    : await prisma.user.findFirst()

  // Separate query — not via include
  let business = dbUser
    ? await prisma.business.findFirst({ where: { userId: dbUser.id } })
    : null

  // Auto-create a default business on first visit so the admin never sees the onboarding gate
  if (dbUser && !business) {
    try {
      business = await prisma.business.create({
        data: {
          userId:         dbUser.id,
          name:           (dbUser as { name?: string }).name ?? "My Business",
          type:           "Other",
          description:    "",
          location:       "",
          brandVoice:     {},
          socialProfiles: {},
          activeAgents:   [],
        },
      })
    } catch {
      // If creation fails (e.g. already exists from a race), try fetching again
      business = await prisma.business.findFirst({ where: { userId: dbUser.id } })
    }
  }

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
          <Link href="/foreclosure-leads" className="flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-900/40">
              <span className="text-white font-bold text-xs">AP</span>
            </div>
            <div>
              <span className="font-bold text-white text-sm tracking-tight">AutoPilot</span>
              <p className="text-[10px] text-gray-500 -mt-0.5 tracking-wide">AI BUSINESS ENGINE</p>
            </div>
          </Link>

          {business && (
            <div className="bg-gray-800/40 border border-gray-700/40 rounded-xl px-3 py-2.5">
              <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-0.5">Active Business</p>
              <p className="text-sm font-semibold text-white truncate">{business.name}</p>
              <span className={`inline-block text-[10px] font-bold border rounded-full px-2 py-0.5 mt-1.5 tracking-wide ${planColor}`}>
                {planLabel}
              </span>
            </div>
          )}
        </div>

        {/* Nav */}
        <SidebarNav />

        {/* User footer */}
        <div className="px-4 py-4 border-t border-gray-800/60 bg-[#0c0c0e]">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-xs font-bold shadow">
              {dbUser?.name?.[0]?.toUpperCase() ?? "A"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-white truncate">{dbUser?.name ?? "Admin"}</p>
              <p className="text-[10px] text-gray-500 truncate">{dbUser?.email ?? ""}</p>
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

      {/* ── Main content — always render children, no onboarding intercept ── */}
      <main className="flex-1 overflow-y-auto bg-[#0f0f12]">
        {children}
      </main>

      {/* Always-available AI helper (auth: the signed-in session cookie). */}
      <AIHelperWidget
        endpoint="/api/voice"
        title="AutoPilot Assistant"
        intro="Ask anything about your business or the platform — deal math worked step by step, outreach scripts, or where to find a feature. Full written answers."
        placeholder="Ask me anything…"
        suggestions={[
          "What can this platform do for me?",
          "Explain the 70% rule with an example",
          "How do I find cash buyers?",
        ]}
      />
    </div>
  )
}
