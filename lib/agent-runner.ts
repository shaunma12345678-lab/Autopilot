// Enhanced Universal Agent Runner (#1 #2 #3 #9 #11 #13 #15)
// Combines: chain-of-thought, persona injection, memory, few-shot examples,
// web search, tool use, self-critique quality gate, agent delegation.

import Anthropic from "@anthropic-ai/sdk"
import { type AgentOptions, selectModel } from "@/lib/claude"
import { webSearch, formatSearchResults, shouldSearch } from "@/lib/search"
import { getMemory, formatMemory, getFewShotExamples, formatFewShotExamples, extractAndStoreMemory } from "@/lib/memory"
import { buildToolList, executeTool, type ToolResult } from "@/lib/tools"

let _anthropic: Anthropic | undefined
function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set")
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _anthropic
}

// Expert personas mapped to agent categories (#3)
const PERSONA_BY_CATEGORY: Record<string, string> = {
  Finance:           "You are Marcus Chen, a CFO with 22 years at Goldman Sachs and three successful IPOs. You think in cash flow, probability, and fiduciary duty. You never give vague financial advice.",
  Sales:             "You are Jordan Rivera, a VP of Sales who has closed $400M+ in B2B deals. You understand objection psychology, pipeline dynamics, and what actually moves deals forward.",
  Marketing:         "You are Sofia Nakamura, Chief Marketing Officer at two unicorn startups. You think in CAC, LTV, attribution, and brand equity. You're skeptical of vanity metrics.",
  "Customer Success":"You are David Park, VP Customer Success with a track record of reducing churn by 60%. You understand account health, expansion revenue, and the psychology of customer retention.",
  Operations:        "You are Priya Okonkwo, COO who has scaled three companies from Series A to IPO. You think in systems, bottlenecks, delegation matrices, and operational leverage.",
  HR:                "You are James Thornton, CHRO who built talent organizations at Fortune 100 companies. You understand compensation, culture, performance management, and talent density.",
  Tech:              "You are Aisha Patel, CTO with expertise in distributed systems, security, and engineering culture. You give technically precise advice and spot architectural risks immediately.",
  Executive:         "You are Richard Chen, a board member and serial entrepreneur who has built and sold 4 companies. You think strategically, challenge assumptions, and focus on what actually moves the needle.",
  Legal:             "You are Dr. Sarah Kim, a business attorney specializing in SMB and startup law. You understand contracts, liability, compliance, and risk in plain language.",
  General:           "You are an elite senior advisor with deep expertise across business strategy, operations, finance, and growth. You give specific, actionable advice and never speak in generalities.",
}

export interface RunOptions extends AgentOptions {
  businessId?:      string
  userId?:          string
  agentSlug?:       string
  agentCategory?:   string
  useMemory?:       boolean
  useFewShot?:      boolean
  useSearch?:       boolean
  useTools?:        boolean
  useReflection?:   boolean
  qualityThreshold?: number
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>
}

export interface RunResult {
  output:      string | Record<string, unknown>
  qualityScore?: number
  iterations?:   number
  searchUsed?:   boolean
  toolsUsed?:    string[]
}

export async function runEnhancedAgent(
  systemPrompt: string,
  userMessage:  string,
  options: RunOptions = {}
): Promise<RunResult> {
  const {
    businessId, userId, agentSlug, agentCategory,
    useMemory    = true,
    useFewShot   = true,
    useSearch    = true,
    useTools     = true,
    useReflection = true,
    qualityThreshold = 8,
    conversationHistory = [],
    jsonMode = false,
    model = "sonnet",
    maxTokens = 8096,
  } = options

  const searchUsed:  boolean  = false
  const toolsUsed:   string[] = []

  // ── 1. Persona injection (#3) ────────────────────────────────────────────────
  const persona = agentCategory ? (PERSONA_BY_CATEGORY[agentCategory] ?? PERSONA_BY_CATEGORY.General) : ""

  // ── 2. Memory injection (#5) ────────────────────────────────────────────────
  let memorySection = ""
  if (useMemory && businessId && agentSlug) {
    const entries = await getMemory(businessId, agentSlug)
    memorySection = formatMemory(entries)
  }

  // ── 3. Few-shot examples (#15) ───────────────────────────────────────────────
  let fewShotSection = ""
  if (useFewShot && businessId && agentSlug) {
    const examples = await getFewShotExamples(businessId, agentSlug)
    fewShotSection = formatFewShotExamples(examples)
  }

  // ── 4. Web search (#9) ──────────────────────────────────────────────────────
  let searchSection = ""
  let didSearch = false
  if (useSearch && shouldSearch(userMessage) && process.env.TAVILY_API_KEY) {
    const searchQuery = userMessage.length > 100 ? userMessage.slice(0, 100) : userMessage
    const resp = await webSearch(searchQuery)
    searchSection = formatSearchResults(resp)
    didSearch = searchSection.length > 0
  }

  // ── Build enhanced system prompt ─────────────────────────────────────────────
  const sections = [
    persona,
    systemPrompt,
    memorySection,
    fewShotSection,
    searchSection,
    // Chain-of-thought instruction (#1)
    jsonMode
      ? "Before your final JSON, briefly reason in <thinking> tags. Then return ONLY valid JSON after </thinking>."
      : "Before responding, reason through the problem in <thinking> tags. Consider: what does the user actually need, edge cases, specific data points. Then give your response after </thinking>.",
  ].filter(Boolean).join("\n\n")

  // ── 5. Tool use with agentic loop (#10 #11) ──────────────────────────────────
  let finalOutput: string | Record<string, unknown>
  const usedToolNames: string[] = []

  if (useTools && process.env.ANTHROPIC_API_KEY) {
    const tools = await buildToolList(userId)
    finalOutput = await runWithTools(sections, userMessage, conversationHistory, tools, usedToolNames, {
      model: selectModel(model), maxTokens, jsonMode,
      businessId, userId, agentSlug,
    })
  } else {
    // Fallback to standard runAgent without tools
    const { runAgent } = await import("@/lib/claude")
    const historyPrefix = conversationHistory
      .map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n\n")
    const fullUserMessage = historyPrefix ? `${historyPrefix}\n\nUser: ${userMessage}` : userMessage
    finalOutput = await runAgent(sections, fullUserMessage, { jsonMode, model, maxTokens })
  }

  // Strip <thinking> tags from text output
  if (typeof finalOutput === "string") {
    finalOutput = finalOutput.replace(/<thinking>[\s\S]*?<\/thinking>/gi, "").trim()
  }

  // ── 6. Self-critique quality gate (#2 #13) ───────────────────────────────────
  let qualityScore: number | undefined
  let iterations = 1

  if (useReflection && !jsonMode) {
    const { runAgentWithReflection } = await import("@/lib/claude")
    const result = await runAgentWithReflection(sections, userMessage, {
      maxIterations: 2, qualityThreshold, model, maxTokens,
    })
    // Only replace if reflection produced a meaningfully better output
    if (result.score >= qualityThreshold || result.score > (qualityScore ?? 0)) {
      finalOutput  = result.output
      qualityScore = result.score
      iterations   = result.iterations
    }
    if (typeof finalOutput === "string") {
      finalOutput = finalOutput.replace(/<thinking>[\s\S]*?<\/thinking>/gi, "").trim()
    }
  }

  // ── 7. Store memory from this exchange (#5) ──────────────────────────────────
  if (useMemory && businessId && agentSlug) {
    const outputStr = typeof finalOutput === "string" ? finalOutput : JSON.stringify(finalOutput)
    extractAndStoreMemory(businessId, agentSlug, userMessage, outputStr).catch(() => {})
  }

  return {
    output:      finalOutput,
    qualityScore,
    iterations,
    searchUsed:  didSearch,
    toolsUsed:   usedToolNames,
  }
}

// ── Agentic tool loop ─────────────────────────────────────────────────────────

async function runWithTools(
  system:   string,
  userMsg:  string,
  history:  Array<{ role: "user" | "assistant"; content: string }>,
  tools:    Anthropic.Tool[],
  usedToolNames: string[],
  opts: { model: string; maxTokens: number; jsonMode: boolean; businessId?: string; userId?: string; agentSlug?: string }
): Promise<string | Record<string, unknown>> {
  const client = getClient()

  const messages: Anthropic.MessageParam[] = [
    ...history.map(m => ({
      role:    m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user" as const, content: opts.jsonMode
      ? `${userMsg}\n\nIMPORTANT: Return valid JSON only. No markdown — raw JSON object or array.`
      : userMsg },
  ]

  let text = ""
  const MAX_TOOL_ROUNDS = 5

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await client.messages.create({
      model:      opts.model,
      max_tokens: opts.maxTokens,
      system,
      tools,
      messages,
    })

    const toolUseBlocks = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
    const textBlocks    = response.content.filter((b): b is Anthropic.TextBlock    => b.type === "text")

    text = textBlocks.map(b => b.text).join("")

    if (response.stop_reason !== "tool_use" || toolUseBlocks.length === 0) break

    // Execute all tool calls
    const toolResults: ToolResult[] = await Promise.all(
      toolUseBlocks.map(async tb => {
        usedToolNames.push(tb.name)
        const result = await executeTool(tb.name, tb.input as Record<string, unknown>, {
          businessId: opts.businessId,
          userId:     opts.userId,
          agentSlug:  opts.agentSlug,
        })
        return { toolUseId: tb.id, content: result }
      })
    )

    // Add assistant response + tool results to message history
    messages.push({ role: "assistant" as const, content: response.content })
    messages.push({
      role: "user" as const,
      content: toolResults.map(r => ({
        type:        "tool_result" as const,
        tool_use_id: r.toolUseId,
        content:     r.content,
      })),
    })
  }

  if (opts.jsonMode) {
    const clean = text.replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
      .replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/i, "").trim()
    try { return JSON.parse(clean) } catch { return text }
  }

  return text
}
