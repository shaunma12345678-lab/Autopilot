import { createSupabaseServerClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import ExchangeMatcher from "@/components/dashboard/ExchangeMatcher"

export const metadata = {
  title: "1031 Exchange Matching | Autopilot",
}

export default async function ExchangePage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">1031 Exchange Matching</h1>
        <p className="text-gray-400 mt-1 text-sm">
          A 1031 exchange seller has a hard 45-day identification deadline and 180-day closing deadline
          (IRS rule). Track theirs and match your existing lead inventory against their criteria before
          the clock runs out.
        </p>
      </div>

      <ExchangeMatcher />
    </div>
  )
}
