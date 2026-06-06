import { createSupabaseServerClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

export default async function Page() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Logged-in users go straight to dashboard — no marketing page
  if (user) redirect("/dashboard")

  return (
    <iframe
      src="/experience.html"
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        border: "none",
        display: "block",
      }}
      title="Autopilot"
    />
  )
}
