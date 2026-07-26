// "More like this / less like this" (feature #2). A thumbs-up/down on any idea
// records its title + angle as a steering hint for the profile; the next
// generation leans toward the liked patterns and away from the disliked ones.
// Stored in AgentMemory (slug "content-steer", key = profile id). Server-only.

import { prisma } from "@/lib/prisma"
import { resolveLearningBusinessId } from "@/lib/learning-store"

export interface SteerHints { more: Array<{ title: string; angle: string }>; less: Array<{ title: string; angle: string }> }
const CAP = 12

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mem = () => prisma.agentMemory as any

function keyFor(profileId: string | null): string { return profileId || "adhoc" }

export async function getSteerHints(profileId: string | null): Promise<SteerHints> {
  try {
    const bizId = await resolveLearningBusinessId()
    if (!bizId) return { more: [], less: [] }
    const row = await mem().findFirst({ where: { businessId: bizId, agentSlug: "content-steer", key: keyFor(profileId) } })
    if (!row?.value) return { more: [], less: [] }
    const parsed = JSON.parse(row.value) as Partial<SteerHints>
    return { more: Array.isArray(parsed.more) ? parsed.more.slice(0, CAP) : [], less: Array.isArray(parsed.less) ? parsed.less.slice(0, CAP) : [] }
  } catch {
    return { more: [], less: [] }
  }
}

export async function addSteerHint(profileId: string | null, direction: "more" | "less", hint: { title: string; angle: string }): Promise<boolean> {
  try {
    const bizId = await resolveLearningBusinessId()
    if (!bizId) return false
    const cur = await getSteerHints(profileId)
    const clean = { title: hint.title.slice(0, 90), angle: hint.angle.slice(0, 160) }
    // Newest first, dedupe by title, cap. A title can't be in both lists.
    const other = direction === "more" ? "less" : "more"
    cur[direction] = [clean, ...cur[direction].filter((h) => h.title !== clean.title)].slice(0, CAP)
    cur[other] = cur[other].filter((h) => h.title !== clean.title)
    const now = new Date().toISOString()
    await mem().upsert({
      where:  { businessId: bizId, agentSlug: "content-steer", key: keyFor(profileId) },
      create: { id: crypto.randomUUID(), businessId: bizId, agentSlug: "content-steer", key: keyFor(profileId), value: JSON.stringify(cur), updatedAt: now },
      update: { value: JSON.stringify(cur) },
    })
    return true
  } catch {
    return false
  }
}

// The directive lines injected into the generation context.
export function steerHintDirectives(h: SteerHints): string[] {
  const out: string[] = []
  if (h.more.length) out.push(`MORE LIKE THESE (the operator liked these — lean toward their angle/energy/format, DON'T copy them verbatim): ${h.more.map((x) => `"${x.title}" (${x.angle})`).join(" · ")}`)
  if (h.less.length) out.push(`LESS LIKE THESE (the operator rejected these — avoid this pattern/angle/vibe entirely): ${h.less.map((x) => `"${x.title}"`).join(" · ")}`)
  return out
}
