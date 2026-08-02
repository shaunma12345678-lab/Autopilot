// Shared auth gate for the markets API routes.
//
// Follows the precedent already established in app/api/leads/analyze-address:
// a signed-in Supabase user is authorized, and so is a caller presenting the
// admin password header. That second path is what lets the internal admin
// console (which authenticates by password, not Supabase session) use the same
// endpoints as the customer dashboard without duplicating them.
import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? ""   // no fallback: unset env disables the admin path

export async function isMarketsAuthorized(request: NextRequest): Promise<boolean> {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) return true
  } catch {
    // Supabase unreachable or no session — fall through to the admin header
  }
  return ADMIN_PASSWORD.length > 0 && request.headers.get("x-admin-password") === ADMIN_PASSWORD
}
