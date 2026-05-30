// Service-role Supabase client — bypasses RLS, works through REST API (IPv4 port 443)
// Use this everywhere instead of prisma when running on Vercel (IPv6 DB unreachable)
import { createClient } from "@supabase/supabase-js"

let _admin: ReturnType<typeof createClient> | undefined

export function getAdminClient() {
  if (!_admin) {
    _admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    )
  }
  return _admin
}
