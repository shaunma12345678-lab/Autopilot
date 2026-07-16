// Shared auth for the Content Engine API routes.

import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? ""   // no fallback: unset env disables admin access

export async function contentAuth(request: NextRequest): Promise<boolean> {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) return true
  return ADMIN_PASSWORD.length > 0 && request.headers.get("x-admin-password") === ADMIN_PASSWORD
}
