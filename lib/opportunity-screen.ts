// The opportunity screen — an actual good list.
//
// WHY THIS EXISTS SEPARATELY FROM EVERYTHING ELSE. This system had two ranked
// lists and neither was a list of good investments:
//
//   Top Ranked surfaces the highest quality scores, which returns Apple,
//   Alphabet and Broadcom. Those are excellent companies and terrible ideas to
//   present as finds — twenty analysts cover each of them, and this system's own
//   backtest measured the quality score's forward-return edge at roughly zero
//   (quartile spread +0.06% at 90 days, -1.00% on the broad universe).
//
//   Discovery surfaces filing events, which returns restatements, bankruptcies
//   and going-concern doubt. Those are the WORST companies to own, ranked
//   highest, by construction. It is a risk detector, not an idea generator.
//
// So the population that a good list should come from was never being ranked at
// all: sound, under-covered companies trading below their own historical norm.
//
// WHAT THIS RANKS ON, AND WHY IT IS NOT THE QUALITY SCORE. The only axis this
// system has measured real forward-return signal in is valuation — cheapness
// versus a company's own history (+1.09% at 90 days, +6.04% at one year, and
// the effect strengthens with horizon exactly as the value literature predicts).
// Quality is used here ONLY as a disqualifier, never as a ranking term, because
// that is what the evidence supports: quality tells you whether a business is
// sound, and price tells you whether you are being paid to own it.
//
// EXCLUSIONS ARE GATES, NOT PENALTIES. A company with a restatement does not
// get a lower score — it is removed. Averaging a disqualifying fact into a
// composite lets a cheap price hide it, which is precisely how a screen ends up
// recommending companies that are about to fail.
import { prisma } from "@/lib/prisma"
import { ELITE_FILERS, getFilerChanges, normalizeIssuer, type HoldingChange } from "@/lib/institutional-holdings"

export interface OpportunityRow {
  symbol: string
  name: string
  sector: string | null
  exchange: string | null
  qualityScore: number | null
  riskScore: number | null
  valuationScore: number | null
  valuationPercentile: number | null
  fcfYieldPct: number | null
  piotroskiScore: number | null
  altmanZone: string | null
  revenueTtm: number | null
  /** Why it survived every gate, in plain language. */
  reasons: string[]
  /** What is still wrong with it. A screen that only lists positives is a
   *  brochure, not an analysis. */
  cautions: string[]
  /** Independent confirmation from managers who filed a 13F on it. */
  smartMoney: string[]
}

// ── Disqualifiers ──────────────────────────────────────────────────────────
//
// Every one of these is a fact that invalidates the thesis rather than a score
// that lowers it.

const MIN_QUALITY = 55           // sound business, not merely a cheap one
const MAX_RISK = 55              // no stacked balance-sheet or governance risk
const MIN_PIOTROSKI = 5          // financial trend not deteriorating
const MIN_VALUATION = 55         // priced at or below its own historical norm

// Mega-caps are excluded on purpose. Piotroski's documented outperformance was
// concentrated in small, low-coverage names, and the edge available from
// reading filings is smallest where the most analysts already read them. A
// screen that returns Apple is not finding anything.
const MAX_REVENUE_FOR_EDGE = 50_000_000_000

// Below this a company is too small to be a realistic, liquid holding and the
// filings are frequently thin. Exchange listing already removes most shells;
// this removes the rest.
const MIN_REVENUE = 100_000_000

interface TickerRow {
  symbol: string; name: string; sector: string | null; exchange: string | null; sicCode: string | null
  qualityScore: number | null; riskScore: number | null; dataConfidence: string
  valuationScore: number | null; valuationPercentile: number | null; fcfYieldPct: number | null
  piotroskiScore: number | null; altmanZone: string | null; beneishFlag: boolean | null
  goingConcernHits: number | null; revenueTtm: number | null; freeCashFlowTtm: number | null
  hasRestatement: boolean | null; debtWallToFcfYears: number | null
  actionSignal: string | null; riskFlags: unknown
  convictionTier: string | null; convictionSummary: string | null; credibilityScore: number | null
  falsificationFragility: string | null; falsificationSummary: string | null
  falsificationTriggered: unknown
}

// Shared with the other stock rankings (/api/stocks/top-picks,
// /api/markets/top-ranked) — every fact here is a hard disqualifier, not a
// score penalty, so nothing that fails one of these should ever be called a
// "top" anything regardless of which list is asking or how it ranks.
export function hasDisqualifyingRedFlag(t: TickerRow): string | null {
  if (t.dataConfidence !== "high" && t.dataConfidence !== "medium") {
    return "not enough verified filing data to judge"
  }
  if (t.goingConcernHits !== null && t.goingConcernHits > 0) {
    return "auditors raised substantial doubt about its ability to continue operating"
  }
  if (t.hasRestatement) {
    return "restated its financials — the numbers every ratio depends on are not reliable"
  }
  if (t.altmanZone === "distress") {
    return "Altman Z-Score places it in the bankruptcy distress zone"
  }
  if (t.beneishFlag) {
    return "Beneish M-Score flags a statistically elevated likelihood of earnings manipulation"
  }
  // Conviction is 10 independent gates — financial trend, cash conversion,
  // multi-year durability, forward indicators, governance, and whether
  // management's narrative actually matches the audited numbers. Failing
  // enough of those to land in the bottom tier is itself a red flag even when
  // no single fact above triggered on its own; a company can look clean on
  // every individual check and still be badly run.
  if (t.convictionTier === "below-bar") {
    return t.convictionSummary ?? "failed too many independent quality gates (governance, consistency, or credibility)"
  }

  return null
}

// Exported for unit testing the full threshold set alongside
// hasDisqualifyingRedFlag; runOpportunityScreen is the only production caller.
export function disqualify(t: TickerRow): string | null {
  // ── Facts that end the conversation ──────────────────────────────────────
  const redFlag = hasDisqualifyingRedFlag(t)
  if (redFlag) return redFlag

  // ── Thresholds ───────────────────────────────────────────────────────────
  if (t.qualityScore === null || t.qualityScore < MIN_QUALITY) {
    return "the underlying business does not score as sound"
  }
  if (t.riskScore !== null && t.riskScore > MAX_RISK) {
    return "carries too many simultaneous risk flags"
  }
  if (t.piotroskiScore !== null && t.piotroskiScore < MIN_PIOTROSKI) {
    return "Piotroski F-Score shows a deteriorating financial trend"
  }
  if (t.valuationScore === null || t.valuationScore < MIN_VALUATION) {
    return "not priced below its own historical norm — there is no discount to collect"
  }

  // Cheap because it is burning cash is not cheap.
  if (t.freeCashFlowTtm !== null && t.freeCashFlowTtm <= 0) {
    return "free cash flow is negative, so the low price reflects cash burn rather than a discount"
  }

  // ── Coverage and size ────────────────────────────────────────────────────
  if (t.revenueTtm === null) return "revenue not available"
  if (t.revenueTtm < MIN_REVENUE) return "too small to be a realistic liquid holding"
  if (t.revenueTtm > MAX_REVENUE_FOR_EDGE) {
    return "already covered by every analyst — no informational edge available here"
  }

  return null
}

function buildReasons(t: TickerRow): string[] {
  const out: string[] = []
  if (t.valuationPercentile !== null) {
    out.push(`Trading cheaper than ${t.valuationPercentile.toFixed(0)}% of its own history — the one axis this system has measured real forward-return signal in.`)
  }
  if (t.fcfYieldPct !== null && t.fcfYieldPct > 0) {
    out.push(`Generates a ${t.fcfYieldPct.toFixed(1)}% free-cash-flow yield, so the discount is attached to real cash rather than to an accounting profit.`)
  }
  if (t.piotroskiScore !== null) {
    out.push(`Piotroski F-Score ${t.piotroskiScore}/9 — financial trend is improving, not deteriorating.`)
  }
  if (t.altmanZone === "safe") {
    out.push("Altman Z-Score sits in the safe zone, so the low price is not distress pricing.")
  }
  if (t.revenueTtm !== null) {
    out.push(`About $${(t.revenueTtm / 1e9).toFixed(1)}B of revenue — large enough to be liquid, small enough that reading the filings still carries an edge.`)
  }
  if (t.convictionTier === "elite" || t.convictionTier === "high") {
    out.push(`Conviction: ${t.convictionSummary ?? t.convictionTier} — cleared the independent governance/consistency/credibility gates, not just the score thresholds.`)
  }
  if (t.credibilityScore !== null && t.credibilityScore >= 85) {
    out.push(`Management's narrative matches the audited numbers (credibility ${t.credibilityScore}/100) — no contradiction found between what they say and what they filed.`)
  }
  return out
}

function buildCautions(t: TickerRow): string[] {
  const out: string[] = []
  if (t.debtWallToFcfYears !== null && t.debtWallToFcfYears > 1.5) {
    out.push(`About ${t.debtWallToFcfYears.toFixed(1)} years of free cash flow comes due as debt within 12 months.`)
  }
  if (t.riskScore !== null && t.riskScore >= 40) {
    out.push(`Risk score ${t.riskScore} — meaningful even though it clears the bar.`)
  }
  if (t.altmanZone === "grey") {
    out.push("Altman Z-Score is in the grey zone: not distressed, but not clearly safe either.")
  }
  if (t.convictionTier === "standard") {
    out.push(`Conviction: ${t.convictionSummary ?? "cleared the bar but failed some independent quality gates"}.`)
  }
  if (t.credibilityScore !== null && t.credibilityScore < 75) {
    out.push(`Credibility ${t.credibilityScore}/100 — some tension between management's narrative and the audited numbers.`)
  } else if (t.credibilityScore === null) {
    out.push("Management's narrative hasn't been cross-checked against the numbers yet (no deep-research pass done).")
  }
  const triggered = Array.isArray(t.falsificationTriggered) ? (t.falsificationTriggered as string[]) : []
  if (triggered.length > 0) {
    out.push(`A condition previously stated as thesis-breaking has since triggered: ${triggered[0]}`)
  } else if (t.falsificationFragility === "fragile") {
    out.push(`Fragile case: ${t.falsificationSummary ?? "at least one thesis-breaking condition sits close to tripping"}`)
  }
  const flags = Array.isArray(t.riskFlags) ? (t.riskFlags as string[]) : []
  for (const f of flags.slice(0, 3)) out.push(f)
  if (out.length === 0) {
    out.push("No material caution surfaced — which means none was found, not that none exists.")
  }
  return out
}

export async function runOpportunityScreen(limit = 25): Promise<{
  rows: OpportunityRow[]
  screened: number
  rejected: Record<string, number>
}> {
  // Institutional position changes, fetched once for the whole screen rather
  // than per company. This is CONFIRMATION, never a gate: a manager buying is
  // one more independent party reaching the same conclusion, but the 45-day
  // filing lag means it can never be a reason to include something that failed
  // the fundamentals.
  const institutional: HoldingChange[] = []
  for (const filer of ELITE_FILERS) {
    const changes = await getFilerChanges(filer).catch(() => [])
    institutional.push(...changes)
  }
  const buysByIssuer = new Map<string, HoldingChange[]>()
  for (const c of institutional) {
    if (c.changeType !== "new_position" && c.changeType !== "increased") continue
    const key = normalizeIssuer(c.issuer)
    if (!key) continue
    const arr = buysByIssuer.get(key) ?? []
    arr.push(c)
    buysByIssuer.set(key, arr)
  }

  // Paginated: PostgREST caps an unbounded select at 1,000 rows and returns the
  // truncation silently, which would quietly screen only part of the universe.
  const all: TickerRow[] = []
  const PAGE = 1000
  for (let skip = 0; skip < 12000; skip += PAGE) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page = await (prisma.ticker as any).findMany({
      where: { dataConfidence: { not: "insufficient" } },
      take: PAGE, skip,
    }) as TickerRow[]
    all.push(...page)
    if (page.length < PAGE) break
  }

  const rejected: Record<string, number> = {}
  const survivors: TickerRow[] = []
  for (const t of all) {
    const reason = disqualify(t)
    if (reason) {
      rejected[reason] = (rejected[reason] ?? 0) + 1
      continue
    }
    survivors.push(t)
  }

  // Ranked on valuation, NOT on quality — quality already did its job as a
  // gate, and ranking on it would reproduce the mega-cap list this screen
  // exists to avoid.
  survivors.sort((a, b) => (b.valuationScore ?? 0) - (a.valuationScore ?? 0))

  // SECTOR CAP. Cheapness is strongly correlated within an industry: when
  // energy sells off, every energy name screens cheap at once. Without a cap a
  // valuation-ranked list silently becomes a single-sector bet wearing the
  // appearance of diversification — the user sees eight independent ideas and
  // owns one macro position. Taking the best few per sector keeps the ranking
  // intact while forcing the list to span more than one thesis.
  const MAX_PER_SECTOR = 3
  const perSector = new Map<string, number>()
  const diversified: TickerRow[] = []
  for (const t of survivors) {
    const key = t.sector ?? t.sicCode?.slice(0, 2) ?? "unknown"
    const n = perSector.get(key) ?? 0
    if (n >= MAX_PER_SECTOR) continue
    perSector.set(key, n + 1)
    diversified.push(t)
    if (diversified.length >= limit) break
  }

  return {
    rows: diversified.map(t => ({
      symbol: t.symbol, name: t.name, sector: t.sector, exchange: t.exchange,
      qualityScore: t.qualityScore, riskScore: t.riskScore,
      valuationScore: t.valuationScore, valuationPercentile: t.valuationPercentile,
      fcfYieldPct: t.fcfYieldPct, piotroskiScore: t.piotroskiScore,
      altmanZone: t.altmanZone, revenueTtm: t.revenueTtm,
      reasons: buildReasons(t), cautions: buildCautions(t),
      smartMoney: (buysByIssuer.get(normalizeIssuer(t.name)) ?? []).map(c =>
        `${c.filer} ${c.changeType === "new_position" ? "opened a new position" : `increased ${c.changePct?.toFixed(0)}%`} ($${(c.valueUsd / 1e6).toFixed(0)}M) as of ${c.asOfDate} — filed 45 days after quarter end, so a research lead rather than a current position.`),
    })),
    screened: all.length,
    rejected,
  }
}
