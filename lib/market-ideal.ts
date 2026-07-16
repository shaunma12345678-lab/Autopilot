// The Ideal Market benchmark — what a top-tier investor market looks like, as
// explicit target numbers, and how THIS market compares criterion by
// criterion: meets / close / misses, with the exact gap. Includes the legal
// layer (landlord friendliness, eviction speed, rent control, STR rules) since
// law is part of what makes a market ideal. Pure and synchronous.

import type { Fundamentals } from "@/lib/market-fundamentals"
import type { RentalIntel } from "@/lib/rental-intel"

export type IdealStatus = "meets" | "close" | "miss" | "unknown"

export interface IdealRow {
  key: string
  label: string
  ideal: string            // the target you'd aim for
  actual: string           // this market's number
  status: IdealStatus
  gap: string              // how far off, in plain terms
}

export interface IdealComparison {
  rows: IdealRow[]
  laws: IdealRow[]         // the friendliness layer, same shape
  fitScore: number         // 0-100: how close this market is to the ideal
  metCount: number
  totalKnown: number
  summary: string
}

interface Metric {
  key: string
  label: string
  ideal: string
  // value extractor + evaluator: returns [actualDisplay, status, gapNote]
  read: (f: Fundamentals | null, r: RentalIntel | null) => [string, IdealStatus, string]
}

function judge(v: number | null | undefined, meets: (n: number) => boolean, close: (n: number) => boolean, fmt: (n: number) => string, gapWhenMiss: (n: number) => string): [string, IdealStatus, string] {
  if (v == null) return ["—", "unknown", "no data for this place"]
  if (meets(v)) return [fmt(v), "meets", "on target"]
  if (close(v)) return [fmt(v), "close", "within striking distance"]
  return [fmt(v), "miss", gapWhenMiss(v)]
}

const pct = (n: number) => `${n > 0 ? "+" : ""}${n}%`
const pctAbs = (n: number) => `${n}%`

const METRICS: Metric[] = [
  { key: "popGrowth", label: "Population growth (5yr)", ideal: "≥ +4%",
    read: (f) => judge(f?.popGrowth5yr, (n) => n >= 4, (n) => n >= 1, pct, (n) => `${(4 - n).toFixed(1)}pts below target — demand isn't compounding`) },
  { key: "jobs", label: "Job growth (YoY)", ideal: "≥ +1.5%",
    read: (f) => judge(f?.jobGrowthPct, (n) => n >= 1.5, (n) => n >= 0.5, pct, (n) => n <= 0 ? "shedding jobs — rent demand at risk" : "hiring too slowly to drive rents") },
  { key: "migration", label: "People moving in (1yr)", ideal: "≥ 3%",
    read: (f) => judge(f?.inboundMigrationPct, (n) => n >= 3, (n) => n >= 1.8, pctAbs, () => "not a magnet city — growth depends on locals") },
  { key: "rentalVacancy", label: "Rental vacancy", ideal: "≤ 5%",
    read: (f) => judge(f?.rentalVacancyPct, (n) => n <= 5, (n) => n <= 8, pctAbs, (n) => `${(n - 5).toFixed(1)}pts too soft — expect gaps between tenants`) },
  { key: "occupancy", label: "Housing occupancy", ideal: "≥ 90%",
    read: (f) => judge(f?.occupancyPct, (n) => n >= 90, (n) => n >= 85, pctAbs, () => "too much empty housing — verify block by block") },
  { key: "yield", label: "Gross rent yield", ideal: "≥ 7%",
    read: (f) => judge(f?.grossYield, (n) => n >= 7, (n) => n >= 5.5, pctAbs, () => "prices too high vs rents for comfortable cash flow") },
  { key: "p2i", label: "Price-to-income", ideal: "≤ 4.5×",
    read: (f) => judge(f?.priceToIncome, (n) => n <= 4.5, (n) => n <= 6, (n) => `${n}×`, () => "locals priced out — appreciation likely capped") },
  { key: "cashflow", label: "Median-door cash flow (today's rate)", ideal: "≥ $0/mo",
    read: (_f, r) => judge(r?.cashflowGap, (n) => n >= 0, (n) => n >= -300, (n) => `${n >= 0 ? "+" : ""}$${n}/mo`, (n) => `$${Math.abs(n)}/mo negative — needs deep discounts to pencil`) },
  { key: "rentGrowth", label: "Rent growth (12mo)", ideal: "≥ +3%",
    read: (_f, r) => judge(r?.rentYoY, (n) => n >= 3, (n) => n >= 1, pct, (n) => n < 0 ? "rents falling" : "rents flat — raises not baked in") },
  { key: "priceTrend", label: "Price trend (12mo)", ideal: "+2% to +8%",
    read: (_f, r) => judge(r?.priceYoY, (n) => n >= 2 && n <= 8, (n) => n >= 0 && n <= 12, pct, (n) => n < 0 ? "declining prices — catch-a-falling-knife risk" : n > 8 ? "overheating — late-cycle risk" : "stagnant") },
  { key: "drawdown", label: "Worst 10-yr drawdown", ideal: "≤ 10%",
    read: (_f, r) => judge(r?.drawdown10y, (n) => n <= 10, (n) => n <= 18, (n) => `−${n}%`, (n) => `has fallen ${n}% from a peak — size your reserves for it`) },
  { key: "poverty", label: "Poverty rate", ideal: "≤ 15%",
    read: (f) => judge(f?.povertyRate, (n) => n <= 15, (n) => n <= 22, pctAbs, () => "C/D-class economics — go block by block") },
]

const GRADE_RANK: Record<string, number> = { A: 5, B: 4, C: 3, D: 2, F: 1 }

export function buildIdealComparison(f: Fundamentals | null, r: RentalIntel | null): IdealComparison {
  const rows: IdealRow[] = METRICS.map((m) => {
    const [actual, status, gap] = m.read(f, r)
    return { key: m.key, label: m.label, ideal: m.ideal, actual, status, gap }
  })

  // The friendliness layer: state landlord law + city STR rule.
  const laws: IdealRow[] = []
  if (r?.landlord) {
    const g = r.landlord.grade
    laws.push({
      key: "landlordLaw", label: `Landlord law (${r.landlord.state})`, ideal: "grade B or better",
      actual: `${g} · ~${r.landlord.evictionDays}d eviction${r.landlord.rentControl ? " · rent control" : ""}`,
      status: GRADE_RANK[g] >= 4 ? "meets" : GRADE_RANK[g] === 3 ? "close" : "miss",
      gap: GRADE_RANK[g] >= 4 ? "enforceable leases, quick remedies" : GRADE_RANK[g] === 3 ? "workable but slower evictions" : `tenant-heavy: ~${r.landlord.evictionDays}-day evictions${r.landlord.rentControl ? " + rent control caps your upside" : ""}`,
    })
    laws.push({
      key: "rentControl", label: "Rent control", ideal: "none",
      actual: r.landlord.rentControl ? "present" : "none",
      status: r.landlord.rentControl ? "miss" : "meets",
      gap: r.landlord.rentControl ? "caps rent growth — underwrite to the allowed increase, not market" : "rents can move with the market",
    })
  } else {
    laws.push({ key: "landlordLaw", label: "Landlord law", ideal: "grade B or better", actual: "—", status: "unknown", gap: "state not rated yet" })
  }
  if (r?.strRule) {
    laws.push({
      key: "strZone", label: "Short-term rental rules (city)", ideal: "friendly or simple permit",
      actual: r.strRule.status.toUpperCase(),
      status: r.strRule.status === "friendly" || r.strRule.status === "permit" ? "meets" : r.strRule.status === "restricted" ? "close" : "miss",
      gap: `${r.strRule.note} — verify the current ordinance and your exact zone before buying for STR`,
    })
  } else {
    laws.push({ key: "strZone", label: "Short-term rental rules (city)", ideal: "friendly or simple permit", actual: "—", status: "unknown", gap: "not in our curated table — check the city ordinance" })
  }

  const all = [...rows, ...laws]
  const known = all.filter((x) => x.status !== "unknown")
  const met = known.filter((x) => x.status === "meets").length
  const closeN = known.filter((x) => x.status === "close").length
  const fitScore = known.length ? Math.round(((met + closeN * 0.5) / known.length) * 100) : 0

  const misses = all.filter((x) => x.status === "miss").map((x) => x.label)
  const summary =
    fitScore >= 75 ? `This market meets ${met} of ${known.length} ideal criteria — close to what you'd aim for.` :
    fitScore >= 50 ? `Meets ${met} of ${known.length} ideal criteria — workable, with clear gaps: ${misses.slice(0, 3).join(", ") || "see below"}.` :
    `Far from the ideal profile (${met} of ${known.length} criteria met). The gaps that matter: ${misses.slice(0, 4).join(", ") || "see below"}.`

  return { rows, laws, fitScore, metCount: met, totalKnown: known.length, summary }
}
