// Observability (server) — our own lightweight error capture. Every call logs
// to the console (Vercel log drain) AND appends to a ring buffer in the KV
// store, so the last ~80 production errors are inspectable from the admin API
// without a third-party service. Fire-and-forget, never throws — the error
// path must not create errors.

import { prisma } from "@/lib/prisma"
import { resolveLearningBusinessId } from "@/lib/learning-store"

const SLUG = "sys-errors"
const KEY = "ring"
const CAP = 80

export interface CapturedError {
  at: string
  scope: string
  msg: string
  extra?: string
}

export async function captureError(scope: string, err: unknown, extra?: Record<string, unknown>): Promise<void> {
  const msg = err instanceof Error ? `${err.message}${err.stack ? ` | ${err.stack.split("\n")[1]?.trim() ?? ""}` : ""}` : String(err)
  console.error(`[${scope}]`, msg, extra ?? "")
  try {
    const bizId = await resolveLearningBusinessId()
    if (!bizId) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mem = prisma.agentMemory as any
    let ring: CapturedError[] = []
    try {
      const row = await mem.findFirst({ where: { businessId: bizId, agentSlug: SLUG, key: KEY } })
      if (row?.value) { const p = JSON.parse(row.value); if (Array.isArray(p)) ring = p }
    } catch { /* first run */ }
    ring.push({
      at: new Date().toISOString(),
      scope: scope.slice(0, 60),
      msg: msg.slice(0, 400),
      extra: extra ? JSON.stringify(extra).slice(0, 300) : undefined,
    })
    const value = JSON.stringify(ring.slice(-CAP))
    await mem.upsert({
      where:  { businessId: bizId, agentSlug: SLUG, key: KEY },
      create: { id: crypto.randomUUID(), businessId: bizId, agentSlug: SLUG, key: KEY, value, updatedAt: new Date().toISOString() },
      update: { value, updatedAt: new Date().toISOString() },
    })
  } catch { /* best-effort */ }
}

export async function recentErrors(): Promise<CapturedError[]> {
  try {
    const bizId = await resolveLearningBusinessId()
    if (!bizId) return []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mem = prisma.agentMemory as any
    const row = await mem.findFirst({ where: { businessId: bizId, agentSlug: SLUG, key: KEY } })
    if (row?.value) { const p = JSON.parse(row.value); if (Array.isArray(p)) return p.reverse() }
  } catch { /* empty */ }
  return []
}
