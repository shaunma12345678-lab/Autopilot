import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"

// GET — conversation with messages
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  try {
    const conversation = await prisma.conversation.findFirst({
      where:   { id, userId: user.id },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    })
    if (!conversation) return Response.json({ error: "Not found" }, { status: 404 })
    return Response.json({ conversation })
  } catch (err) {
    console.error("[conversations/:id GET]", err)
    return Response.json({ error: "Failed" }, { status: 500 })
  }
}

// PATCH — rename / pin / unpin
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  try {
    const body = await request.json()
    const conversation = await prisma.conversation.updateMany({
      where: { id, userId: user.id },
      data:  {
        ...(body.title  !== undefined ? { title:  body.title }  : {}),
        ...(body.pinned !== undefined ? { pinned: body.pinned } : {}),
      },
    })
    return Response.json({ ok: true, count: conversation.count })
  } catch (err) {
    console.error("[conversations/:id PATCH]", err)
    return Response.json({ error: "Failed" }, { status: 500 })
  }
}

// DELETE — delete conversation
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  try {
    await prisma.conversation.deleteMany({ where: { id, userId: user.id } })
    return Response.json({ ok: true })
  } catch (err) {
    console.error("[conversations/:id DELETE]", err)
    return Response.json({ error: "Failed" }, { status: 500 })
  }
}
