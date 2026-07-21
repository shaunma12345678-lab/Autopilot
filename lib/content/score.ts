// Virality scoring — weighted composite over dimension sub-scores. Weights are
// PER-PROFILE data, not code (spec §5.3): initialized to defaults, later nudged
// by the learning loop as real outcomes accumulate. Pure helpers.

export const DIMENSIONS = [
  "hook", "share", "save", "novelty", "trendTiming",
  "audienceFit", "voiceFit", "productionCost", "downsideRisk",
  "retention", "conversion",
] as const

export type Dimension = (typeof DIMENSIONS)[number]
export type DimensionScores = Record<Dimension, number>
export type DimensionWeights = Record<Dimension, number>

export const DEFAULT_WEIGHTS: DimensionWeights = {
  hook: 0.18,
  share: 0.13,
  save: 0.08,
  novelty: 0.11,
  trendTiming: 0.07,
  audienceFit: 0.10,
  voiceFit: 0.06,
  productionCost: 0.05,
  downsideRisk: 0.04,
  retention: 0.08,      // will they GET STUCK and watch to the end
  conversion: 0.10,     // will they take the objective's next step
}

export function normalizeWeights(w: Partial<DimensionWeights> | null | undefined): DimensionWeights {
  const merged: DimensionWeights = { ...DEFAULT_WEIGHTS, ...(w ?? {}) }
  const sum = DIMENSIONS.reduce((s, d) => s + Math.max(0, merged[d]), 0)
  if (sum <= 0) return { ...DEFAULT_WEIGHTS }
  const out = {} as DimensionWeights
  for (const d of DIMENSIONS) out[d] = Math.max(0, merged[d]) / sum
  return out
}

// The nine original dimensions are required; retention/conversion were added
// later, so a model that omits them shouldn't sink the whole row — they
// default to a neutral 50 rather than rejecting an otherwise-valid scoring.
const SOFT_DEFAULT_DIMS = new Set<Dimension>(["retention", "conversion"])

export function sanitizeDimensions(raw: unknown): DimensionScores | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  const out = {} as DimensionScores
  for (const d of DIMENSIONS) {
    const n = Number(r[d])
    if (!Number.isFinite(n)) {
      if (SOFT_DEFAULT_DIMS.has(d)) { out[d] = 50; continue }
      return null
    }
    out[d] = Math.max(0, Math.min(100, Math.round(n)))
  }
  return out
}

// The composite 0-100 the feed ranks by.
export function compositeScore(dims: DimensionScores, weights: DimensionWeights): number {
  let s = 0
  for (const d of DIMENSIONS) s += dims[d] * weights[d]
  return Math.round(s * 10) / 10
}
