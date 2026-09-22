// Distress scoring by signal stacking — DISTRESSED_LEAD_ENGINE_SPEC.md §3.
//
// THE IDEA THE WHOLE ENGINE RESTS ON. One signal is noise. A tax-delinquent
// property might be an oversight; a vacant one might be between tenants; an
// absentee owner might be a perfectly happy landlord. Three of those on the
// same parcel is almost always someone who wants out. So signals ADD, and the
// score is a statement about how many independent pieces of evidence point the
// same way — not how bad any single one looks.
//
// WHY SIGNALS DECAY. A notice of default is about the next ninety days; a code
// violation from 2019 tells you nothing about today. Scoring a four-year-old
// filing at full weight is how a lead list fills with properties that sold
// eighteen months ago. Each signal carries its own half-life from the spec, and
// an undated signal is scored at a DISCOUNT rather than at full value — we do
// not know it is current, and not knowing is not the same as knowing it is.
//
// WHAT THIS DOES NOT DO. It does not invent signals, infer them from a model,
// or reward a property for being in a good market. It reads the signals a lead
// already carries, scores each against a published table, applies age, and adds
// them up. Every point is traceable to a row in §3.1.

export type SignalType =
  | "NOD" | "LIS_PENDENS" | "NOTS" | "SHERIFF_SALE" | "REO"
  | "TAX_DELINQUENT_2YR" | "TAX_DELINQUENT_4YR" | "TAX_DEED_SALE"
  | "BANKRUPTCY" | "PROBATE" | "DIVORCE"
  | "CODE_VIOLATION" | "MECHANICS_LIEN" | "HOA_LIEN" | "IRS_LIEN"
  | "VACANT" | "ABSENTEE" | "EXPIRED_LISTING" | "PRICE_CUT"
  | "UTILITY_SHUTOFF" | "DAYS_DELINQUENT_90" | "CONDEMNED"
  | "MILITARY_PCS" | "DEATH_NOTICE" | "PRIOR_FORECLOSURE" | "NEGATIVE_EQUITY"

interface SignalRule {
  points: number
  /** Days over which the signal loses its value. null = it does not decay. */
  halfLifeDays: number | null
  label: string
  /** Priority tier from §1.2, carried through for routing. */
  tier: 1 | 2 | 3 | 4 | 5
}

// §3.1, verbatim. Changing a number here changes every lead's rank, so the
// table is kept as a table rather than scattered through the code.
export const SIGNAL_RULES: Record<SignalType, SignalRule> = {
  NOTS:               { points: 50, halfLifeDays: null, label: "Notice of trustee sale", tier: 1 },
  NOD:                { points: 40, halfLifeDays: null, label: "Notice of default", tier: 1 },
  LIS_PENDENS:        { points: 40, halfLifeDays: null, label: "Lis pendens filed", tier: 1 },
  SHERIFF_SALE:       { points: 40, halfLifeDays: null, label: "Sheriff sale scheduled", tier: 1 },
  CONDEMNED:          { points: 35, halfLifeDays: null, label: "Condemned / demolition order", tier: 1 },
  TAX_DELINQUENT_4YR: { points: 35, halfLifeDays: null, label: "Tax delinquent 4+ years", tier: 1 },
  TAX_DEED_SALE:      { points: 35, halfLifeDays: null, label: "Tax deed sale pending", tier: 1 },
  DAYS_DELINQUENT_90: { points: 30, halfLifeDays: 180,  label: "90+ days mortgage delinquent", tier: 1 },
  BANKRUPTCY:         { points: 30, halfLifeDays: null, label: "Bankruptcy filed", tier: 1 },
  TAX_DELINQUENT_2YR: { points: 25, halfLifeDays: null, label: "Tax delinquent 2+ years", tier: 1 },
  MILITARY_PCS:       { points: 25, halfLifeDays: 90,   label: "Military relocation orders", tier: 2 },
  PROBATE:            { points: 20, halfLifeDays: 365,  label: "Probate open", tier: 2 },
  DIVORCE:            { points: 20, halfLifeDays: 180,  label: "Divorce filing", tier: 2 },
  IRS_LIEN:           { points: 20, halfLifeDays: null, label: "Federal tax lien", tier: 2 },
  VACANT:             { points: 20, halfLifeDays: null, label: "Vacant (confirmed)", tier: 3 },
  DEATH_NOTICE:       { points: 20, halfLifeDays: 180,  label: "Death notice matched", tier: 3 },
  NEGATIVE_EQUITY:    { points: 20, halfLifeDays: null, label: "Underwater (LTV > 100%)", tier: 3 },
  REO:                { points: 18, halfLifeDays: null, label: "Bank-owned (REO)", tier: 2 },
  CODE_VIOLATION:     { points: 15, halfLifeDays: 540,  label: "Active code violation", tier: 2 },
  HOA_LIEN:           { points: 15, halfLifeDays: null, label: "HOA lien", tier: 2 },
  EXPIRED_LISTING:    { points: 15, halfLifeDays: 365,  label: "Expired listing (90+ days)", tier: 2 },
  UTILITY_SHUTOFF:    { points: 15, halfLifeDays: 30,   label: "Utility shutoff", tier: 3 },
  PRIOR_FORECLOSURE:  { points: 15, halfLifeDays: null, label: "Prior foreclosure within 5 years", tier: 4 },
  MECHANICS_LIEN:     { points: 10, halfLifeDays: null, label: "Mechanic's lien", tier: 3 },
  ABSENTEE:           { points: 10, halfLifeDays: null, label: "Absentee / out-of-state owner", tier: 3 },
  PRICE_CUT:          { points: 10, halfLifeDays: 90,   label: "Price cut over 10%", tier: 3 },
}

export type DistressTier = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "MONITOR"

// §3.1 bands.
export const TIER_BANDS: Array<{ tier: DistressTier; min: number; action: string }> = [
  { tier: "CRITICAL", min: 90, action: "Contact immediately — phone, door knock and letter the same day." },
  { tier: "HIGH",     min: 75, action: "Contact within 48 hours." },
  { tier: "MEDIUM",   min: 60, action: "Add to the outreach sequence." },
  { tier: "LOW",      min: 40, action: "Watchlist — add to the drip campaign." },
  { tier: "MONITOR",  min: 0,  action: "Check back quarterly." },
]

// An undated signal is real but unproven as CURRENT. Scoring it at full weight
// treats a filing of unknown age like one filed this morning, which is how a
// lead list silently fills with resolved situations. Scoring it at zero throws
// away most of what the open-data sources publish, since many carry no date at
// all. Three-quarters keeps it useful and honest about the uncertainty.
export const UNDATED_SIGNAL_FACTOR = 0.75

// Below this a decayed signal is contributing noise, and carrying it makes a
// stale lead look substantiated by "five signals".
export const SIGNAL_FLOOR_POINTS = 2

export interface DetectedSignal {
  type: SignalType
  /** When the underlying event happened. Null when the source does not say. */
  date: string | Date | null
  source?: string
}

export interface ScoredSignal {
  type: SignalType
  label: string
  basePoints: number
  points: number
  ageDays: number | null
  decayed: boolean
  dated: boolean
  source: string | null
  basis: string
}

export interface DistressScore {
  score: number
  tier: DistressTier
  action: string
  signals: ScoredSignal[]
  /** Signals dropped for being too old to mean anything. */
  expired: ScoredSignal[]
  /** Distinct live signals — the stacking count, which matters on its own. */
  stackCount: number
  /** Best (lowest) priority tier among live signals, for routing. */
  priorityTier: number | null
  summary: string
}

function ageInDays(date: string | Date | null, now: Date): number | null {
  if (!date) return null
  const t = date instanceof Date ? date.getTime() : Date.parse(String(date))
  if (!Number.isFinite(t)) return null
  return Math.max(0, (now.getTime() - t) / 86_400_000)
}

/**
 * Exponential decay on a half-life, which is how these signals actually behave:
 * a probate filing does not stop mattering on a cliff edge at day 365, it
 * matters steadily less.
 */
export function decayFactor(ageDays: number, halfLifeDays: number | null): number {
  if (halfLifeDays === null) return 1
  if (ageDays <= 0) return 1
  return Math.pow(0.5, ageDays / halfLifeDays)
}

export function scoreDistress(detected: DetectedSignal[], now: Date = new Date()): DistressScore {
  const live: ScoredSignal[] = []
  const expired: ScoredSignal[] = []

  // ONE EVENT MUST NOT SCORE TWICE.
  //
  // A scheduled sheriff sale arrives as foreclosureStage NOTICE_OF_SALE *and*
  // as the text "Sheriff sale scheduled", so it matched both NOTS (50) and
  // SHERIFF_SALE (40) and scored 90 — CRITICAL — off a single filing. They are
  // two names for the same courthouse date, and the same is true of a trustee
  // sale notice. Within each group only the strongest survives, so stacking
  // still means independent evidence rather than a lead that was described
  // twice.
  const EXCLUSIVE_GROUPS: SignalType[][] = [
    ["NOTS", "SHERIFF_SALE"],
    ["TAX_DELINQUENT_4YR", "TAX_DELINQUENT_2YR", "TAX_DEED_SALE"],
    ["VACANT", "UTILITY_SHUTOFF"],
  ]

  // The same signal from two sources is one piece of evidence, not two. Keeping
  // the freshest instance means corroboration improves the DATE rather than
  // doubling the points — which is what would let one event reported by three
  // aggregators produce a CRITICAL lead on its own.
  const best = new Map<SignalType, DetectedSignal>()
  for (const signal of detected) {
    if (!SIGNAL_RULES[signal.type]) continue
    const existing = best.get(signal.type)
    if (!existing) { best.set(signal.type, signal); continue }
    const a = ageInDays(signal.date, now)
    const b = ageInDays(existing.date, now)
    if (b === null && a !== null) best.set(signal.type, signal)
    else if (a !== null && b !== null && a < b) best.set(signal.type, signal)
  }

  for (const group of EXCLUSIVE_GROUPS) {
    const present = group.filter(t => best.has(t))
    if (present.length < 2) continue
    // Keep whichever carries the most weight; drop the rest.
    const strongest = present.reduce((a, b) => (SIGNAL_RULES[a].points >= SIGNAL_RULES[b].points ? a : b))
    for (const t of present) if (t !== strongest) best.delete(t)
  }

  for (const signal of best.values()) {
    const rule = SIGNAL_RULES[signal.type]
    const age = ageInDays(signal.date, now)
    const dated = age !== null

    const decay = dated ? decayFactor(age, rule.halfLifeDays) : UNDATED_SIGNAL_FACTOR
    const points = Math.round(rule.points * decay * 10) / 10

    const scored: ScoredSignal = {
      type: signal.type,
      label: rule.label,
      basePoints: rule.points,
      points,
      ageDays: age === null ? null : Math.round(age),
      decayed: dated && decay < 0.999,
      dated,
      source: signal.source ?? null,
      basis: !dated
        ? `${rule.label} — no date published, so scored at ${Math.round(UNDATED_SIGNAL_FACTOR * 100)}% of ${rule.points} rather than assumed current.`
        : rule.halfLifeDays === null
          ? `${rule.label} — ${Math.round(age)} days old, does not decay.`
          : `${rule.label} — ${Math.round(age)} days old against a ${rule.halfLifeDays}-day half-life, so ${rule.points} becomes ${points}.`,
    }

    if (points < SIGNAL_FLOOR_POINTS) expired.push(scored)
    else live.push(scored)
  }

  live.sort((a, b) => b.points - a.points)

  // §3.2: the raw total can exceed 100 and is capped there.
  const raw = live.reduce((sum, s) => sum + s.points, 0)
  const score = Math.min(100, Math.round(raw))

  const band = TIER_BANDS.find(b => score >= b.min) ?? TIER_BANDS[TIER_BANDS.length - 1]
  const priorityTier = live.length
    ? Math.min(...live.map(s => SIGNAL_RULES[s.type].tier))
    : null

  const summary = live.length === 0
    ? expired.length > 0
      // "No signals" and "signals that have gone stale" are different facts,
      // and the second is worth knowing: it says this WAS a lead once.
      ? `No live distress signals — ${expired.length} decayed below the floor ` +
        `(oldest ${Math.max(...expired.map(e => e.ageDays ?? 0))} days). This was a lead once; it is not now.`
      : "No live distress signals — nothing here points to a motivated seller."
    : `${score}/100 (${band.tier}) from ${live.length} live signal(s): ` +
      live.slice(0, 4).map(s => `${s.label} ${s.points}`).join(", ") +
      (raw > 100 ? ` — raw total ${Math.round(raw)}, capped at 100.` : ".") +
      (expired.length ? ` ${expired.length} signal(s) decayed below the floor and were dropped.` : "")

  return { score, tier: band.tier, action: band.action, signals: live, expired, stackCount: live.length, priorityTier, summary }
}

// ── Reading signals off the leads we actually produce ─────────────────────────

// Maps the phrases our own sources emit onto the spec's taxonomy. Ordered most
// specific first: "tax deed" must not be swallowed by "tax delinquent", and
// "notice of trustee sale" must not be read as a generic "notice of sale".
const SIGNAL_PATTERNS: Array<[RegExp, SignalType]> = [
  [/notice of trustee|trustee'?s sale|nots\b/i, "NOTS"],
  [/notice of default|\bnod\b|registered foreclosure/i, "NOD"],
  [/lis pendens|action to foreclose|foreclosure complaint/i, "LIS_PENDENS"],
  [/sheriff'?s? sale|execution sale|judicial sale/i, "SHERIFF_SALE"],
  [/condemn|unsafe structure|demolition|demo order|unfit for occupancy/i, "CONDEMNED"],
  [/tax deed|forfeited land|tax certificate|tax lien sale/i, "TAX_DEED_SALE"],
  [/tax delinquent|delinquent tax/i, "TAX_DELINQUENT_2YR"],
  [/bankrupt|chapter 7|chapter 13|automatic stay/i, "BANKRUPTCY"],
  [/probate|estate of|decedent|letters testamentary|inherited/i, "PROBATE"],
  [/divorce|dissolution of marriage/i, "DIVORCE"],
  [/irs lien|federal tax lien/i, "IRS_LIEN"],
  [/hoa lien|homeowners.{0,3} association|assessment lien/i, "HOA_LIEN"],
  [/mechanic'?s lien/i, "MECHANICS_LIEN"],
  [/code violation|code enforcement|building violation|nuisance/i, "CODE_VIOLATION"],
  [/vacant|abandoned/i, "VACANT"],
  [/absentee|out.of.state owner/i, "ABSENTEE"],
  [/expired listing/i, "EXPIRED_LISTING"],
  [/price cut|price reduction/i, "PRICE_CUT"],
  [/utility shutoff|disconnect/i, "UTILITY_SHUTOFF"],
  [/eviction/i, "CODE_VIOLATION"],
  [/bank.owned|\breo\b/i, "REO"],
]

export interface SignalSource {
  rawSignals?: string[] | null
  foreclosureStage?: string | null
  recordingDate?: string | null
  auctionDate?: string | null
  occupancy?: string | null
  ownerName?: string | null
  /** Owner's mailing address differs from the property — absentee. */
  ownerIsAbsentee?: boolean | null
  taxYearsDelinquent?: number | null
}

/**
 * Extract the spec's signals from a lead as our sources actually describe it.
 *
 * Text matching is the honest mechanism here: our open-data sources emit
 * human-readable tags ("Tax delinquent (open data)"), not typed enums. Matching
 * is deterministic and every pattern is visible above — no model is asked what
 * a signal means.
 */
export function detectSignals(lead: SignalSource): DetectedSignal[] {
  const found = new Map<SignalType, DetectedSignal>()
  const date = lead.recordingDate || null

  const add = (type: SignalType, when: string | null = date, source?: string) => {
    if (!found.has(type)) found.set(type, { type, date: when, source })
  }

  for (const raw of lead.rawSignals ?? []) {
    if (!raw) continue
    for (const [pattern, type] of SIGNAL_PATTERNS) {
      if (pattern.test(raw)) { add(type, date, raw); break }   // first match only
    }
  }

  // Structured fields outrank text, so they are read separately rather than
  // being stringified into the same soup.
  const stage = (lead.foreclosureStage ?? "").toUpperCase()
  if (stage === "NOTICE_OF_DEFAULT") add("NOD")
  if (stage === "LIS_PENDENS") add("LIS_PENDENS")
  if (stage === "NOTICE_OF_SALE" || stage === "AUCTION") add("NOTS", lead.auctionDate || date)

  if ((lead.occupancy ?? "").toLowerCase() === "vacant") add("VACANT")
  if (lead.ownerIsAbsentee === true) add("ABSENTEE")

  // Four years is a materially stronger signal than two and the spec scores it
  // separately; only the higher one is kept so the same arrears is not counted twice.
  const years = lead.taxYearsDelinquent ?? null
  if (years !== null && years >= 4) {
    found.delete("TAX_DELINQUENT_2YR")
    add("TAX_DELINQUENT_4YR")
  } else if (years !== null && years >= 2) {
    add("TAX_DELINQUENT_2YR")
  }

  // "Estate of", "Heirs of" and similar in a vesting name is a probate signal in
  // its own right, and often the only one a county publishes.
  const owner = (lead.ownerName ?? "").toLowerCase()
  if (/\bestate of\b|\bheirs?\b|\bdeceased\b|\bdecd\b/.test(owner)) add("PROBATE")

  return [...found.values()]
}

/** Detect and score in one step, which is how callers want it. */
export function scoreLeadDistress(lead: SignalSource, now: Date = new Date()): DistressScore {
  return scoreDistress(detectSignals(lead), now)
}
