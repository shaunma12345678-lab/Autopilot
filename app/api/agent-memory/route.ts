import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { getMemory, setMemory } from "@/lib/memory"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const agentSlug = searchParams.get("agentSlug") ?? "general"

  try {
    const business = await prisma.business.findFirst({  })
    if (!business) return Response.json({ memory: [] })
    const memory = await getMemory(business.id, agentSlug)
    return Response.json({ memory })
  } catch (err) {
    console.error("[agent-memory GET]", err)
    return Response.json({ error: "Failed" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { agentSlug, entries } = await request.json()
    if (!agentSlug || !Array.isArray(entries)) {
      return Response.json({ error: "agentSlug and entries[] required" }, { status: 400 })
    }

    const business = await prisma.business.findFirst({  })
    if (!business) return Response.json({ error: "No business" }, { status: 404 })

    await setMemory(business.id, agentSlug, entries)
    return Response.json({ ok: true })
  } catch (err) {
    console.error("[agent-memory POST]", err)
    return Response.json({ error: "Failed" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const agentSlug = searchParams.get("agentSlug")
  const key       = searchParams.get("key")

  try {
    const business = await prisma.business.findFirst({  })
    if (!business) return Response.json({ ok: true })

    await prisma.agentMemory.deleteMany({
      where: {
        businessId: business.id,
        ...(agentSlug ? { agentSlug } : {}),
        ...(key       ? { key }       : {}),
      },
    })
    return Response.json({ ok: true })
  } catch (err) {
    console.error("[agent-memory DELETE]", err)
    return Response.json({ error: "Failed" }, { status: 500 })
  }
}
