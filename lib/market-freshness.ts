// Is the data actually staying up to date?
//
// The crons exist — stocks every 20 minutes, crypto hourly — but nothing checks
// that they are keeping up. A refresh loop that quietly falls behind produces
// exactly the same screen as one that is working: assets, scores, rankings. The
// only difference is that the numbers are hours or days old, and a ranking built
// on stale prices is worse than no ranking, because it looks current.
//
// So the question is asked directly: of everything we track, how much has been
// re-scored recently enough to trust, and what is the oldest thing still being
// presented as if it were fresh.

import { prisma } from "@/lib/prisma"

export interface FreshnessReport {
  domain: "stocks" | "crypto"
  tracked: number
  /** Re-scored inside the window the cron is supposed to guarantee. */
  fresh: number
  /** Past the window but still recent enough to be worth showing. */
  aging: number
  /** Old enough that the figures should not be relied on. */
  stale: number
  /** Never scored at all — created by bulk ingest and never enriched. */
  neverScored: number
  freshPct: number
  oldestHours: number | null
  medianAgeHours: number | null
  status: "healthy" | "falling-behind" | "stalled" | "no-data"
  note: string
}

// Derived from the cron cadence, with room for a run to be skipped. Stocks
// refresh every 20 minutes but the queue is long, so a company waits its turn;
// crypto refreshes hourly in batches of twelve.
const WINDOWS: Record<"stocks" | "crypto", { freshHours: number; agingHours: number }> = {
  stocks: { freshHours: 24, agingHours: 72 },
  crypto: { freshHours: 12, agingHours: 48 },
}

// Below this share of fresh rows the refresh loop is not keeping up with the
// universe it is being asked to cover.
const FALLING_BEHIND_PCT = 60
const STALLED_PCT = 25
// Never-scored rows are a different failure from stale ones. A row scored six
// days ago means the loop is slow; a row never scored at all means enrichment
// never reached it, which is what a half-finished bulk ingest looks like. Once
// they are most of the universe the domain is stalled however the percentages
// fall out.
const STALLED_NEVER_SCORED_SHARE = 0.5

function hoursSince(value: Date | string | null | undefined): number | null {
  if (!value) return null
  const then = value instanceof Date ? value.getTime() : Date.parse(String(value))
  if (!Number.isFinite(then)) return null
  return (Date.now() - then) / 3_600_000
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** Turns a list of last-scored timestamps into a verdict. Pure, so it is testable. */
export function assessFreshness(
  domain: "stocks" | "crypto",
  lastScoredAt: Array<Date | string | null>,
): FreshnessReport {
  const { freshHours, agingHours } = WINDOWS[domain]
  const tracked = lastScoredAt.length

  if (tracked === 0) {
    return {
      domain, tracked: 0, fresh: 0, aging: 0, stale: 0, neverScored: 0,
      freshPct: 0, oldestHours: null, medianAgeHours: null,
      status: "no-data", note: "Nothing is being tracked in this domain yet.",
    }
  }

  const ages: number[] = []
  let fresh = 0, aging = 0, stale = 0, neverScored = 0

  for (const value of lastScoredAt) {
    const age = hoursSince(value)
    if (age === null) { neverScored++; continue }
    ages.push(age)
    if (age <= freshHours) fresh++
    else if (age <= agingHours) aging++
    else stale++
  }

  const freshPct = Math.round((fresh / tracked) * 100)
  const oldestHours = ages.length ? Math.round(Math.max(...ages) * 10) / 10 : null
  const medianAgeHours = ages.length ? Math.round(median(ages)! * 10) / 10 : null

  let status: FreshnessReport["status"]
  let note: string

  const neverScoredShare = neverScored / tracked

  if (neverScoredShare >= STALLED_NEVER_SCORED_SHARE) {
    status = "stalled"
    note = `${neverScored} of ${tracked} have never been scored at all — enrichment is not reaching ` +
           `them. Check that the cron is running and authorised.`
  } else if (freshPct >= FALLING_BEHIND_PCT) {
    status = "healthy"
    note = `${freshPct}% re-scored within ${freshHours}h. The refresh loop is keeping up.`
  } else if (freshPct >= STALLED_PCT) {
    status = "falling-behind"
    note = `Only ${freshPct}% re-scored within ${freshHours}h — the queue is longer than the ` +
           `cron can clear. Raise the batch size or narrow the universe.`
  } else {
    status = "stalled"
    note = `Just ${freshPct}% re-scored within ${freshHours}h` +
           (neverScored > 0 ? `, and ${neverScored} have never been scored at all` : "") +
           `. Check that the cron is running and authorised.`
  }

  return { domain, tracked, fresh, aging, stale, neverScored, freshPct, oldestHours, medianAgeHours, status, note }
}

export async function readFreshness(domain: "stocks" | "crypto"): Promise<FreshnessReport> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const model = (domain === "crypto" ? prisma.cryptoAsset : prisma.ticker) as any
    const rows = await model.findMany({ select: { lastScoredAt: true } }) as Array<{ lastScoredAt: Date | null }>
    return assessFreshness(domain, rows.map(r => r.lastScoredAt))
  } catch {
    return assessFreshness(domain, [])
  }
}
