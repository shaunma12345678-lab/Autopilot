// Tool Use (#10) — built-in tools + custom webhook tools
// Claude calls these during generation; we execute them and feed results back.

import Anthropic from "@anthropic-ai/sdk"
import { prisma } from "@/lib/prisma"
import { webSearch } from "@/lib/search"

export type ToolResult = { toolUseId: string; content: string }

// ── Built-in tool definitions ─────────────────────────────────────────────────

export const BUILT_IN_TOOLS: Anthropic.Tool[] = [
  {
    name: "web_search",
    description: "Search the web for current information, prices, news, competitors, or market data. Use when the user asks about anything time-sensitive or external.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "The search query" },
        max_results: { type: "number", description: "Number of results (1-10, default 5)" },
      },
      required: ["query"],
    },
  },
  {
    name: "create_lead",
    description: "Save a qualified lead to the CRM for follow-up.",
    input_schema: {
      type: "object" as const,
      properties: {
        name:   { type: "string", description: "Lead name" },
        email:  { type: "string", description: "Email address" },
        phone:  { type: "string", description: "Phone number" },
        source: { type: "string", description: "Lead source" },
        notes:  { type: "string", description: "Qualification notes" },
        score:  { type: "number", description: "Lead score 0-100" },
      },
      required: ["name", "source"],
    },
  },
  {
    name: "save_content",
    description: "Save generated content (social post, email, etc.) to the content queue for review.",
    input_schema: {
      type: "object" as const,
      properties: {
        type:     { type: "string", enum: ["SOCIAL_POST", "EMAIL", "SMS", "BLOG_POST", "AD_COPY"], description: "Content type" },
        platform: { type: "string", description: "Target platform" },
        body:     { type: "string", description: "Content body" },
        hashtags: { type: "array", items: { type: "string" }, description: "Hashtags (for social)" },
      },
      required: ["type", "body"],
    },
  },
  {
    name: "save_memory",
    description: "Save an important business fact to long-term memory so it can be recalled in future conversations.",
    input_schema: {
      type: "object" as const,
      properties: {
        key:   { type: "string", description: "Short identifier for the fact" },
        value: { type: "string", description: "The fact to remember" },
      },
      required: ["key", "value"],
    },
  },
  {
    name: "delegate_to_agent",
    description: "Delegate a subtask to a specialist agent and get their output. Use for complex tasks that benefit from multi-agent collaboration.",
    input_schema: {
      type: "object" as const,
      properties: {
        agentName: { type: "string", description: "Agent to delegate to (e.g. 'Financial Command Center', 'Content Factory')" },
        task:      { type: "string", description: "The specific task to delegate" },
      },
      required: ["agentName", "task"],
    },
  },
]

// ── Tool executor ─────────────────────────────────────────────────────────────

interface ExecutionContext {
  businessId?: string
  userId?:     string
  agentSlug?:  string
}

export async function executeTool(
  toolName: string,
  input:    Record<string, unknown>,
  ctx:      ExecutionContext = {}
): Promise<string> {
  switch (toolName) {
    case "web_search": {
      const { formatSearchResults } = await import("@/lib/search")
      const resp = await webSearch(input.query as string, (input.max_results as number) ?? 5)
      return formatSearchResults(resp) || "No results found."
    }

    case "create_lead": {
      if (!ctx.businessId) return "Error: no business context"
      try {
        const lead = await prisma.lead.create({
          data: {
            businessId: ctx.businessId,
            name:   input.name as string,
            email:  input.email as string | undefined,
            phone:  input.phone as string | undefined,
            source: input.source as string,
            notes:  input.notes as string | undefined,
            score:  (input.score as number) ?? 50,
          },
        })
        return `Lead created: ${lead.name} (ID: ${lead.id})`
      } catch (e) {
        return `Failed to create lead: ${e instanceof Error ? e.message : "unknown error"}`
      }
    }

    case "save_content": {
      if (!ctx.businessId) return "Error: no business context"
      try {
        const item = await prisma.content.create({
          data: {
            businessId: ctx.businessId,
            type:     input.type as "SOCIAL_POST" | "EMAIL" | "SMS" | "BLOG_POST" | "AD_COPY",
            platform: (input.platform as string) ?? "General",
            body:     input.body as string,
            hashtags: (input.hashtags as string[]) ?? [],
            status:   "PENDING",
          },
        })
        return `Content saved to queue (ID: ${item.id})`
      } catch (e) {
        return `Failed to save content: ${e instanceof Error ? e.message : "unknown error"}`
      }
    }

    case "save_memory": {
      if (!ctx.businessId || !ctx.agentSlug) return "Error: no context"
      try {
        const { setMemory } = await import("@/lib/memory")
        await setMemory(ctx.businessId, ctx.agentSlug, [{ key: input.key as string, value: input.value as string }])
        return `Memory saved: ${input.key}`
      } catch (e) {
        return `Failed to save memory: ${e instanceof Error ? e.message : "unknown error"}`
      }
    }

    case "delegate_to_agent": {
      const { BOS_AGENT_BY_SLUG } = await import("@/lib/bos-registry")
      const { runAgent } = await import("@/lib/claude")
      const agentName = input.agentName as string
      const task      = input.task as string
      const agent = [...BOS_AGENT_BY_SLUG.values()].find(a =>
        a.name.toLowerCase().includes(agentName.toLowerCase())
      )
      if (!agent) return `Agent "${agentName}" not found.`
      try {
        const result = await runAgent(agent.system, task, { maxTokens: 2048, model: "sonnet" })
        return typeof result === "string" ? result : JSON.stringify(result)
      } catch (e) {
        return `Delegation failed: ${e instanceof Error ? e.message : "unknown error"}`
      }
    }

    default: {
      // Try user custom tools (webhook)
      if (ctx.userId) {
        return await executeCustomTool(toolName, input, ctx.userId)
      }
      return `Unknown tool: ${toolName}`
    }
  }
}

async function executeCustomTool(
  toolName: string,
  input:    Record<string, unknown>,
  userId:   string
): Promise<string> {
  try {
    const tool = await prisma.customTool.findFirst({
      where: { userId, name: toolName, enabled: true },
    })
    if (!tool) return `Custom tool "${toolName}" not found.`

    const config = tool.config as Record<string, unknown>
    if (tool.toolType === "webhook" && config.webhookUrl) {
      const res = await fetch(config.webhookUrl as string, {
        method:  "POST",
        headers: { "Content-Type": "application/json", ...(config.headers as Record<string, string> ?? {}) },
        body:    JSON.stringify({ tool: toolName, input }),
      })
      if (!res.ok) return `Webhook returned ${res.status}`
      const text = await res.text()
      return text.slice(0, 1000)
    }

    return `Tool type "${tool.toolType}" not yet supported for execution.`
  } catch (e) {
    return `Custom tool error: ${e instanceof Error ? e.message : "unknown"}`
  }
}

// Build tool list: built-in + user's custom tools
export async function buildToolList(userId?: string): Promise<Anthropic.Tool[]> {
  const tools = [...BUILT_IN_TOOLS]
  if (!userId) return tools

  try {
    const custom = await prisma.customTool.findMany({
      where: { userId, enabled: true },
      take:  20,
    })
    for (const ct of custom) {
      const schema = ct.inputSchema as Record<string, unknown>
      tools.push({
        name:        ct.name.replace(/\s+/g, "_").toLowerCase(),
        description: ct.description,
        input_schema: Object.keys(schema).length > 0 ? schema as Anthropic.Tool["input_schema"] : {
          type: "object" as const,
          properties: { input: { type: "string", description: "Tool input" } },
          required: ["input"],
        },
      })
    }
  } catch { /* ignore */ }
  return tools
}
