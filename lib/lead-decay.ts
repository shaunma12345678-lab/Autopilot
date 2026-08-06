// Lead decay — why a feed stops being useful without it.
//
// A discovery event is worth the most on the day it is filed and less every day
// after, because the edge here is READING SPEED, not access. The filing is
// public to everyone the moment it lands; the only advantage available is
// reaching it before it has been widely read. A restatement surfaced the day it
// is filed is a lead. The same row six months later is a fact anyone can look
// up, and ranking them identically is what turns a feed into an archive.
//
// DIFFERENT EVENTS DECAY AT DIFFERENT RATES, and using one half-life for all of
// them would be wrong in both directions. The distinction that matters is
// whether the event describes a STATE or a MOMENT:
//
//   A state persists. A company in Chapter 11 is still in Chapter 11 next
//   month; the disclosure has not gone stale because the condition has not
//   ended. Going-concern doubt is the same — it stands until it is resolved or
//   the company fails.
//
//   A moment is news. A newly filed 10-K is most valuable in the days after it
//   lands, precisely because that is the window before anyone has read the
//   thing. A month later the risk-factor changes inside it are no longer a
//   discovery.
//
// Half-lives below are set from that distinction and from how each event
// actually resolves, not from a preference for round numbers.

export type DecayProfile = {
  halfLifeDays: number
  reasoning: string
}

const DEFAULT_HALF_LIFE = 60

const PROFILES: Record<string, DecayProfile> = {
  // ── States: slow decay ───────────────────────────────────────────────────
  bankruptcy: {
    halfLifeDays: 180,
    reasoning: "A Chapter 11 proceeding is an ongoing condition, not a one-day event — it stays true for as long as the case runs.",
  },
  going_concern: {
    halfLifeDays: 180,
    reasoning: "Substantial doubt stands until it is either resolved or the company fails. It does not become untrue by aging.",
  },
  restatement: {
    halfLifeDays: 120,
    reasoning: "Previously issued financials remain unreliable until they are restated and refiled, which typically takes months.",
  },

  // ── Clocked events: decay on the schedule they actually run on ───────────
  delisting_risk: {
    halfLifeDays: 90,
    reasoning: "Exchanges generally allow around 180 days to regain compliance, so the exposure fades on roughly that clock rather than immediately.",
  },
  auditor_change: {
    halfLifeDays: 90,
    reasoning: "Consequential mainly because of what tends to follow it, so it stays worth watching for a quarter or two.",
  },
  late_filing: {
    halfLifeDays: 45,
    reasoning: "Resolves quickly one way or the other — the company either files or it does not — so the informational value is concentrated near the notice.",
  },

  // ── Moments: fast decay ──────────────────────────────────────────────────
  ipo_pipeline: {
    halfLifeDays: 60,
    reasoning: "An S-1 leads to a listing over weeks to months; the pipeline position matters until it prices.",
  },
  insider_cluster_buy: {
    halfLifeDays: 60,
    reasoning: "Insider conviction is about a period, not a day, but its relevance fades as the price moves away from where they bought.",
  },
  annual_report: {
    halfLifeDays: 30,
    reasoning: "The value is being early to what changed in the filing. Once it has been read, the newly added risk language is no longer a discovery.",
  },
  material_agreement: {
    halfLifeDays: 30,
    reasoning: "A contract announcement is priced quickly; it is news rather than a condition.",
  },
}

export function decayProfileFor(eventType: string): DecayProfile {
  return PROFILES[eventType] ?? {
    halfLifeDays: DEFAULT_HALF_LIFE,
    reasoning: "No specific profile — decays at the default rate.",
  }
}

export function ageInDays(eventDate: Date | string, now: Date = new Date()): number {
  const d = typeof eventDate === "string" ? new Date(eventDate) : eventDate
  const ms = now.getTime() - d.getTime()
  // Filings dated in the future (timezone edges, forward-dated effective dates)
  // are treated as brand new rather than given a bonus for negative age.
  return Math.max(0, ms / 86_400_000)
}

// Exponential decay: value halves every `halfLifeDays`.
//
// Exponential rather than linear because a linear ramp implies a cliff — a date
// on which a lead becomes worth exactly nothing — and no such date exists. Old
// leads become progressively less urgent while never being flatly wrong, which
// is what an exponential curve says and a linear one does not.
export function decayedPriority(
  basePriority: number,
  eventDate: Date | string,
  eventType: string,
  now: Date = new Date()
): number {
  const { halfLifeDays } = decayProfileFor(eventType)
  const age = ageInDays(eventDate, now)
  const factor = Math.pow(0.5, age / halfLifeDays)
  return Math.round(basePriority * factor * 100) / 100
}

// Below this an event is old enough that surfacing it as a current lead would
// be misleading. It is not deleted — the history stays queryable, and an
// analyst looking at a company should still see that it restated two years ago.
export const STALE_THRESHOLD = 5

export function isStale(decayed: number): boolean {
  return decayed < STALE_THRESHOLD
}

// Human-readable freshness, so the UI can show WHY something ranks where it
// does rather than presenting an unexplained number.
export function freshnessLabel(eventDate: Date | string, now: Date = new Date()): string {
  const age = ageInDays(eventDate, now)
  if (age < 1) return "today"
  if (age < 2) return "yesterday"
  if (age < 14) return `${Math.floor(age)} days ago`
  if (age < 60) return `${Math.floor(age / 7)} weeks ago`
  if (age < 365) return `${Math.floor(age / 30)} months ago`
  return `${(age / 365).toFixed(1)} years ago`
}

export function freshnessTone(decayed: number, basePriority: number): "hot" | "warm" | "cooling" | "stale" {
  if (isStale(decayed)) return "stale"
  const retained = basePriority > 0 ? decayed / basePriority : 0
  if (retained >= 0.7) return "hot"
  if (retained >= 0.35) return "warm"
  return "cooling"
}
