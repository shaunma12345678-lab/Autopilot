import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { isMissingTableError } from "@/lib/db-guard"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 200)

    const runs = await prisma.agentRun.findMany({
      where:   { userId: user.id },
      orderBy: { createdAt: "desc" },
      take:    limit,
      select: {
        id:          true,
        agentSlug:   true,
        agentName:   true,
        status:      true,
        durationMs:  true,
        errorMsg:    true,
        createdAt:   true,
        completedAt: true,
      },
    })

    const stats = {
      total:     await prisma.agentRun.count({ where: { userId: user.id } }),
      completed: await prisma.agentRun.count({ where: { userId: user.id, status: "COMPLETED" } }),
      failed:    await prisma.agentRun.count({ where: { userId: user.id, status: "FAILED" } }),
    }

    return Response.json({ runs, stats })
  } catch (err) {
    if (isMissingTableError(err)) return Response.json({ runs: [], stats: { total: 0, completed: 0, failed: 0 } })
    console.error("[activity GET]", err)
    return Response.json({ error: "Failed to fetch activity" }, { status: 500 })
  }
}
