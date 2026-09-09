// Did we actually look at every database we meant to look at?
//
// THE GAP THIS CLOSES. Both market pipelines wrap every external call in
// `.catch(() => null)` — forty of them between stocks and crypto. That is the
// right instinct: one flaky provider must not take down an entire analysis. But
// it means a source can be broken for weeks and nothing anywhere says so. The
// asset still scores, the ranking still renders, and the only symptom is that
// the numbers are quietly worse than they should be.
//
// That is not hypothetical. TVL read as zero for every layer-1 for as long as
// the code asked DefiLlama for a *protocol* by that name, because chains are a
// different endpoint. Each individual failure looked exactly like "this asset
// has no TVL", which is a perfectly ordinary thing for an asset not to have.
//
// THE RULE THAT SEPARATES THEM. One asset missing a field is normal. EVERY
// asset missing the same field is a broken source. That distinction cannot be
// drawn from a single analysis — it only exists across a run — so coverage is
// recorded per call, aggregated per source, and judged by rate.
//
// Deterministic and dependency-free throughout. Whether a call returned data is
// a fact, not a judgement.

export type SourceOutcome =
  /** Returned usable data. */
  | "ok"
  /** Reached, but had nothing for this subject — normal and often correct. */
  | "empty"
  /** Threw or timed out. */
  | "failed"
  /** Deliberately not called; a precondition was absent. */
  | "skipped"

export interface SourceAttempt {
  source: string
  outcome: SourceOutcome
  /** Wall-clock milliseconds, so a source that is slow rather than broken shows. */
  ms: number
  error?: string
}

export interface CoverageLog {
  subject: string
  attempts: SourceAttempt[]
}

export interface CoverageSummary {
  subject: string
  total: number
  ok: number
  empty: number
  failed: number
  skipped: number
  /** Share of sources that were actually called AND returned data. */
  completenessPct: number
  failedSources: string[]
  emptySources: string[]
}

export interface SourceHealth {
  source: string
  attempts: number
  ok: number
  empty: number
  failed: number
  /** Of the calls actually made, the share that came back with data. */
  okRate: number
  failRate: number
  emptyRate: number
  /** Slowest observed call, which is usually where a timeout is about to appear. */
  worstMs: number
  status: "healthy" | "degraded" | "broken" | "insufficient-data"
  note: string
}

export function newCoverage(subject: string): CoverageLog {
  return { subject, attempts: [] }
}

/** True for the shapes an adapter uses to mean "nothing here". */
function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === "object") return Object.keys(value as object).length === 0
  return false
}

/**
 * Run one source call, recording what happened, and return its value.
 *
 * Swallows failures exactly as the raw `.catch(() => null)` did, so wrapping a
 * call cannot change pipeline behaviour — the only difference is that the
 * failure is now written down somewhere.
 */
export async function track<T>(
  log: CoverageLog,
  source: string,
  run: () => Promise<T>,
  options: { skip?: boolean; empty?: (value: T) => boolean } = {},
): Promise<T | null> {
  if (options.skip) {
    log.attempts.push({ source, outcome: "skipped", ms: 0 })
    return null
  }

  const started = Date.now()
  try {
    const value = await run()
    const empty = options.empty ? options.empty(value) : isEmptyValue(value)
    log.attempts.push({ source, outcome: empty ? "empty" : "ok", ms: Date.now() - started })
    return value
  } catch (error) {
    log.attempts.push({
      source,
      outcome: "failed",
      ms: Date.now() - started,
      error: error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200),
    })
    return null
  }
}

/**
 * Record a source call WITHOUT swallowing its failure.
 *
 * Some calls are load-bearing: without SEC facts there is no analysis, and the
 * pipeline is right to abort rather than score a company on nothing. Wrapping
 * those in the forgiving `track` would silently turn a hard failure into a
 * quietly incomplete result, so they get this instead — the outcome is written
 * down and the error still propagates.
 */
export async function trackStrict<T>(
  log: CoverageLog,
  source: string,
  run: () => Promise<T>,
  options: { empty?: (value: T) => boolean } = {},
): Promise<T> {
  const started = Date.now()
  try {
    const value = await run()
    const empty = options.empty ? options.empty(value) : isEmptyValue(value)
    log.attempts.push({ source, outcome: empty ? "empty" : "ok", ms: Date.now() - started })
    return value
  } catch (error) {
    log.attempts.push({
      source,
      outcome: "failed",
      ms: Date.now() - started,
      error: error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200),
    })
    throw error
  }
}

export function summarize(log: CoverageLog): CoverageSummary {
  const count = (outcome: SourceOutcome) => log.attempts.filter(a => a.outcome === outcome).length
  const ok = count("ok")
  const called = log.attempts.length - count("skipped")

  return {
    subject: log.subject,
    total: log.attempts.length,
    ok,
    empty: count("empty"),
    failed: count("failed"),
    skipped: count("skipped"),
    completenessPct: called === 0 ? 0 : Math.round((ok / called) * 100),
    failedSources: log.attempts.filter(a => a.outcome === "failed").map(a => a.source),
    emptySources: log.attempts.filter(a => a.outcome === "empty").map(a => a.source),
  }
}

// A source is judged only once there are enough attempts for a rate to mean
// anything. Below this, "broken" and "we only asked it twice" are the same
// picture, and calling an outage on two samples produces false alarms.
export const MIN_ATTEMPTS_TO_JUDGE = 4
export const BROKEN_FAIL_RATE = 0.8
export const BROKEN_EMPTY_RATE = 0.95
export const DEGRADED_FAIL_RATE = 0.3

export function aggregate(logs: CoverageLog[]): SourceHealth[] {
  const bySource = new Map<string, SourceAttempt[]>()
  for (const log of logs) {
    for (const attempt of log.attempts) {
      const list = bySource.get(attempt.source) ?? []
      list.push(attempt)
      bySource.set(attempt.source, list)
    }
  }

  const healths: SourceHealth[] = []
  for (const [source, attempts] of bySource) {
    const called = attempts.filter(a => a.outcome !== "skipped")
    const ok = called.filter(a => a.outcome === "ok").length
    const empty = called.filter(a => a.outcome === "empty").length
    const failed = called.filter(a => a.outcome === "failed").length
    const n = called.length

    const okRate = n === 0 ? 0 : ok / n
    const failRate = n === 0 ? 0 : failed / n
    const emptyRate = n === 0 ? 0 : empty / n
    const worstMs = attempts.reduce((worst, a) => Math.max(worst, a.ms), 0)

    let status: SourceHealth["status"]
    let note: string

    if (n < MIN_ATTEMPTS_TO_JUDGE) {
      status = "insufficient-data"
      note = `Only ${n} call(s) this run — too few to tell an outage from a small sample.`
    } else if (failRate >= BROKEN_FAIL_RATE) {
      status = "broken"
      note = `Failed on ${Math.round(failRate * 100)}% of calls. This is the source, not the assets.`
    } else if (emptyRate >= BROKEN_EMPTY_RATE) {
      // The quiet one. Every call succeeds and every call returns nothing,
      // which is indistinguishable from "these assets have no data" until you
      // notice it is happening to all of them.
      status = "broken"
      note = `Reachable but returned nothing on ${Math.round(emptyRate * 100)}% of calls. ` +
             `A source that never has data for anything is almost always being asked the wrong question.`
    } else if (failRate >= DEGRADED_FAIL_RATE) {
      status = "degraded"
      note = `Failing on ${Math.round(failRate * 100)}% of calls — likely rate limiting.`
    } else {
      status = "healthy"
      note = `Returned data on ${Math.round(okRate * 100)}% of calls.`
    }

    healths.push({ source, attempts: n, ok, empty, failed, okRate, failRate, emptyRate, worstMs, status, note })
  }

  // Worst first: this list is read to find what is wrong, not to admire what works.
  const rank: Record<SourceHealth["status"], number> = {
    broken: 0, degraded: 1, "insufficient-data": 2, healthy: 3,
  }
  return healths.sort((a, b) => rank[a.status] - rank[b.status] || b.failRate - a.failRate)
}

export function brokenSources(healths: SourceHealth[]): SourceHealth[] {
  return healths.filter(h => h.status === "broken" || h.status === "degraded")
}

/** One line per problem, for a log or an alert. Empty when everything is fine. */
export function coverageAlarms(healths: SourceHealth[]): string[] {
  return brokenSources(healths).map(h => `${h.source}: ${h.note}`)
}
