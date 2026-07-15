import { NextRequest } from "next/server"
import { runAgent } from "@/lib/claude"
import { BOS_AGENT_BY_SLUG } from "@/lib/bos-registry"

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? ""   // no fallback: unset env disables admin access

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { password, agentSlug, input } = body as { password: string; agentSlug: string; input?: string }

    if (!ADMIN_PASSWORD || password !== ADMIN_PASSWORD) {
      return Response.json({ error: "Invalid password" }, { status: 401 })
    }

    const agent = BOS_AGENT_BY_SLUG.get(agentSlug)
    if (!agent) {
      return Response.json({ error: `Unknown agent: ${agentSlug}` }, { status: 400 })
    }

    const userPrompt = input?.trim() || agent.defaultPrompt
    const start = Date.now()

    const result = await runAgent(agent.system, userPrompt, { jsonMode: true, maxTokens: 8096 })
    const elapsed = Date.now() - start

    return Response.json({
      agentSlug,
      agentName: agent.name,
      category: agent.category,
      result,
      elapsed,
      ranAt: new Date().toISOString(),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return Response.json({ error: msg }, { status: 500 })
  }
}
