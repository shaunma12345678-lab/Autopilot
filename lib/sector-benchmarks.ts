// Sector-relative normalization — the single biggest accuracy fix available
// to the stock scorer.
//
// A 15% net margin means opposite things for enterprise software and for a
// grocery chain. Absolute thresholds systematically over-rate asset-light
// sectors and under-rate everything else. This module compares a company
// against same-sector peers in OUR OWN accumulated Ticker table, which means
// the benchmark quality compounds as the dataset grows — competitors can copy
// the formula but not the accumulated distribution.
//
// Honest limitation: with few peers the percentile is meaningless, so below a
// minimum peer count this returns null and the scorer falls back to absolute
// thresholds rather than pretending to have sector context it doesn't have.
import { prisma } from "@/lib/prisma"

const MIN_PEERS_FOR_BENCHMARK = 5
const CACHE_TTL_MS = 60 * 60 * 1000

// SIC major-group ranges → coarse sector buckets. Broad on purpose: narrow
// SIC codes fragment the peer set below usable size.
export function sectorBucket(sicCode: string | null | undefined): string {
  const sic = Number(sicCode)
  if (!sicCode || !isFinite(sic)) return "unknown"
  if (sic < 1000) return "agriculture"
  if (sic < 1500) return "mining-energy"
  if (sic < 1800) return "construction"
  if (sic < 4000) return "manufacturing"
  if (sic < 5000) return "transport-utilities"
  if (sic < 5200) return "wholesale"
  if (sic < 6000) return "retail"
  if (sic < 6800) return "finance"
  if (sic < 8900) return "services"
  return "other"
}

export interface SectorBenchmark {
  bucket: string
  peerCount: number
  medians: Record<string, number>
}

const BENCHMARKED_METRICS = [
  "netMarginPct", "operatingMarginPct", "grossMarginPct",
  "roePct", "fcfMarginPct", "revenueGrowthYoyPct", "debtToEquity",
] as const

type BenchmarkedMetric = typeof BENCHMARKED_METRICS[number]

const cache = new Map<string, { benchmark: SectorBenchmark; fetchedAt: number }>()

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

export async function getSectorBenchmark(sicCode: string | null): Promise<SectorBenchmark | null> {
  const bucket = sectorBucket(sicCode)
  if (bucket === "unknown") return null

  const cached = cache.get(bucket)
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.benchmark

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const peers = await (prisma.ticker as any).findMany({
      where: { dataConfidence: { in: ["medium", "high"] } },
      select: {
        sicCode: true, netMarginPct: true, operatingMarginPct: true, grossMarginPct: true,
        roePct: true, fcfMarginPct: true, revenueGrowthYoyPct: true, debtToEquity: true,
      },
      take: 2000,
    }) as Array<Record<string, unknown>>

    const inBucket = peers.filter(p => sectorBucket(p.sicCode as string | null) === bucket)
    if (inBucket.length < MIN_PEERS_FOR_BENCHMARK) return null

    const medians: Record<string, number> = {}
    for (const metric of BENCHMARKED_METRICS) {
      const values = inBucket
        .map(p => p[metric])
        .filter((v): v is number => typeof v === "number" && isFinite(v))
      if (values.length >= MIN_PEERS_FOR_BENCHMARK) medians[metric] = median(values)
    }

    const benchmark: SectorBenchmark = { bucket, peerCount: inBucket.length, medians }
    cache.set(bucket, { benchmark, fetchedAt: Date.now() })
    return benchmark
  } catch {
    return null
  }
}

export interface SectorRelativeResult {
  score: number | null       // 0-100, 50 = at the sector median
  peerCount: number
  bucket: string
  notes: string[]
}

// Scores a company against its sector median on each benchmarked metric.
// 50 means "typical for this sector"; higher means better than peers.
export function scoreAgainstSector(
  values: Partial<Record<BenchmarkedMetric, number | null>>,
  benchmark: SectorBenchmark | null
): SectorRelativeResult {
  if (!benchmark) return { score: null, peerCount: 0, bucket: "unknown", notes: [] }

  const notes: string[] = []
  const perMetric: number[] = []

  for (const metric of BENCHMARKED_METRICS) {
    const value = values[metric]
    const med = benchmark.medians[metric]
    if (value === null || value === undefined || med === undefined || !isFinite(value)) continue

    // Debt-to-equity is inverted — lower is better.
    const lowerIsBetter = metric === "debtToEquity"
    const denominator = Math.abs(med) || 1
    const relative = (value - med) / denominator
    const directional = lowerIsBetter ? -relative : relative

    // ±100% vs. the sector median maps to the ends of the 0-100 range.
    perMetric.push(Math.max(0, Math.min(100, 50 + directional * 50)))

    if (Math.abs(relative) > 0.5) {
      const better = directional > 0
      notes.push(`${metric.replace(/Pct$/, "")} is ${better ? "well above" : "well below"} the ${benchmark.bucket} sector median.`)
    }
  }

  if (perMetric.length === 0) return { score: null, peerCount: benchmark.peerCount, bucket: benchmark.bucket, notes }

  const score = Math.round(perMetric.reduce((s, v) => s + v, 0) / perMetric.length)
  return { score, peerCount: benchmark.peerCount, bucket: benchmark.bucket, notes: notes.slice(0, 3) }
}
