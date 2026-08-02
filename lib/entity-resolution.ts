// Portfolio owner graph — finds operators (LLCs/individuals) who own multiple
// distressed properties across the accumulated signal history, not just
// within a single search batch (that's all lib/owner-portfolio.ts's 51-line
// in-memory grouping does — this is the persisted, cross-run version).
//
// Scope, stated honestly: this MVP groups by EXACT normalized owner-name
// match (after suffix/whitespace/punctuation normalization). It does NOT do
// fuzzy cross-alias resolution (e.g. recognizing "ABC Holdings LLC" and
// "ABC Holdings LLC c/o Property Mgmt" as the same entity) — that needs
// either AI-assisted disambiguation at scale or a per-state registered-agent
// cross-check, both flagged in the plan as their own follow-up sub-spikes.
// Exact-name grouping is still genuinely useful: most operators file
// consistently under one LLC name across their portfolio.
import { prisma } from "@/lib/prisma"

const ENTITY_SUFFIXES = /\b(llc|l\.l\.c\.?|lp|l\.p\.?|inc|incorporated|corp|corporation|trust|trustee|et al)\b\.?/gi

export function normalizeOwnerName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

export function canonicalizeOwnerName(raw: string): string {
  return normalizeOwnerName(raw).replace(ENTITY_SUFFIXES, "").trim()
}

export function detectEntityType(raw: string): string {
  const lower = raw.toLowerCase()
  if (/\bllc\b|\bl\.l\.c\.?\b/.test(lower)) return "llc"
  if (/\blp\b|\bl\.p\.?\b/.test(lower)) return "lp"
  if (/\binc\b|\bcorp\b|\bincorporated\b|\bcorporation\b/.test(lower)) return "corp"
  if (/\btrust\b|\btrustee\b/.test(lower)) return "trust"
  return "individual"
}

function makeCuid(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789"
  return `c${Array.from({ length: 24 }, () => chars[Math.floor(Math.random() * chars.length)]).join("")}`
}

export interface ResolveResult {
  entitiesCreated: number
  entitiesUpdated: number
  propertiesLinked: number
}

export async function resolveEntities(batchSize = 2000): Promise<ResolveResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const signals = await (prisma.rawSignal as any).findMany({
    orderBy: { createdAt: "desc" },
    take: batchSize,
    select: { leadId: true, address: true, assetClass: true, rawData: true },
  }) as Array<{ leadId: string | null; address: string; assetClass: string; rawData: Record<string, unknown> }>

  // Group by canonical owner name
  const byOwner = new Map<string, { rawNames: Set<string>; properties: Map<string, { leadId: string; address: string; assetClass: string }> }>()

  for (const sig of signals) {
    const ownerRaw = sig.rawData?.ownerName
    if (!ownerRaw || typeof ownerRaw !== "string" || !sig.leadId) continue
    const canonical = canonicalizeOwnerName(ownerRaw)
    if (!canonical || canonical.length < 3) continue

    const group = byOwner.get(canonical) ?? { rawNames: new Set(), properties: new Map() }
    group.rawNames.add(ownerRaw.trim())
    group.properties.set(sig.leadId, { leadId: sig.leadId, address: sig.address, assetClass: sig.assetClass })
    byOwner.set(canonical, group)
  }

  let entitiesCreated = 0
  let entitiesUpdated = 0
  let propertiesLinked = 0

  for (const [canonical, group] of byOwner) {
    // Only entities with 2+ distinct properties are a "portfolio" worth flagging
    if (group.properties.size < 2) continue

    const firstRawName = [...group.rawNames][0]
    const entityType = detectEntityType(firstRawName)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing = await (prisma.entity as any).findFirst({ where: { canonicalName: canonical } })

    let entityId: string
    if (existing) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (prisma.entity as any).update({
        where: { id: existing.id },
        data: { propertyCount: group.properties.size, entityType },
      })
      entityId = existing.id
      entitiesUpdated++
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const created = await (prisma.entity as any).create({
        data: { id: makeCuid(), canonicalName: canonical, entityType, propertyCount: group.properties.size },
      })
      entityId = created.id
      entitiesCreated++
    }

    for (const rawName of group.rawNames) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const existingAlias = await (prisma.entityAlias as any).findFirst({ where: { entityId, alias: rawName } })
      if (!existingAlias) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (prisma.entityAlias as any).create({
          data: { id: makeCuid(), entityId, alias: rawName, source: "raw-signal-owner-name", confidence: 1.0 },
        })
      }
    }

    for (const prop of group.properties.values()) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const existingProp = await (prisma.entityProperty as any).findFirst({ where: { entityId, leadId: prop.leadId } })
      if (!existingProp) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (prisma.entityProperty as any).create({
          data: { id: makeCuid(), entityId, leadId: prop.leadId, address: prop.address, assetClass: prop.assetClass, confidence: 1.0 },
        })
        propertiesLinked++
      }
    }
  }

  return { entitiesCreated, entitiesUpdated, propertiesLinked }
}
