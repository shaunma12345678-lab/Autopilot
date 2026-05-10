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
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    include: { businesses: { take: 1 } },
  })

  const business = dbUser?.businesses[0]
  const needsOnboarding = !business

  return (
    <div className="flex h-screen bg-gray-950 text-white overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 flex flex-col bg-gray-900 border-r border-gray-800">
        {/* Logo */}
        <div className="p-6 border-b border-gray-800">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">AP</span>
            </div>
            <span className="font-bold text-lg">AutoPilot</span>
          </Link>
          {business && (
            <div className="mt-3">
              <p className="text-xs text-gray-500 uppercase tracking-wide">
                Active business
              </p>
              <p className="text-sm font-medium text-white mt-0.5 truncate">
                {business.name}
              </p>
              <span className="inline-block text-xs bg-indigo-900/50 text-indigo-400 border border-indigo-800 rounded-full px-2 py-0.5 mt-1">
                {dbUser?.plan ?? "FREE"}
              </span>
            </div>
          )}
        </div>

        {/* Nav — client component for active-link highlighting via usePathname */}
        <SidebarNav />

        {/* Footer */}
        <div className="p-4 border-t border-gray-800">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-sm font-bold">
              {dbUser?.name?.[0]?.toUpperCase() ?? "U"}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">
                {dbUser?.name ?? "User"}
              </p>
              <p className="text-xs text-gray-500 truncate">{dbUser?.email}</p>
            </div>
          </div>
          <form action={signOut}>
            <button
              type="submit"
              className="w-full text-left text-xs text-gray-500 hover:text-gray-300 transition px-1 py-1"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        {needsOnboarding ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-sm">
              <h2 className="text-xl font-bold mb-2">Set up your business</h2>
              <p className="text-gray-400 mb-6 text-sm">
                You need to complete onboarding before accessing the dashboard.
              </p>
              <Link
                href="/onboarding"
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg font-semibold transition"
              >
                Start Onboarding
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
