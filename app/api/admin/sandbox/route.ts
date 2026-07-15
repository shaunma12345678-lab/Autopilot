import { NextRequest } from "next/server"
import { runAgent } from "@/lib/claude"

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? ""   // no fallback: unset env disables admin access

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { password, agentId, systemPrompt, userPrompt, jsonMode } = body

  if (!ADMIN_PASSWORD || password !== ADMIN_PASSWORD) {
    return Response.json({ error: "Invalid password" }, { status: 401 })
  }

  if (!systemPrompt || !userPrompt) {
    return Response.json({ error: "systemPrompt and userPrompt are required" }, { status: 400 })
  }

  const start = Date.now()

  try {
    const result = await runAgent(systemPrompt, userPrompt, { jsonMode: !!jsonMode, maxTokens: 4000 })
    const elapsed = Date.now() - start

    return Response.json({
      agentId,
      result,
      elapsed,
      isJson: !!jsonMode,
    })
  } catch (err) {
    const elapsed = Date.now() - start
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message, elapsed }, { status: 500 })
  }
}
