import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

    const { id } = await params
    const body = await request.json()

    const business = await prisma.business.findFirst({
      where: { id, userId: user.id },
    })
    if (!business) return Response.json({ error: "Not found" }, { status: 404 })

    const brandVoice = {
      ...(business.brandVoice as Record<string, unknown>),
      tone: body.tone,
      targetAudience: body.targetAudience,
      emojiUsage: body.emojiUsage,
    }

    const updated = await prisma.business.update({
      where: { id },
      data: {
        name: body.name,
        type: body.type,
        description: body.description,
        location: body.location,
        phone: body.phone || null,
        website: body.website || null,
        brandVoice,
      },
    })

    return Response.json({ business: updated })
  } catch (err) {
    console.error("[businesses PATCH]", err)
    return Response.json({ error: "Failed to update business" }, { status: 500 })
  }
}
