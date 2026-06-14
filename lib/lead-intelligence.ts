// Lead Intelligence — the self-advancing analysis layer.
//
// Every lead the discovery engine surfaces is run through these pure, zero-cost
// passes BEFORE it reaches the user. Nothing here makes a network call, so it can
// never slow down or break a search — it only makes each lead richer and smarter:
//
//   • Auction countdown   — days until the trustee sale (urgency)
//   • Junior-lien sweep    — HELOCs / tax / HOA / judgment liens hiding behind the 1st
//   • Occupancy inference  — vacant / absentee signals from the notice text
//   • Plain-English reason  — a human sentence explaining the score & the play
//
// These functions are intentionally defensive: any unparseable input returns a
// safe default rather than throwing.

import type { FreeLead, JuniorLien } from "@/lib/free-foreclosure-scraper"

// ── Auction countdown ─────────────────────────────────────────────────────────

/** Whole days from today until `dateStr` (YYYY-MM-DD or any Date-parseable string).
 *  Negative = the date is in the past. Returns null if unparseable. */
export function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null
  const t = new Date(dateStr).getTime()
  if (Number.isNaN(t)) return null
  return Math.ceil((t - Date.now()) / 86_400_000)
}

/** Urgency band for an auction countdown — drives badge color in the UI. */
export function auctionUrgency(days: number | null): "imminent" | "soon" | "upcoming" | "none" {
  if (days == null || days < 0) return "none"
  if (days <= 7)  return "imminent"
  if (days <= 21) return "soon"
  return "upcoming"
}

// ── Junior-lien sweep (text-based, for leads without parsed context) ──────────

const TEXT_LIEN_PATTERNS: Array<{ rx: RegExp; type: JuniorLien["type"]; label: string }> = [
  { rx: /home equity line of credit|\bHELOC\b/i,                          type: "heloc",           label: "HELOC (home equity line)" },
  { rx: /second (?:deed of trust|mortgage|lien)|junior (?:lien|deed)/i,   type: "second_mortgage", label: "Second mortgage / junior deed" },
  { rx: /(?:federal|IRS) tax lien|internal revenue/i,                     type: "tax_lien",        label: "IRS federal tax lien" },
  { rx: /state tax lien|franchise tax board/i,                            type: "tax_lien",        label: "State tax lien" },
  { rx: /\bHOA\b|homeowners?[' ]?association (?:lien|assessment)/i,        type: "hoa_lien",        label: "HOA assessment lien" },
  { rx: /mechanic'?s lien|materialman'?s lien/i,                          type: "mechanics_lien",  label: "Mechanic's lien" },
  { rx: /(?:abstract of |civil )?judgment(?: lien)?|writ of execution/i,  type: "judgment",        label: "Judgment lien" },
]

/** Scan free text (raw signals, lender notes) for junior liens. */
export function detectLiensInText(text: string): JuniorLien[] {
  if (!text) return []
  const out: JuniorLien[] = []
  const seen = new Set<string>()
  for (const { rx, type, label } of TEXT_LIEN_PATTERNS) {
    if (!rx.test(text) || seen.has(label)) continue
    seen.add(label)
    out.push({ type, label, amount: null })
  }
  return out
}

// ── Per-lead enrichment pass ──────────────────────────────────────────────────

/** Enrich a raw FreeLead in place with zero-cost intelligence. Returns the same
 *  object (mutated) for convenient mapping; never throws. */
export function enrichFreeLead(lead: FreeLead): FreeLead {
  try {
    // Auction countdown
    if (lead.daysUntilAuction == null) {
      lead.daysUntilAuction = daysUntil(lead.auctionDate)
    }

    // Junior-lien sweep across any text we already hold (for direct-source leads
    // that never passed through the legal-notice context extractor).
    if (!lead.juniorLiens || lead.juniorLiens.length === 0) {
      const haystack = [...(lead.rawSignals ?? []), lead.lender ?? ""].join(" \n ")
      const liens = detectLiensInText(haystack)
      if (liens.length) lead.juniorLiens = liens
    }

    // Surface an urgency signal so it shows up in the score narrative & UI.
    if (lead.daysUntilAuction != null && lead.daysUntilAuction >= 0 && lead.daysUntilAuction <= 21) {
      const tag = `Auction in ${lead.daysUntilAuction} day${lead.daysUntilAuction === 1 ? "" : "s"} — act now`
      if (!lead.rawSignals?.includes(tag)) lead.rawSignals = [...(lead.rawSignals ?? []), tag]
    }
  } catch {
    // Intelligence is best-effort — a parse failure must never break a search.
  }
  return lead
}

// ── Plain-English score narrative ─────────────────────────────────────────────

function money(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return ""
  if (Math.abs(n) >= 1000) return `$${Math.round(n / 1000)}k`
  return `$${Math.round(n)}`
}

const STAGE_PHRASE: Record<string, string> = {
  NOTICE_OF_DEFAULT: "a Notice of Default",
  LIS_PENDENS:       "a foreclosure lawsuit (lis pendens)",
  NOTICE_OF_SALE:    "a Notice of Sale",
  AUCTION:           "a scheduled auction",
  PRE_FORECLOSURE:   "early pre-foreclosure",
}

/** Build a single human sentence that explains WHY this lead scored as it did and
 *  what the play is — far more useful than a row of progress bars. */
export function plainEnglishReason(input: {
  priority:        "HOT" | "WARM" | "COLD"
  score:           number
  foreclosureStage: string
  daysOnFile:      number
  equityPercent:   number | null
  estimatedEquity: number | null
  defaultAmount:   number | null
  daysUntilAuction?: number | null
  occupancy?:      FreeLead["occupancy"]
  juniorLiens?:    JuniorLien[]
  fallbackSignals?: string[]
}): string {
  const parts: string[] = []

  const stage = STAGE_PHRASE[input.foreclosureStage] ?? "a distressed filing"
  const filed = input.daysOnFile > 0
    ? `${stage} filed ${input.daysOnFile} day${input.daysOnFile === 1 ? "" : "s"} ago`
    : stage
  parts.push(`${input.priority} (${input.score}): ${filed}`)

  if (input.equityPercent != null) {
    const eqAmt = input.estimatedEquity != null ? ` (~${money(input.estimatedEquity)})` : ""
    parts.push(`~${input.equityPercent}% equity${eqAmt}`)
  }

  if (input.defaultAmount) parts.push(`${money(input.defaultAmount)} in default`)

  if (input.daysUntilAuction != null && input.daysUntilAuction >= 0) {
    parts.push(input.daysUntilAuction === 0 ? "auction is today" : `auction in ${input.daysUntilAuction} days`)
  }

  if (input.occupancy === "vacant")  parts.push("property appears vacant")
  if (input.occupancy === "absentee") parts.push("absentee owner")

  if (input.juniorLiens && input.juniorLiens.length) {
    parts.push(`⚠ ${input.juniorLiens.length} junior lien${input.juniorLiens.length === 1 ? "" : "s"} behind the first`)
  }

  // Closing recommendation keyed to priority.
  const close =
    input.priority === "HOT"  ? "Pursue first — strong, time-sensitive deal." :
    input.priority === "WARM" ? "Worth a contact — solid potential." :
                                "Lower priority — verify equity before investing time."

  if (parts.length <= 1 && input.fallbackSignals?.length) {
    return `${parts[0]} — ${input.fallbackSignals.slice(0, 2).join("; ")}. ${close}`
  }

  // Join: first part as lead clause, the rest comma-separated, then the close.
  const [head, ...rest] = parts
  const body = rest.length ? `${head} with ${rest.join(", ")}.` : `${head}.`
  return `${body} ${close}`
}
