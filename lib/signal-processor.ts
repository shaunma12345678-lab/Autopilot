// Signal processor — normalizes RawSignal records into Lead records.
// Deduplicates by address+APN, assigns distressLayer, earlyWarning, confidenceScore,
// timeToDistressMonths, and detects signal velocity (stacking).

import { prisma } from "@/lib/prisma"
import { getDistressLayer, SIGNAL_LAYER_MAP } from "@/lib/config/counties"
import type { RawSignalInput } from "@/lib/scrapers/base"

const CUID_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789"
function makeCuid(): string {
  const rand = Array.from({ length: 24 }, () => CUID_CHARS[Math.floor(Math.random() * CUID_CHARS.length)]).join("")
  return `c${rand}`
}

// Confidence score by layer + signal count
function computeConfidence(layer: 1 | 2 | 3, signalCount: number): number {
  const base = layer === 1 ? 90 : layer === 2 ? 55 : 40
  const boost = Math.min(signalCount - 1, 4) * 5
  return Math.min(base + boost, 98)
}

// Months until likely NOD based on signal types
function estimateTimeToDistress(signalTypes: string[]): number | null {
  const hasL1 = signalTypes.some(t => SIGNAL_LAYER_MAP[t] === 1)
  if (hasL1) return 0
  const hasTaxDelinquent = signalTypes.includes("tax_delinquent")
  const hasCodeViolation = signalTypes.includes("code_violation")
  const hasHoaLien = signalTypes.includes("hoa_lien")
  const hasProbate = signalTypes.includes("probate")
  const hasDivorce = signalTypes.includes("divorce")

  if (hasTaxDelinquent && hasHoaLien) return 3
  if (hasTaxDelinquent && hasCodeViolation) return 4
  if (hasTaxDelinquent) return 6
  if (hasHoaLien) return 5
  if (hasCodeViolation) return 8
  if (hasProbate || hasDivorce) return null
  return 12
}

// Signal velocity — did multiple signals arrive within 30 days of each other?
function detectSignalVelocity(signalDates: Date[]): boolean {
  if (signalDates.length < 2) return false
  const sorted = [...signalDates].sort((a, b) => a.getTime() - b.getTime())
  for (let i = 1; i < sorted.length; i++) {
    const diffDays = (sorted[i].getTime() - sorted[i - 1].getTime()) / 86400000
    if (diffDays <= 30) return true
  }
  return false
}

// Deal score calculation incorporating all signals
function computeDealScore(params: {
  layer: 1 | 2 | 3
  signalCount: number
  hasVelocity: boolean
  confidenceScore: number
  timeToDistressMonths: number | null
}): number {
  let score = 0
  // Layer urgency (0-40)
  score += params.layer === 1 ? 40 : params.layer === 2 ? 25 : 15
  // Signal stacking (0-20)
  score += Math.min(params.signalCount * 5, 20)
  // Velocity boost (0-15)
  if (params.hasVelocity) score += 15
  // Confidence contribution (0-15)
  score += Math.round((params.confidenceScore / 100) * 15)
  // Time to distress urgency (0-10)
  if (params.timeToDistressMonths === 0) score += 10
  else if (params.timeToDistressMonths !== null && params.timeToDistressMonths <= 3) score += 8
  else if (params.timeToDistressMonths !== null && params.timeToDistressMonths <= 6) score += 5
  return Math.min(score, 100)
}

export interface ProcessResult {
  created: number
  updated: number
  signals: number
}

export async function processSignals(
  rawSignals: RawSignalInput[],
  businessId: string
): Promise<ProcessResult> {
  let created = 0
  let updated = 0

  // Group signals by normalized address
  const byAddress = new Map<string, RawSignalInput[]>()
  for (const sig of rawSignals) {
    const key = sig.address.trim().toLowerCase().replace(/\s+/g, " ")
    const group = byAddress.get(key) ?? []
    group.push(sig)
    byAddress.set(key, group)
  }

  for (const [, signals] of byAddress) {
    const first = signals[0]
    const county = first.county

    // Find or create matching lead by address
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing = await (prisma.lead as any).findFirst({
      where: {
        businessId,
        name: { contains: first.address },
      },
    })

    const signalTypes = [...new Set(signals.map(s => s.signalType))]
    const layer = getDistressLayer(signalTypes)
    const earlyWarning = layer > 1
    const confidenceScore = computeConfidence(layer, signals.length)
    const timeToDistressMonths = estimateTimeToDistress(signalTypes)
    const signalDates = signals.map(s => new Date(s.signalDate))
    const hasVelocity = detectSignalVelocity(signalDates)
    const dealScore = computeDealScore({
      layer,
      signalCount: signals.length,
      hasVelocity,
      confidenceScore,
      timeToDistressMonths,
    })

    const distressSignalsSummary = signalTypes
      .map(t => t.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()))
      .join(", ")

    const leadData = {
      name: first.address,
      source: `${layer === 1 ? "Pre-Foreclosure" : layer === 2 ? "Early Warning"  : "Life Event"} · ${county} · Layer ${layer}`,
      score: dealScore,
      distressLayer: layer,
      earlyWarning,
      confidenceScore,
      timeToDistressMonths: timeToDistressMonths ?? undefined,
      notes: [
        `Signals: ${distressSignalsSummary}`,
        hasVelocity ? "⚡ Signal velocity detected — accelerating distress" : null,
        `Confidence: ${confidenceScore}%`,
        timeToDistressMonths === 0 ? "Active foreclosure proceeding" :
          timeToDistressMonths !== null ? `~${timeToDistressMonths} months to potential NOD` : null,
        (first.rawData as Record<string, unknown>)?.ownerName ? `Owner: ${(first.rawData as Record<string, unknown>).ownerName}` : null,
      ].filter(Boolean).join("\n"),
    }

    let leadId: string
    if (existing) {
      // Upgrade layer if we have a more urgent signal now
      const updatePayload: Record<string, unknown> = {
        score: Math.max(existing.score as number, dealScore),
        notes: leadData.notes,
      }
      if ((layer as number) < (existing.distressLayer as number ?? 3)) {
        updatePayload.distressLayer = layer
        updatePayload.earlyWarning = earlyWarning
        updatePayload.confidenceScore = confidenceScore
        updatePayload.timeToDistressMonths = timeToDistressMonths
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (prisma.lead as any).update({
        where: { id: existing.id },
        data: updatePayload,
      })
      leadId = existing.id as string
      updated++
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const newLead = await (prisma.lead as any).create({
        data: { ...leadData, businessId, status: "NEW" },
      })
      leadId = (newLead as { id: string }).id
      created++
    }

    // Store all raw signals linked to this lead
    for (const sig of signals) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (prisma.rawSignal as any).create({
        data: {
          id: makeCuid(),
          leadId,
          apn: sig.apn ?? null,
          address: sig.address,
          county: sig.county,
          signalType: sig.signalType,
          signalDate: new Date(sig.signalDate).toISOString(),
          rawData: sig.rawData,
          source: sig.source,
        },
      })
    }
  }

  return { created, updated, signals: rawSignals.length }
}

export async function upsertSource(params: {
  name: string
  county: string
  layer: number
  success: boolean
  errorMsg?: string
}): Promise<void> {
  const now = new Date().toISOString()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existing = await (prisma.source as any).findFirst({
    where: { name: params.name, county: params.county },
  })

  if (existing) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma.source as any).update({
      where: { id: existing.id },
      data: {
        lastSuccess: params.success ? now : existing.lastSuccess,
        lastError: params.success ? null : (params.errorMsg ?? "Unknown error"),
        status: params.success ? "active" : "error",
        updatedAt: now,
      },
    })
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma.source as any).create({
      data: {
        id: makeCuid(),
        name: params.name,
        county: params.county,
        layer: params.layer,
        lastSuccess: params.success ? now : null,
        lastError: params.success ? null : (params.errorMsg ?? "Unknown error"),
        status: params.success ? "active" : "error",
        updatedAt: now,
        createdAt: now,
      },
    })
  }
}
