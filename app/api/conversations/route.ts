import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"

async function resolveUser() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user ?? await prisma.user.findFirst()
}

// GET — list conversations for agent (or all)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const agentSlug = searchParams.get("agentSlug")
  const limit     = parseInt(searchParams.get("limit") ?? "50")

  try {
    const user = await resolveUser()
    const conversations = await prisma.conversation.findMany({
      where:   { ...(user ? { userId: user.id } : {}), ...(agentSlug ? { agentSlug } : {}) },
      orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
      take:    limit,
      include: { messages: { take: 1, orderBy: { createdAt: "asc" }, select: { content: true, role: true } } },
    })
    return Response.json({ conversations })
  } catch (err) {
    console.error("[conversations GET]", err)
    return Response.json({ error: "Failed to load conversations" }, { status: 500 })
  }
}

// POST — create conversation
export async function POST(request: NextRequest) {
  try {
    const user = await resolveUser()
    const { agentSlug, agentName, businessId, title } = await request.json()
    if (!agentSlug || !agentName) return Response.json({ error: "agentSlug and agentName required" }, { status: 400 })

    const conversation = await prisma.conversation.create({
      data: { userId: user?.id ?? "", agentSlug, agentName, businessId: businessId ?? null, title: title ?? "New Chat" },
    })
    return Response.json({ conversation })
  } catch (err) {
    console.error("[conversations POST]", err)
    return Response.json({ error: "Failed to create conversation" }, { status: 500 })
  }
}
