import Anthropic from "@anthropic-ai/sdk"
import Groq from "groq-sdk"

// ── Model catalog ─────────────────────────────────────────────────────────────

export const MODELS = {
  /** Most capable — complex analysis, legal, finance, strategic reasoning */
  opus: "claude-opus-4-5-20251101",
  /** Default — excellent balance of speed and quality */
  sonnet: "claude-sonnet-4-20250514",
  /** Fast + cheap — simple tasks, high-volume classification */
  haiku: "claude-haiku-4-5-20251001",
} as const

export type ModelTier = keyof typeof MODELS

/** Map business task complexity to the right model */
export function selectModel(tier: ModelTier = "sonnet"): string {
  return MODELS[tier]
}

// ── Clients (lazy-initialized) ────────────────────────────────────────────────

let _anthropic: Anthropic | undefined
let _groq: Groq | undefined

function getAnthropicClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY not configured.")
  }
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _anthropic
}

function getGroqClient(): Groq {
  if (!process.env.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY not configured.")
  }
  if (!_groq) _groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
  return _groq
}

type Provider = "claude" | "groq"

function getProvider(): Provider {
  if (process.env.ANTHROPIC_API_KEY) return "claude"
  if (process.env.GROQ_API_KEY) return "groq"
  throw new Error(
    "No AI provider configured. Set ANTHROPIC_API_KEY (recommended) or GROQ_API_KEY."
  )
}

// ── Core agent runner ─────────────────────────────────────────────────────────

export interface AgentOptions {
  maxTokens?: number
  jsonMode?: boolean
  /** Use extended thinking for deep, multi-step reasoning */
  extendedThinking?: boolean
  /** Token budget for extended thinking (default: 10000) */
  thinkingBudget?: number
  /** Model tier: opus (most capable), sonnet (default), haiku (fast) */
  model?: ModelTier
}

export async function runAgent(
  systemPrompt: string,
  userPrompt: string,
  options: AgentOptions = {}
): Promise<string | Record<string, unknown>> {
  const provider = getProvider()

  const finalUserPrompt = options.jsonMode
    ? `${userPrompt}\n\nIMPORTANT: Return valid JSON only. No markdown fences, no preamble — raw JSON object or array only.`
    : userPrompt

  let text: string

  if (provider === "claude") {
    const client = getAnthropicClient()
    const modelId = selectModel(options.model ?? "sonnet")
    const useThinking = options.extendedThinking ?? false
    const thinkingBudget = options.thinkingBudget ?? 10000
    const maxTokens = options.maxTokens ?? (useThinking ? 16000 : 8096)

    const params: Anthropic.MessageCreateParamsNonStreaming = {
      model: modelId,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: finalUserPrompt }],
    }

    if (useThinking) {
      // Extended thinking: model works through complex problems step-by-step
      // Requires min 1024 max_tokens and budget < max_tokens
      const budget = Math.min(thinkingBudget, maxTokens - 1024)
      params.thinking = { type: "enabled", budget_tokens: budget }
      // Extended thinking requires temperature=1 (or omitted — Anthropic default)
    }

    const response = await client.messages.create(params)

    text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map(b => b.text)
      .join("")
  } else {
    const client = getGroqClient()
    const response = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: options.maxTokens ?? 8192,
      response_format: options.jsonMode ? { type: "json_object" } : undefined,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: finalUserPrompt },
      ],
    })
    text = response.choices[0]?.message?.content ?? ""
  }

  if (options.jsonMode) {
    const clean = text.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/i, "").trim()
    return JSON.parse(clean)
  }

  return text
}

// ── Reasoning agent (CoT wrapper) ─────────────────────────────────────────────

export async function runAgentWithReasoning(
  systemPrompt: string,
  task: string,
  options: AgentOptions = {}
): Promise<string | Record<string, unknown>> {
  const reasoningSystem = `${systemPrompt}

Before answering, reason through the problem step by step in <thinking> tags.
Consider: edge cases, data quality, what the user actually needs vs what they asked for.
Then provide your final response after </thinking>.
${options.jsonMode ? "Your final response after </thinking> must be valid JSON only — no markdown, no explanation." : ""}`

  const result = await runAgent(reasoningSystem, task, {
    ...options,
    maxTokens: options.maxTokens ?? 8096,
  })

  if (options.jsonMode) return result

  const text = result as string
  const afterThinking = text.replace(/<thinking>[\s\S]*?<\/thinking>/gi, "").trim()
  return afterThinking || text
}

// ── Self-improving reflection agent ──────────────────────────────────────────
//
// Agents must meet a quality threshold of 8/10 before output is accepted.
// If they don't, they keep iterating — building on each prior attempt —
// until the standard is met or max iterations are exhausted.
// Quality standard: specific, actionable, complete, and genuinely useful.

const REFLECTION_SYSTEM = `You are an elite business output evaluator with extremely high standards. Your job is to score AI agent outputs and produce strictly better versions when they fall short.

QUALITY STANDARD (must score 8+ to pass):
- 9-10: Exceptional — specific, complete, immediately actionable, no filler
- 8: Strong — minor gaps only, solid professional quality
- 6-7: Good but incomplete — missing key specifics, too generic, or missing sections
- 4-5: Mediocre — generic advice that could apply to any business, not this one
- 1-3: Poor — vague, unhelpful, or off-topic

WHEN IMPROVING:
- Be MORE specific, not less — use actual numbers, real tactics, concrete examples
- Add what is obviously missing given the goal
- Remove filler and generic statements
- Every sentence must add value
- Never truncate — produce the full improved output

OUTPUT: valid JSON only — { "score": number, "critique": "what is missing or weak (one sentence)", "improved_output": "the full improved content" }`

export async function runAgentWithReflection(
  systemPrompt: string,
  task: string,
  options: AgentOptions & { maxIterations?: number; qualityThreshold?: number } = {}
): Promise<{ output: string | Record<string, unknown>; score: number; iterations: number }> {
  const provider         = getProvider()
  const qualityThreshold = options.qualityThreshold ?? 8
  // Groq: up to 3 iterations (4 total API calls) — acceptable for single-user free tier
  // Claude: up to 5 iterations for maximum quality
  const maxIterations    = options.maxIterations ?? (provider === "claude" ? 5 : 3)

  // First pass — base agent output
  let current   = await runAgent(systemPrompt, task, options)
  let score     = 0
  let iteration = 0

  for (iteration = 0; iteration < maxIterations; iteration++) {
    const reflectionInput = `Original goal: ${task}

Current output (iteration ${iteration + 1}):
${typeof current === "string" ? current : JSON.stringify(current, null, 2)}

Evaluate rigorously against the quality standard. Score it and ${score > 0 ? `improve on the previous attempt (score was ${score}/10)` : "produce an improved version if score < " + qualityThreshold}. Return JSON only.`

    let reflectionResult: Record<string, unknown>

    try {
      reflectionResult = (await runAgent(REFLECTION_SYSTEM, reflectionInput, {
        jsonMode:   true,
        model:      options.model ?? "sonnet",
        maxTokens:  options.maxTokens ?? 4096,
      })) as Record<string, unknown>
    } catch {
      break
    }

    score = Number(reflectionResult.score) || 0
    if (score >= qualityThreshold) break

    const improved = reflectionResult.improved_output
    if (!improved) break

    if (options.jsonMode && typeof improved === "string") {
      try { current = JSON.parse(improved) } catch { current = improved }
    } else if (typeof improved === "object" && improved !== null) {
      current = improved as Record<string, unknown>
    } else {
      current = improved as string
    }
  }

  return { output: current, score, iterations: iteration + 1 }
}

// ── Parallel agent runner ─────────────────────────────────────────────────────

export async function runAgentsParallel(
  agents: Array<{ system: string; user: string; options?: AgentOptions }>
): Promise<Array<string | Record<string, unknown>>> {
  return Promise.all(agents.map(a => runAgent(a.system, a.user, a.options)))
}

// ── Multi-step orchestration (plan → execute → synthesize) ───────────────────

export async function runOrchestrated(params: {
  goal: string
  context: string
  agents: Array<{ name: string; systemPrompt: string; task: string; options?: AgentOptions }>
}): Promise<{ results: Record<string, string | Record<string, unknown>>; synthesis: string }> {
  // Run all agents in parallel
  const outputs = await Promise.all(
    params.agents.map(async agent => ({
      name: agent.name,
      result: await runAgent(agent.systemPrompt, agent.task, agent.options),
    }))
  )

  const results: Record<string, string | Record<string, unknown>> = {}
  for (const { name, result } of outputs) {
    results[name] = result
  }

  // Synthesize
  const synthesisPrompt = `You are a senior business strategist. Multiple AI agents have analyzed different aspects of a business challenge. Synthesize their outputs into one unified, actionable executive brief.

Goal: ${params.goal}
Context: ${params.context}

Agent outputs:
${outputs.map(o => `## ${o.name}\n${typeof o.result === "string" ? o.result : JSON.stringify(o.result, null, 2)}`).join("\n\n")}

Write a synthesis that: identifies the key themes across all outputs, highlights the most important actions, resolves any contradictions, and gives a clear prioritized next-steps list. No bullet-point soup — write like an advisor who respects the reader's time.`

  const synthesis = (await runAgent(
    "You synthesize multi-agent business analysis into executive-grade briefs.",
    synthesisPrompt,
    { model: "sonnet", maxTokens: 2000 }
  )) as string

  return { results, synthesis }
}
