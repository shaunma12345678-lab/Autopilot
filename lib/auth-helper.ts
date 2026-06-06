// Shared helper — returns authenticated user or falls back to the first
// user in the DB. This allows admin direct access without a login session.
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"

export async function getSessionOrAdminUser(): Promise<{ id: string } | null> {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) return user

    const dbUser = await prisma.user.findFirst({ select: { id: true } })
    return dbUser ?? null
  } catch {
    return null
  }
}
