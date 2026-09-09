// Persistence for source-coverage reports.
//
// Stored in AgentMemory rather than a new table on purpose: several columns
// added to schema.prisma are still not present in the live database, and a
// health report that cannot be written because of a missing migration is worse
// than useless — it would be silent in exactly the way it exists to prevent.
// AgentMemory exists today and takes arbitrary JSON.
//
// Every write is best-effort. A monitoring layer must never be able to fail the
// run it is monitoring.

import { prisma } from "@/lib/prisma"
import { resolveLearningBusinessId } from "@/lib/learning-store"
import type { SourceHealth } from "@/lib/source-coverage"

const AGENT_SLUG = "source-coverage"

// Enough history to see a source degrade over days without unbounded growth.
export const COVERAGE_HISTORY_LIMIT = 48

export interface CoverageRecord {
  domain: string
  recordedAt: string
  subjectsChecked: number
  health: SourceHealth[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const memory = () => (prisma.agentMemory as any)

export async function recordCoverage(
  domain: string,
  health: SourceHealth[],
  subjectsChecked: number,
): Promise<boolean> {
  if (health.length === 0) return false

  const record: CoverageRecord = {
    domain,
    recordedAt: new Date().toISOString(),
    subjectsChecked,
    health,
  }

  try {
    const businessId = await resolveLearningBusinessId()
    if (!businessId) return false

    const key = `${domain}:${record.recordedAt}`
    await memory().upsert({
      where: { businessId, agentSlug: AGENT_SLUG, key },
      create: {
        id: crypto.randomUUID(), businessId, agentSlug: AGENT_SLUG, key,
        value: JSON.stringify(record).slice(0, 60000),
        updatedAt: record.recordedAt,
      },
      update: { value: JSON.stringify(record).slice(0, 60000) },
    })

    await pruneOldRecords(businessId, domain)
    return true
  } catch {
    return false
  }
}

async function pruneOldRecords(businessId: string, domain: string): Promise<void> {
  try {
    const rows = await memory().findMany({
      where: { businessId, agentSlug: AGENT_SLUG },
      orderBy: { updatedAt: "desc" },
    }) as Array<{ id: string; key: string }>

    const stale = rows.filter(r => r.key.startsWith(`${domain}:`)).slice(COVERAGE_HISTORY_LIMIT)
    for (const row of stale) {
      await memory().delete({ where: { id: row.id } }).catch(() => null)
    }
  } catch {
    /* pruning is housekeeping, not correctness */
  }
}

export async function readCoverageHistory(domain: string, limit = 12): Promise<CoverageRecord[]> {
  try {
    const businessId = await resolveLearningBusinessId()
    if (!businessId) return []

    const rows = await memory().findMany({
      where: { businessId, agentSlug: AGENT_SLUG },
      orderBy: { updatedAt: "desc" },
      take: COVERAGE_HISTORY_LIMIT,
    }) as Array<{ key: string; value: string }>

    return rows
      .filter(r => r.key.startsWith(`${domain}:`))
      .slice(0, limit)
      .map(r => { try { return JSON.parse(r.value) as CoverageRecord } catch { return null } })
      .filter((r): r is CoverageRecord => r !== null)
  } catch {
    return []
  }
}

/** The most recent report, or null when nothing has run yet. */
export async function latestCoverage(domain: string): Promise<CoverageRecord | null> {
  return (await readCoverageHistory(domain, 1))[0] ?? null
}
