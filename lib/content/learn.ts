// The learning loop (spec §5.5) — the actual product. Outcomes are normalized
// to a percentile against the ACCOUNT'S OWN baseline (raw views poison the
// model), calibration rows record predicted-vs-actual, weights nudge toward
// what's predictive (bounded, min-n guarded), and top posts auto-promote to
// exemplars with an AI-extracted why-it-worked. Server-only, best-effort.

import { prisma } from "@/lib/prisma"
import { runAgent } from "@/lib/claude"
import { DIMENSIONS, normalizeWeights, DEFAULT_WEIGHTS, type DimensionWeights } from "@/lib/content/score"

const MIN_OUTCOMES_FOR_WEIGHTS = 20
const MAX_NUDGE_PER_CYCLE = 0.03   // no wild swings on small samples

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const P = () => prisma as any

export interface OutcomeInput {
  ideaId: string
  postUrl?: string
  publishedAt?: string
  views?: number
  likes?: number
  comments?: number
  shares?: number
  saves?: number
  followsGained?: number
  watchThrough?: number
  hookUsed?: string       // which hook variant was posted (hook tournament)
  couponCode?: string     // the code tied to this post (conversion tracking)
  redemptions?: number    // real customers through the door
  revenue?: number        // real $ attributed
  shaunNotes?: string
}

// Engagement index used ONLY for within-account ranking (never across accounts).
function engagementIndex(o: { views?: number | null; likes?: number | null; shares?: number | null; saves?: number | null; comments?: number | null }): number {
  return (o.views ?? 0) + (o.likes ?? 0) * 15 + (o.comments ?? 0) * 30 + (o.shares ?? 0) * 60 + (o.saves ?? 0) * 40
}

export async function logOutcome(input: OutcomeInput): Promise<{ ok: boolean; percentile?: number }> {
  try {
    const idea = await P().contentIdea.findFirst({ where: { id: input.ideaId } })
    if (!idea) return { ok: false }
    const now = new Date().toISOString()

    await P().contentOutcome.upsert({
      where:  { ideaId: input.ideaId },
      create: {
        id: crypto.randomUUID(), ideaId: input.ideaId,
        publishedAt: input.publishedAt ?? now, postUrl: input.postUrl ?? null,
        views: input.views ?? null, likes: input.likes ?? null, comments: input.comments ?? null,
        shares: input.shares ?? null, saves: input.saves ?? null, followsGained: input.followsGained ?? null,
        watchThrough: input.watchThrough ?? null,
        hookUsed: input.hookUsed ?? null, couponCode: input.couponCode ?? null,
        redemptions: input.redemptions ?? null, revenue: input.revenue ?? null,
        shaunNotes: input.shaunNotes ?? null,
        updatedAt: now, createdAt: now,
      },
      update: {
        views: input.views ?? null, likes: input.likes ?? null, comments: input.comments ?? null,
        shares: input.shares ?? null, saves: input.saves ?? null, followsGained: input.followsGained ?? null,
        watchThrough: input.watchThrough ?? null,
        hookUsed: input.hookUsed ?? null, couponCode: input.couponCode ?? null,
        redemptions: input.redemptions ?? null, revenue: input.revenue ?? null,
        shaunNotes: input.shaunNotes ?? null, postUrl: input.postUrl ?? null,
      },
    })

    // Percentile vs THIS profile's own history.
    const siblings = await P().contentIdea.findMany({ where: { brandProfileId: idea.brandProfileId }, take: 500 }) as Array<{ id: string }>
    const ids = new Set(siblings.map((s) => s.id))
    const outcomes = (await P().contentOutcome.findMany({ take: 500 }) as Array<{ ideaId: string; views: number | null; likes: number | null; shares: number | null; saves: number | null; comments: number | null }>)
      .filter((o) => ids.has(o.ideaId))
    const mine = engagementIndex(input)
    const below = outcomes.filter((o) => o.ideaId !== input.ideaId && engagementIndex(o) < mine).length
    const denom = Math.max(1, outcomes.length - 1)
    const percentile = outcomes.length > 1 ? Math.round((below / denom) * 100) : 50

    await P().contentOutcome.update({ where: { ideaId: input.ideaId }, data: { actualPercentile: percentile } })

    // Calibration rows: overall + per-dimension.
    const dims = (idea.scoreBreakdown?.dimensions ?? {}) as Record<string, number>
    const rows = [{ id: crypto.randomUUID(), runId: idea.runId, predicted: idea.viralityScore, actual: percentile, dimension: null as string | null, recordedAt: new Date().toISOString() }]
    for (const d of DIMENSIONS) if (typeof dims[d] === "number") rows.push({ id: crypto.randomUUID(), runId: idea.runId, predicted: dims[d], actual: percentile, dimension: d, recordedAt: new Date().toISOString() })
    await P().scoreCalibration.createMany({ data: rows }).catch(() => null)

    // Exemplar promotion: top-quartile posts sharpen the engine's taste.
    if (percentile >= 75 && outcomes.length >= 4) {
      const why = await runAgent(
        "In ≤ 40 words, name the structural reason this post outperformed (mechanism, not praise). Plain text.",
        `Platform: ${idea.platform}\nTitle: ${idea.title}\nHook: ${idea.hooks?.[0] ?? ""}\nPremise: ${idea.premise}\nResult: top ${100 - percentile}% of this account's posts.`,
        { maxTokens: 120 },
      ).catch(() => null)
      await P().contentExemplar.create({ data: {
        id: crypto.randomUUID(), brandProfileId: idea.brandProfileId, platform: idea.platform,
        hook: idea.hooks?.[0] ?? idea.title, transcript: idea.premise, isOwn: true,
        performance: { percentile, views: input.views ?? null },
        whyItWorked: typeof why === "string" ? why.slice(0, 400) : null,
        createdAt: new Date().toISOString(),
      } }).catch(() => null)
    }

    // Weight adjustment (bounded, min-n guarded).
    await adjustWeights(idea.brandProfileId).catch(() => null)
    return { ok: true, percentile }
  } catch {
    return { ok: false }
  }
}

// Nudge per-profile weights toward the dimensions that actually predict
// outcomes: correlate each dimension's sub-scores with actual percentiles.
export async function adjustWeights(brandProfileId: string): Promise<boolean> {
  try {
    const ideas = await P().contentIdea.findMany({ where: { brandProfileId }, take: 500 }) as Array<{ id: string; scoreBreakdown: { dimensions?: Record<string, number> } | null }>
    const ids = new Map(ideas.map((i) => [i.id, i]))
    const outcomes = (await P().contentOutcome.findMany({ take: 500 }) as Array<{ ideaId: string; actualPercentile: number | null }>)
      .filter((o) => ids.has(o.ideaId) && o.actualPercentile != null)
    if (outcomes.length < MIN_OUTCOMES_FOR_WEIGHTS) return false

    const pairs = outcomes.map((o) => ({ dims: ids.get(o.ideaId)?.scoreBreakdown?.dimensions ?? {}, actual: o.actualPercentile as number }))
    const corr: Partial<DimensionWeights> = {}
    for (const d of DIMENSIONS) {
      const xs = pairs.map((p) => p.dims[d]).filter((x): x is number => typeof x === "number")
      if (xs.length < MIN_OUTCOMES_FOR_WEIGHTS) continue
      const ys = pairs.filter((p) => typeof p.dims[d] === "number").map((p) => p.actual)
      const mx = xs.reduce((s, x) => s + x, 0) / xs.length
      const my = ys.reduce((s, y) => s + y, 0) / ys.length
      let num = 0, dx = 0, dy = 0
      for (let i = 0; i < xs.length; i++) { num += (xs[i] - mx) * (ys[i] - my); dx += (xs[i] - mx) ** 2; dy += (ys[i] - my) ** 2 }
      const r = dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : 0
      corr[d] = r
    }

    const prof = await P().brandProfile.findFirst({ where: { id: brandProfileId } })
    const current = normalizeWeights(prof?.weights ?? null)
    const next = { ...current }
    for (const d of DIMENSIONS) {
      const r = corr[d]
      if (typeof r !== "number") continue
      // Positive correlation → nudge up; negative → down. Bounded per cycle.
      next[d] = Math.max(0.01, current[d] + Math.max(-MAX_NUDGE_PER_CYCLE, Math.min(MAX_NUDGE_PER_CYCLE, r * MAX_NUDGE_PER_CYCLE)))
    }
    await P().brandProfile.update({ where: { id: brandProfileId }, data: { weights: normalizeWeights(next), updatedAt: new Date().toISOString() } })
    return true
  } catch {
    return false
  }
}

export interface CalibrationSummary { n: number; meanAbsError: number | null; byDimension: Array<{ dimension: string; n: number; corr: number | null }> }

export async function calibrationSummary(): Promise<CalibrationSummary> {
  try {
    const rows = await P().scoreCalibration.findMany({ orderBy: { recordedAt: "desc" }, take: 1000 }) as Array<{ predicted: number; actual: number; dimension: string | null }>
    const overall = rows.filter((r) => r.dimension == null)
    const mae = overall.length ? Math.round(overall.reduce((s, r) => s + Math.abs(r.predicted - r.actual), 0) / overall.length * 10) / 10 : null
    const byDimension = DIMENSIONS.map((d) => {
      const ds = rows.filter((r) => r.dimension === d)
      if (ds.length < 5) return { dimension: d, n: ds.length, corr: null }
      const mx = ds.reduce((s, r) => s + r.predicted, 0) / ds.length
      const my = ds.reduce((s, r) => s + r.actual, 0) / ds.length
      let num = 0, dx = 0, dy = 0
      for (const r of ds) { num += (r.predicted - mx) * (r.actual - my); dx += (r.predicted - mx) ** 2; dy += (r.actual - my) ** 2 }
      return { dimension: d, n: ds.length, corr: dx > 0 && dy > 0 ? Math.round((num / Math.sqrt(dx * dy)) * 100) / 100 : null }
    })
    return { n: overall.length, meanAbsError: mae, byDimension }
  } catch {
    return { n: 0, meanAbsError: null, byDimension: DIMENSIONS.map((d) => ({ dimension: d, n: 0, corr: null })) }
  }
}

export { DEFAULT_WEIGHTS }
