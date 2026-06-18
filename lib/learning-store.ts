// Server-only persistence for the Self-Learning Adaptive Engine. Kept separate
// from lib/learning-engine.ts (which is imported client-side) so Prisma never
// leaks into the browser bundle. Used by the learning API route and the
// autonomous AutoPilot cron. Best-effort throughout.

import { prisma } from "@/lib/prisma"
import { emptyTally, type Tally } from "@/lib/learning-engine"

const SLUG = "re-learning"
const KEY  = "tally"

export async function loadLearningTally(businessId: string): Promise<Tally> {
  if (!businessId) return emptyTally()
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mem = prisma.agentMemory as any
    const row = await mem.findFirst({ where: { businessId, agentSlug: SLUG, key: KEY } })
    if (row?.value) {
      const parsed = JSON.parse(row.value) as Tally
      if (parsed && typeof parsed.nSeen === "number") return { ...emptyTally(), ...parsed }
    }
  } catch { /* first run */ }
  return emptyTally()
}

export async function saveLearningTally(businessId: string, tally: Tally): Promise<void> {
  if (!businessId) return
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mem = prisma.agentMemory as any
    const value = JSON.stringify(tally)
    await mem.upsert({
      where:  { businessId, agentSlug: SLUG, key: KEY },
      create: { id: crypto.randomUUID(), businessId, agentSlug: SLUG, key: KEY, value, updatedAt: new Date().toISOString() },
      update: { value, updatedAt: new Date().toISOString() },
    })
  } catch { /* best-effort */ }
}

// Resolve a usable business id (first account) for single-operator server jobs.
let cachedBiz: string | null | undefined
export async function resolveLearningBusinessId(): Promise<string | null> {
  if (cachedBiz !== undefined) return cachedBiz
  let id: string | null = null
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (prisma.business as any).findFirst({ orderBy: { createdAt: "asc" } })
    id = row?.id ?? null
  } catch { id = null }
  cachedBiz = id
  return id
}
