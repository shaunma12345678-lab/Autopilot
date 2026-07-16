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
    const profile = await P().brandProfile.findFirst({ where: { id: idea.brandProfileId } }).catch(() => null)

    const context = [
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
