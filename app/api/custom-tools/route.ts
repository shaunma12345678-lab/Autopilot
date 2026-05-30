import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"

export async function GET(_: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const tools = await prisma.customTool.findMany({
      where:   { userId: user.id },
      orderBy: { createdAt: "desc" },
    })
    return Response.json({ tools })
  } catch (err) {
    console.error("[custom-tools GET]", err)
    return Response.json({ error: "Failed" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const { name, description, toolType, config, inputSchema } = await request.json()
    if (!name?.trim() || !description?.trim()) {
      return Response.json({ error: "name and description required" }, { status: 400 })
    }

    const tool = await prisma.customTool.create({
      data: {
        userId:      user.id,
        name:        name.trim().replace(/\s+/g, "_"),
        description: description.trim(),
        toolType:    toolType ?? "webhook",
        config:      config ?? {},
        inputSchema: inputSchema ?? {},
      },
    })
    return Response.json({ tool })
  } catch (err) {
    console.error("[custom-tools POST]", err)
    return Response.json({ error: "Failed to create tool" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const { id, ...updates } = await request.json()
    if (!id) return Response.json({ error: "id required" }, { status: 400 })

    const tool = await prisma.customTool.updateMany({
      where: { id, userId: user.id },
      data:  {
        ...(updates.name        !== undefined ? { name:        updates.name.trim().replace(/\s+/g, "_") } : {}),
        ...(updates.description !== undefined ? { description: updates.description }                      : {}),
        ...(updates.config      !== undefined ? { config:      updates.config }                           : {}),
        ...(updates.enabled     !== undefined ? { enabled:     updates.enabled }                          : {}),
      },
    })
    return Response.json({ ok: true, count: tool.count })
  } catch (err) {
    console.error("[custom-tools PATCH]", err)
    return Response.json({ error: "Failed" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get("id")
  if (!id) return Response.json({ error: "id required" }, { status: 400 })

  try {
    await prisma.customTool.deleteMany({ where: { id, userId: user.id } })
    return Response.json({ ok: true })
  } catch (err) {
    console.error("[custom-tools DELETE]", err)
    return Response.json({ error: "Failed" }, { status: 500 })
  }
}
