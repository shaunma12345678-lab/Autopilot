// Idea → deliverable expansion (spec §2): outline, full script, caption, or
// shot list — written in the profile's voice, persisted as ContentExpansion
// versions. Server-only.

import { prisma } from "@/lib/prisma"
import { runAgent } from "@/lib/claude"
import { EXPAND_SYSTEM } from "@/lib/content/prompts"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const P = () => prisma as any

export async function expandIdea(ideaId: string, kind: string): Promise<{ body: string; version: number } | null> {
  const system = EXPAND_SYSTEM[kind]
  if (!system) return null
  try {
    const idea = await P().contentIdea.findFirst({ where: { id: ideaId } })
    if (!idea) return null
    // The ad-hoc sentinel profile carries no real identity — the run context
    // (the owner's own description) is the business for those ideas.
    const profileRow = await P().brandProfile.findFirst({ where: { id: idea.brandProfileId } }).catch(() => null)
    const profile = profileRow?.id === "bp-adhoc-001" ? null : profileRow

    // Pull the FULL grounding the generation run saw (business description,
    // area numbers, trends, exemplars) so the expansion is ultra-specific to
    // the exact situation — not a generic take on the title.
    let runContext = ""
    try {
      const { resolveLearningBusinessId } = await import("@/lib/learning-store")
      const bizId = await resolveLearningBusinessId()
      if (bizId) {
        const row = await P().agentMemory.findFirst({ where: { businessId: bizId, agentSlug: "content-runs", key: `${idea.runId}:context` } })
        if (row?.value) {
          const parsed = JSON.parse(row.value) as { block?: string }
          if (parsed?.block) runContext = String(parsed.block).slice(0, 3000)
        }
      }
    } catch { /* expansion still works without it */ }

    const context = [
      runContext ? `RUN CONTEXT (the business's exact situation & real numbers — use these):\n${runContext}` : "",
      profile ? `BUSINESS: ${profile.name} — ${profile.niche}` : "",
      profile?.voiceRules ? `VOICE RULES: ${profile.voiceRules}` : "",
      `PLATFORM: ${idea.platform} · FORMAT: ${idea.format}`,
      `TITLE: ${idea.title}`,
      `PREMISE: ${idea.premise}`,
      `ANGLE: ${idea.angle}`,
      `BEST HOOK: ${idea.hooks?.[0] ?? idea.title}`,
    ].filter(Boolean).join("\n")

    const out = await runAgent(system, context, { maxTokens: 1800 })
    const body = (typeof out === "string" ? out : JSON.stringify(out)).trim().slice(0, 12000)
    if (body.length < 20) return null

    const prior = await P().contentExpansion.findMany({ where: { ideaId, kind }, take: 20 }).catch(() => []) as Array<{ version: number }>
    const version = prior.length ? Math.max(...prior.map((p) => p.version)) + 1 : 1
    await P().contentExpansion.create({ data: {
      id: crypto.randomUUID(), ideaId, kind, body, version, createdAt: new Date().toISOString(),
    } }).catch(() => null)
    return { body, version }
  } catch {
    return null
  }
}
