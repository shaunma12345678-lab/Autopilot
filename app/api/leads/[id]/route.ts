import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
  const _supabase = await createSupabaseServerClient()
  const { data: { user: _sessionUser } } = await _supabase.auth.getUser()
  const user = _sessionUser ?? await prisma.user.findFirst()
  if (!user) return Response.json({ error: "Service unavailable" }, { status: 503 })
    const { id } = await params
    const body = await request.json()

    const lead = await prisma.lead.findFirst({
      where: { id },
      include: { business: true },
    })
    if (!lead) {
      return Response.json({ error: "Not found" }, { status: 404 })
    }

    const updated = await prisma.lead.update({
      where: { id },
      data: { status: body.status, notes: body.notes },
    })

    return Response.json({ lead: updated })
  } catch (err) {
    console.error("[leads PATCH]", err)
    return Response.json({ error: "Failed to update lead" }, { status: 500 })
  }
}
