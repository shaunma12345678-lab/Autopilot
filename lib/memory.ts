// Agent Memory System (#5) — persistent facts per business per agent
// Extracted from conversations, injected into system prompts.

import { prisma } from "@/lib/prisma"
import { runAgent } from "@/lib/claude"

export interface MemoryEntry {
  key:   string
  value: string
}

export async function getMemory(businessId: string, agentSlug: string): Promise<MemoryEntry[]> {
  try {
    const rows = await prisma.agentMemory.findMany({
      where: { businessId, agentSlug },
      orderBy: { updatedAt: "desc" },
      take: 20,
    })
    return rows.map(r => ({ key: r.key, value: r.value }))
  } catch { return [] }
}

export async function setMemory(businessId: string, agentSlug: string, entries: MemoryEntry[]): Promise<void> {
  await Promise.all(
    entries.map(e =>
      prisma.agentMemory.upsert({
        where:  { businessId_agentSlug_key: { businessId, agentSlug, key: e.key } },
        update: { value: e.value },
        create: { businessId, agentSlug, key: e.key, value: e.value },
      })
    )
  )
}

export function formatMemory(entries: MemoryEntry[]): string {
  if (entries.length === 0) return ""
  return `[Business Memory]\n${entries.map(e => `• ${e.key}: ${e.value}`).join("\n")}`
}

// Extract memorable facts from a conversation exchange
export async function extractAndStoreMemory(
  businessId: string,
  agentSlug:  string,
  userMessage: string,
  agentResponse: string
): Promise<void> {
  try {
    const result = await runAgent(
      `You extract key business facts from agent conversations.
Extract ONLY specific, reusable facts — numbers, preferences, constraints, named entities.
Skip generic statements. Max 5 facts.
Return JSON: { facts: [{ key: string, value: string }] }`,
      `User asked: ${userMessage.slice(0, 500)}\nAgent said: ${agentResponse.slice(0, 800)}`,
      { jsonMode: true, maxTokens: 512, model: "haiku" }
    ) as Record<string, unknown>

    const facts = (result.facts as MemoryEntry[] | undefined) ?? []
    if (facts.length > 0) {
      await setMemory(businessId, agentSlug, facts)
    }
  } catch { /* non-blocking — memory extraction never fails the main flow */ }
}

export async function getFewShotExamples(
  businessId: string,
  agentSlug:  string,
  limit = 3
): Promise<Array<{ userInput: string; agentOutput: string }>> {
  try {
    const rows = await prisma.fewShotExample.findMany({
      where:   { businessId, agentSlug, approved: true },
      orderBy: { quality: "desc" },
      take:    limit,
    })
    return rows.map(r => ({ userInput: r.userInput, agentOutput: r.agentOutput }))
  } catch { return [] }
}

export function formatFewShotExamples(examples: Array<{ userInput: string; agentOutput: string }>): string {
  if (examples.length === 0) return ""
  const lines = ["[Approved Examples — match this quality]"]
  examples.forEach((ex, i) => {
    lines.push(`\nExample ${i + 1}:\nUser: ${ex.userInput.slice(0, 300)}\nAgent: ${ex.agentOutput.slice(0, 600)}`)
  })
  return lines.join("\n")
}
