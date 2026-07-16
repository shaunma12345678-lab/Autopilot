// Market history — "what's this market been DOING over the years?" Two layers:
//   1. MEASURED series: Zillow price/rent windows (1/3/5/10-yr) + the Wikidata
//      population time-series — real multi-year data, available immediately.
//   2. OUR OWN longitudinal tracker: ACS metrics (vacancy, rental vacancy,
//      migration, renter share) and our scores exist only as "latest" from any
//      free source — so we SNAPSHOT them on every analysis run. From today the
//      platform accumulates a per-market time-series nobody can backfill: the
//      own-data pattern again. Verdicts compare oldest vs newest snapshot.
// Server-only, AgentMemory-persisted, best-effort.

import { prisma } from "@/lib/prisma"
import { resolveLearningBusinessId } from "@/lib/learning-store"
import type { Fundamentals } from "@/lib/market-fundamentals"
import type { RentalIntel } from "@/lib/rental-intel"

const SLUG = "market-history"
const CAP = 60           // ~5 years of monthly snapshots
const MIN_GAP_MS = 6 * 24 * 60 * 60 * 1000   // at most ~weekly snapshots

export interface MarketSnapshot {
  at: string
  vacancy: number | null
  rentalVacancy: number | null
  migration: number | null
  renterShare: number | null
  jobs: number | null
  medianValue: number | null
  medianRent: number | null
  health: number | null
  upside: number | null
}

export interface TrendVerdict { metric: string; from: string; to: string; direction: "improving" | "declining" | "flat"; note: string }

export interface MarketHistory {
  price: { y1: number | null; y3: number | null; y5: number | null; y10: number | null }   // %/yr
  rent: { y1: number | null; y3: number | null; y5: number | null }
  population: Array<{ year: number; pop: number }>
  trackedSince: string | null
  snapshots: number
  verdicts: TrendVerdict[]
  trajectory: "improving" | "mixed" | "declining" | "too-early"
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mem = () => prisma.agentMemory as any

function key(city: string, state: string): string {
  return `${city.toLowerCase().trim()}:${state.toUpperCase().trim()}`
}

async function loadSnapshots(bizId: string, k: string): Promise<MarketSnapshot[]> {
  try {
    const row = await mem().findFirst({ where: { businessId: bizId, agentSlug: SLUG, key: k } })
    if (row?.value) { const p = JSON.parse(row.value); if (Array.isArray(p)) return p }
  } catch { /* first run */ }
  return []
}

// Append one snapshot per market per week — every analysis/cron call compounds
// the longitudinal record.
export async function recordSnapshot(city: string, state: string, f: Fundamentals | null, scores: { health: number | null; upside: number | null }): Promise<MarketSnapshot[]> {
  const k = key(city, state)
  try {
    const bizId = await resolveLearningBusinessId()
    if (!bizId) return []
    const snaps = await loadSnapshots(bizId, k)
    const last = snaps[snaps.length - 1]
    const snap: MarketSnapshot = {
      at: new Date().toISOString(),
      vacancy: f?.vacancyRate ?? null,
      rentalVacancy: f?.rentalVacancyPct ?? null,
      migration: f?.inboundMigrationPct ?? null,
      renterShare: f?.renterSharePct ?? null,
      jobs: f?.jobGrowthPct ?? null,
      medianValue: f?.medianHomeValue ?? null,
      medianRent: f?.medianRent ?? null,
      health: scores.health,
      upside: scores.upside,
    }
    if (!last || Date.now() - Date.parse(last.at) >= MIN_GAP_MS) {
      const next = [...snaps, snap].slice(-CAP)
      const value = JSON.stringify(next)
      await mem().upsert({
        where:  { businessId: bizId, agentSlug: SLUG, key: k },
        create: { id: crypto.randomUUID(), businessId: bizId, agentSlug: SLUG, key: k, value, updatedAt: new Date().toISOString() },
        update: { value, updatedAt: new Date().toISOString() },
      })
      return next
    }
    return snaps
  } catch {
    return []
  }
}

const fmtVal = (metric: string, v: number): string =>
  metric.includes("value") || metric.includes("rent$") ? `$${Math.round(v).toLocaleString()}` : `${v}%`

function verdictFor(metric: string, label: string, oldV: number | null, newV: number | null, higherIsBetter: boolean, minDelta: number): TrendVerdict | null {
  if (oldV == null || newV == null) return null
  const delta = newV - oldV
  const direction: TrendVerdict["direction"] = Math.abs(delta) < minDelta ? "flat" : (delta > 0) === higherIsBetter ? "improving" : "declining"
  return {
    metric: label,
    from: fmtVal(metric, oldV), to: fmtVal(metric, newV),
    direction,
    note: direction === "flat" ? "holding steady" : `${delta > 0 ? "+" : ""}${Math.round(delta * 10) / 10}${metric.includes("value") || metric.includes("rent$") ? "" : "pts"} since tracking began`,
  }
}

export function buildMarketHistory(f: Fundamentals | null, r: RentalIntel | null, snapshots: MarketSnapshot[]): MarketHistory {
  const price = { y1: r?.priceYoY ?? null, y3: r?.price3yrAnnual ?? null, y5: r?.price5yrAnnual ?? null, y10: r?.price10yrAnnual ?? null }
  const rent = { y1: r?.rentYoY ?? null, y3: r?.rent3yrAnnual ?? null, y5: r?.rent5yrAnnual ?? null }
  const population = f?.popSeries ?? []

  const verdicts: TrendVerdict[] = []
  // Measured long-run verdicts from the real series.
  if (price.y5 != null) verdicts.push({ metric: "price5", from: "", to: `${price.y5 > 0 ? "+" : ""}${price.y5}%/yr`, direction: price.y5 >= 3 ? "improving" : price.y5 >= 0 ? "flat" : "declining", note: "5-yr price trend (Zillow)" })
  if (rent.y3 != null) verdicts.push({ metric: "rent3", from: "", to: `${rent.y3 > 0 ? "+" : ""}${rent.y3}%/yr`, direction: rent.y3 >= 2.5 ? "improving" : rent.y3 >= 0 ? "flat" : "declining", note: "3-yr rent trend (Zillow)" })
  if (population.length >= 2) {
    const first = population[0], last = population[population.length - 1]
    const pct = first.pop > 0 ? Math.round(((last.pop / first.pop - 1) * 100) * 10) / 10 : 0
    verdicts.push({ metric: "pop", from: `${first.pop.toLocaleString()} (${first.year})`, to: `${last.pop.toLocaleString()} (${last.year})`, direction: pct >= 1 ? "improving" : pct <= -1 ? "declining" : "flat", note: `${pct > 0 ? "+" : ""}${pct}% ${first.year}→${last.year}` })
  }
  // Our-tracker verdicts (need ≥2 snapshots spaced out).
  if (snapshots.length >= 2) {
    const a = snapshots[0], b = snapshots[snapshots.length - 1]
    const pairs: Array<TrendVerdict | null> = [
      verdictFor("vacancy", "Vacancy", a.vacancy, b.vacancy, false, 0.3),
      verdictFor("rentalVacancy", "Rental vacancy", a.rentalVacancy, b.rentalVacancy, false, 0.3),
      verdictFor("migration", "People moving in", a.migration, b.migration, true, 0.2),
      verdictFor("jobs", "Job growth", a.jobs, b.jobs, true, 0.3),
      verdictFor("value", "Median value", a.medianValue, b.medianValue, true, 1),
      verdictFor("rent$", "Median rent", a.medianRent, b.medianRent, true, 1),
    ]
    for (const p of pairs) if (p) verdicts.push(p)
  }

  const counted = verdicts.filter((v) => v.direction !== "flat")
  const improving = counted.filter((v) => v.direction === "improving").length
  const trajectory: MarketHistory["trajectory"] =
    verdicts.length < 2 ? "too-early"
    : counted.length === 0 ? "mixed"
    : improving / counted.length >= 0.65 ? "improving"
    : improving / counted.length <= 0.35 ? "declining"
    : "mixed"

  return {
    price, rent, population,
    trackedSince: snapshots[0]?.at ?? null,
    snapshots: snapshots.length,
    verdicts,
    trajectory,
  }
}
