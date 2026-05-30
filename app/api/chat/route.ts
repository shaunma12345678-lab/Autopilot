import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { runEnhancedAgent } from "@/lib/agent-runner"
import { BOS_AGENT_BY_SLUG } from "@/lib/bos-registry"

// Universal chat endpoint — powers every agent conversation (#7 #5 #1 #2 #3 #9 #10 #11 #13 #15)
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const body = await request.json()
    const {
      conversationId,
      message,
      agentSlug,
      agentName,
      businessId,
      systemPrompt,
      agentCategory,
      useReflection = true,
      useSearch     = true,
      useTools      = true,
    } = body

    if (!message?.trim()) return Response.json({ error: "message required" }, { status: 400 })

    // Resolve agent system prompt
    let resolvedSystem = systemPrompt as string | undefined
    if (!resolvedSystem && agentSlug) {
      const def = BOS_AGENT_BY_SLUG.get(agentSlug)
      resolvedSystem = def?.system
    }
    if (!resolvedSystem) {
      resolvedSystem = "You are an elite AI business advisor with deep expertise across strategy, operations, finance, and growth."
    }

    // Get or create conversation
    let convId = conversationId as string | undefined
    if (!convId) {
      const conv = await prisma.conversation.create({
        data: {
          userId:    user.id,
          agentSlug: agentSlug ?? "general",
          agentName: agentName ?? "AI Advisor",
          businessId: businessId ?? null,
          title:     message.trim().slice(0, 60),
        },
      })
      convId = conv.id
    } else {
      // Title the conversation from first message if still "New Chat"
      const existing = await prisma.conversation.findUnique({ where: { id: convId } })
      if (existing?.title === "New Chat" && existing.userId === user.id) {
        await prisma.conversation.update({
          where: { id: convId },
          data:  { title: message.trim().slice(0, 60) },
        })
      }
    }

    // Load conversation history
    const prevMessages = await prisma.message.findMany({
      where:   { conversationId: convId },
      orderBy: { createdAt: "asc" },
      take:    20,
    })

    const history = prevMessages
      .filter(m => m.role === "USER" || m.role === "ASSISTANT")
      .map(m => ({ role: (m.role === "USER" ? "user" : "assistant") as "user" | "assistant", content: m.content }))

    // Save user message
    await prisma.message.create({
      data: { conversationId: convId, role: "USER", content: message.trim() },
    })

    // Get business context
    let biz: { id: string; name: string; type: string; description: string; location: string; brandVoice: unknown } | null = null
    const resolvedBusinessId = businessId as string | undefined
    if (resolvedBusinessId) {
      biz = await prisma.business.findFirst({
        where: { id: resolvedBusinessId, userId: user.id },
        select: { id: true, name: true, type: true, description: true, location: true, brandVoice: true },
      })
    }
    if (!biz) {
      biz = await prisma.business.findFirst({
        where: { userId: user.id },
        select: { id: true, name: true, type: true, description: true, location: true, brandVoice: true },
      })
    }

    const businessContext = biz
      ? `\n\nBusiness: ${biz.name} (${biz.type}) · ${biz.location}${biz.description ? `\n${biz.description}` : ""}`
      : ""

    const start = Date.now()

    // Run the enhanced agent
    const result = await runEnhancedAgent(
      resolvedSystem + businessContext,
      message.trim(),
      {
        businessId:    biz?.id,
        userId:        user.id,
        agentSlug:     agentSlug ?? "general",
        agentCategory: agentCategory as string | undefined,
        useMemory:     true,
        useFewShot:    true,
        useSearch,
        useTools,
        useReflection,
        conversationHistory: history,
        model:         "sonnet",
        maxTokens:     4096,
      }
    )

    const elapsed = Date.now() - start
    const outputStr = typeof result.output === "string"
      ? result.output
      : JSON.stringify(result.output, null, 2)

    // Save assistant message
    const assistantMsg = await prisma.message.create({
      data: {
        conversationId: convId,
        role:           "ASSISTANT",
        content:        outputStr,
        qualityScore:   result.qualityScore ?? null,
        iterations:     result.iterations ?? 1,
        searchUsed:     result.searchUsed ?? false,
        toolsUsed:      result.toolsUsed ?? [],
        metadata:       { elapsed },
      },
    })

    // Touch conversation updatedAt
    await prisma.conversation.update({ where: { id: convId }, data: { updatedAt: new Date() } })

    return Response.json({
      conversationId: convId,
      message:        assistantMsg,
      output:         outputStr,
      qualityScore:   result.qualityScore,
      iterations:     result.iterations,
      searchUsed:     result.searchUsed,
      toolsUsed:      result.toolsUsed,
      elapsed,
    })
  } catch (err) {
    console.error("[chat]", err)
    return Response.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 })
  }
}
