// GET /api/entities — portfolio operators (owners with 2+ distressed
// properties in the accumulated signal history), ranked by portfolio size.

import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const limit = Math.min(Number(searchParams.get("limit") ?? 25), 50)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entities = await (prisma.entity as any).findMany({
      where: { propertyCount: { gte: 2 } },
      orderBy: { propertyCount: "desc" },
      take: limit,
    })

    const entityIds = entities.map((e: { id: string }) => e.id)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const properties = entityIds.length > 0 ? await (prisma.entityProperty as any).findMany({
      where: { entityId: { in: entityIds } },
    }) : []

    const propsByEntity = new Map<string, unknown[]>()
    for (const p of properties as Array<{ entityId: string }>) {
      const arr = propsByEntity.get(p.entityId) ?? []
      arr.push(p)
      propsByEntity.set(p.entityId, arr)
    }

    const enriched = entities.map((e: { id: string }) => ({ ...e, properties: propsByEntity.get(e.id) ?? [] }))

    return Response.json({ entities: enriched, total: enriched.length })
  } catch (err) {
    console.error("[entities GET]", err)
    return Response.json({ error: "Failed to fetch entities" }, { status: 500 })
  }
}
