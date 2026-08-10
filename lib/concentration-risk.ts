// Customer and geographic concentration — segment-level risk that XBRL
// doesn't summarize anywhere else in this system.
//
// WHAT THIS IS NOT. True ASC 280 segment reporting is dimensional XBRL:
// revenue broken out by an "axis" (customer, geography, product line) inside
// the filing's own XBRL instance document. SEC's companyfacts API — the
// source every other file in this system reads — collapses facts to
// entity-level, non-dimensional values only; the dimensional breakdown is not
// exposed there. Parsing it properly means fetching and interpreting the
// filing's raw XBRL instance or R-file exhibits, whose structure varies
// enough between filers that it's a separate, much larger project.
//
// WHAT THIS IS INSTEAD. The same primary documents this system already
// fetches for narrative reading (Item 1 Business, Item 7 MD&A) routinely
// state concentration in prose, because it's a required risk disclosure:
// "our largest customer accounted for 18% of revenue" or "62% of our revenue
// was generated outside the United States." This scans that prose the same
// deterministic way lib/narrative-extract.ts scans for promotional claims —
// rules over a bounded, legally-constrained vocabulary, not a model guessing
// at numbers it might invert.
//
// Customer concentration is scored as risk: a single counterparty losing a
// contract is a real, well-documented equity risk. Geographic concentration
// is reported as a fact, not a penalty — a company being US-concentrated or
// globally diversified is a business-model characteristic, not a defect.
export interface ConcentrationRead {
  customerConcentrationSentences: string[]
  geographicConcentrationSentences: string[]
  /** Highest single-customer percentage found in the text, if any. */
  maxCustomerPct: number | null
  /** Risk-worthy findings only (customer concentration). */
  flags: string[]
  /** Informational findings (geographic mix) — never penalized. */
  notes: string[]
  riskPenalty: number
}

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map(s => s.trim())
    .filter(s => s.length > 40 && s.length < 500)
}

const CUSTOMER_RE = /\b(one customer|a single customer|our largest customer|one client|top (five|5|ten|10) customers?)\b[\s\S]{0,80}?\b(accounted for|represented|comprised)\b/i
const GEOGRAPHIC_RE = /\b(outside the united states|international (revenue|sales|operations)|non-u\.s\.\s?(revenue|sales|operations)|foreign operations)\b/i
const PCT_RE = /(\d{1,3}(?:\.\d+)?)\s?%/

function trim(s: string): string {
  return s.length > 300 ? `${s.slice(0, 297)}...` : s
}

export function detectConcentrationRisk(business: string | null, mdna: string | null): ConcentrationRead | null {
  const text = [business, mdna].filter(Boolean).join("\n\n")
  // Same floor as narrative-extract.ts: below this there isn't enough prose
  // for absence of a concentration statement to mean anything.
  if (text.length < 2000) return null

  const customerConcentrationSentences: string[] = []
  const geographicConcentrationSentences: string[] = []
  let maxCustomerPct: number | null = null

  for (const s of sentences(text)) {
    if (CUSTOMER_RE.test(s) && PCT_RE.test(s)) {
      customerConcentrationSentences.push(trim(s))
      const m = s.match(PCT_RE)
      const pct = m ? Number(m[1]) : NaN
      if (isFinite(pct) && (maxCustomerPct === null || pct > maxCustomerPct)) maxCustomerPct = pct
    } else if (GEOGRAPHIC_RE.test(s) && PCT_RE.test(s)) {
      geographicConcentrationSentences.push(trim(s))
    }
  }

  if (customerConcentrationSentences.length === 0 && geographicConcentrationSentences.length === 0) {
    return { customerConcentrationSentences: [], geographicConcentrationSentences: [], maxCustomerPct: null, flags: [], notes: [], riskPenalty: 0 }
  }

  const flags: string[] = []
  let riskPenalty = 0
  // A single counterparty above roughly a tenth of revenue is a real
  // concentration risk; above a quarter is severe. Thresholds mirror how this
  // system treats other single-point-of-failure risks (e.g. debt maturity
  // walls in balance-sheet-risk.ts) — a fact-based penalty, not a guess.
  if (maxCustomerPct !== null && maxCustomerPct >= 10) {
    riskPenalty = maxCustomerPct >= 25 ? 12 : 6
    flags.push(`⚠ Customer concentration disclosed in the filing: "${customerConcentrationSentences[0]}"`)
  }

  const notes: string[] = geographicConcentrationSentences.length > 0
    ? [`Geographic revenue mix disclosed in the filing: "${geographicConcentrationSentences[0]}"`]
    : []

  return { customerConcentrationSentences, geographicConcentrationSentences, maxCustomerPct, flags, notes, riskPenalty }
}
