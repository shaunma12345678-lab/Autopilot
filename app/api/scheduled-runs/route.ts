import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { runEnhancedAgent } from "@/lib/agent-runner"
import { BOS_AGENT_BY_SLUG } from "@/lib/bos-registry"

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const business = await prisma.business.findFirst({ where: { userId: user.id } })
    if (!business) return Response.json({ scheduledRuns: [] })

    const runs = await prisma.scheduledRun.findMany({
      where:   { businessId: business.id },
      orderBy: { agentName: "asc" },
    })
    return Response.json({ scheduledRuns: runs })
  } catch (err) {
    console.error("[scheduled-runs GET]", err)
    return Response.json({ error: "Failed" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const { agentSlug, agentName, cronExpression, notifyOnChange, changeThreshold } = await request.json()
    if (!agentSlug || !agentName) return Response.json({ error: "agentSlug and agentName required" }, { status: 400 })

    const business = await prisma.business.findFirst({ where: { userId: user.id } })
    if (!business) return Response.json({ error: "No business found" }, { status: 404 })

    const run = await prisma.scheduledRun.upsert({
      where:  { businessId_agentSlug: { businessId: business.id, agentSlug } },
      update: {
        enabled:         true,
        cronExpression:  cronExpression ?? "0 8 * * 1-5",
        notifyOnChange:  notifyOnChange ?? true,
        changeThreshold: changeThreshold ?? 25,
        updatedAt:       new Date(),
      },
      create: {
        businessId:      business.id,
        agentSlug,
        agentName,
        enabled:         true,
        cronExpression:  cronExpression ?? "0 8 * * 1-5",
        notifyOnChange:  notifyOnChange ?? true,
        changeThreshold: changeThreshold ?? 25,
      },
    })
    return Response.json({ scheduledRun: run })
  } catch (err) {
    console.error("[scheduled-runs POST]", err)
    return Response.json({ error: "Failed" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const { id, enabled, cronExpression, changeThreshold, notifyOnChange } = await request.json()
    if (!id) return Response.json({ error: "id required" }, { status: 400 })

    const business = await prisma.business.findFirst({ where: { userId: user.id } })
    if (!business) return Response.json({ error: "No business" }, { status: 404 })

    await prisma.scheduledRun.updateMany({
      where: { id, businessId: business.id },
      data:  {
        ...(enabled          !== undefined ? { enabled }          : {}),
        ...(cronExpression   !== undefined ? { cronExpression }   : {}),
        ...(changeThreshold  !== undefined ? { changeThreshold }  : {}),
        ...(notifyOnChange   !== undefined ? { notifyOnChange }   : {}),
      },
    })
    return Response.json({ ok: true })
  } catch (err) {
    console.error("[scheduled-runs PATCH]", err)
    return Response.json({ error: "Failed" }, { status: 500 })
  }
}

// POST ?action=run_now — manually trigger a scheduled agent and detect diff (#8)
export async function PUT(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const { id } = await request.json()
    if (!id) return Response.json({ error: "id required" }, { status: 400 })

    const business = await prisma.business.findFirst({ where: { userId: user.id } })
    if (!business) return Response.json({ error: "No business" }, { status: 404 })

    const scheduled = await prisma.scheduledRun.findFirst({ where: { id, businessId: business.id } })
    if (!scheduled) return Response.json({ error: "Not found" }, { status: 404 })

    const agentDef = BOS_AGENT_BY_SLUG.get(scheduled.agentSlug)
    if (!agentDef) return Response.json({ error: "Agent not found" }, { status: 404 })

    const result = await runEnhancedAgent(agentDef.system, agentDef.defaultPrompt, {
      businessId:   business.id,
      userId:       user.id,
      agentSlug:    scheduled.agentSlug,
      useReflection: true,
      useSearch:    true,
      useTools:     false,
      model:        "sonnet",
    })

    const newOutput = typeof result.output === "string"
      ? result.output
      : JSON.stringify(result.output)

    // Diff detection (#8)
    let changePct = 100
    let changed = true
    if (scheduled.lastOutput) {
      const prev   = scheduled.lastOutput.split(/\s+/)
      const curr   = newOutput.split(/\s+/)
      const union  = new Set([...prev, ...curr]).size
      const inter  = prev.filter(w => curr.includes(w)).length
      changePct = union > 0 ? Math.round(((union - inter) / union) * 100) : 0
      changed   = changePct >= scheduled.changeThreshold
    }

    await prisma.scheduledRun.update({
      where: { id },
      data:  { lastOutput: newOutput, lastRunAt: new Date(), lastChangePct: changePct },
    })

    return Response.json({ output: newOutput, changePct, changed, qualityScore: result.qualityScore })
  } catch (err) {
    console.error("[scheduled-runs PUT]", err)
    return Response.json({ error: "Failed" }, { status: 500 })
  }
}
