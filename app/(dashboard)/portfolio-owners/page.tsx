import { createSupabaseServerClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import PortfolioOwnerCard from "@/components/dashboard/PortfolioOwnerCard"

export const metadata = {
  title: "Portfolio Operators | Autopilot",
}

export default async function PortfolioOwnersPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Portfolio Operators</h1>
        <p className="text-gray-400 mt-1 text-sm">
          Entity-resolved owners with multiple distressed properties across San Diego, Riverside, San
          Bernardino, and Orange County — residential and commercial combined. Grouped by exact
          normalized owner name; fuzzy alias matching (name variants) is a documented next step.
        </p>
      </div>

      <PortfolioOwnerCard />
    </div>
  )
}
