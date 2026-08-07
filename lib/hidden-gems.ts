// Hidden gems — sound, cheap companies that nobody is looking at.
//
// HOW THIS DIFFERS FROM THE OPPORTUNITY SCREEN, which already exists. That
// screen ranks on valuation among companies that clear every soundness gate.
// It works, but it keeps returning the same names, because the gates are static
// and the ranking is deterministic: run it twice and you get the same eight
// companies until the underlying data moves.
//
// Two changes make this a different product rather than a re-skin:
//
//   OBSCURITY IS A REQUIREMENT, NOT A SIDE EFFECT. The measured edge in this
//   system is valuation, and Piotroski's documented outperformance was
//   concentrated in small, low-coverage names. Reading filings carefully is
//   worth most exactly where fewest people do it. So a company that elite 13F
//   filers already hold is EXCLUDED here — not because their holding it is bad,
//   but because if Baupost has found it, it is not hidden and the informational
//   edge is already priced.
//
//   ROTATION IS ENFORCED. Surfaced companies are recorded, and a name that has
//   been shown recently is suppressed even if it still qualifies. Without this
//   a "discovery" feed becomes a static list the user learns to skip, which is
//   the same failure as an alert stream nobody reads.
//
// The cost of both choices is honest: excluding institutionally-held names and
// suppressing recent picks means this list is NOT the highest-scoring companies
// available. It is the highest-scoring companies among those still unexamined,
// which is a deliberately different question.
import { prisma } from "@/lib/prisma"
import { ELITE_FILERS, getFilerChanges, normalizeIssuer } from "@/lib/institutional-holdings"

export interface HiddenGem {
  symbol: string
  name: string
  sector: string | null
  revenueTtm: number | null
  valuationScore: number | null
  valuationPercentile: number | null
  qualityScore: number | null
  piotroskiScore: number | null
  fcfYieldPct: number | null
  obscurityScore: number
  whyHidden: string[]
  whyInteresting: string[]
  cautions: string[]
}

// Same soundness gates as the opportunity screen. A gem that is cheap because
// it is failing is not a gem, and obscurity does not excuse a weak business.
const MIN_QUALITY = 55
const MAX_RISK = 55
const MIN_PIOTROSKI = 5
const MIN_VALUATION = 55

// Coverage falls off sharply with size. Above this a company has sell-side
// analysts publishing on it and the filings are already being read.
const MAX_REVENUE_FOR_OBSCURITY = 10_000_000_000
// Below this the filings are usually too thin to analyse and liquidity is poor.
const MIN_REVENUE = 150_000_000

// Days a surfaced name is suppressed before it can appear again.
const ROTATION_DAYS = 21

interface TickerRow {
  symbol: string; name: string; sector: string | null; exchange: string | null
  qualityScore: number | null; riskScore: number | null; dataConfidence: string
  valuationScore: number | null; valuationPercentile: number | null; fcfYieldPct: number | null
  piotroskiScore: number | null; altmanZone: string | null; beneishFlag: boolean | null
  goingConcernHits: number | null; revenueTtm: number | null; freeCashFlowTtm: number | null
  hasRestatement: boolean | null; benfordConformity: string | null
  federalContractValueUsd: number | null; shortTrend: string | null
}

function passesSoundness(t: TickerRow): boolean {
  if (t.dataConfidence !== "high" && t.dataConfidence !== "medium") return false
  if ((t.goingConcernHits ?? 0) > 0) return false
  if (t.hasRestatement) return false
  if (t.altmanZone === "distress") return false
  if (t.beneishFlag) return false
  if (t.benfordConformity === "nonconforming") return false
  if ((t.qualityScore ?? 0) < MIN_QUALITY) return false
  if ((t.riskScore ?? 0) > MAX_RISK) return false
  if ((t.piotroskiScore ?? 0) < MIN_PIOTROSKI) return false
  if ((t.valuationScore ?? 0) < MIN_VALUATION) return false
  if (t.freeCashFlowTtm !== null && t.freeCashFlowTtm <= 0) return false
  if (t.revenueTtm === null) return false
  if (t.revenueTtm < MIN_REVENUE || t.revenueTtm > MAX_REVENUE_FOR_OBSCURITY) return false
  return true
}

// Smaller and less institutionally visible scores higher. This is a proxy for
// analyst coverage, which is not published anywhere free — stated as a proxy
// rather than presented as a coverage count we do not have.
function obscurityScore(t: TickerRow, institutionallyHeld: boolean): number {
  if (institutionallyHeld) return 0
  const rev = t.revenueTtm ?? MAX_REVENUE_FOR_OBSCURITY
  // 150M -> ~100, 10B -> ~0, on a log scale because coverage thins
  // logarithmically with size rather than linearly.
  const span = Math.log10(MAX_REVENUE_FOR_OBSCURITY) - Math.log10(MIN_REVENUE)
  const pos = Math.log10(MAX_REVENUE_FOR_OBSCURITY) - Math.log10(Math.max(rev, MIN_REVENUE))
  return Math.round((pos / span) * 100)
}

function makeCuid(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789"
  return `c${Array.from({ length: 24 }, () => chars[Math.floor(Math.random() * chars.length)]).join("")}`
}

async function recentlySurfaced(): Promise<Set<string>> {
  const cutoff = new Date(Date.now() - ROTATION_DAYS * 86400000).toISOString()
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await (prisma.underwriteCall as any).findMany({
      where: { subjectType: "hidden_gem", predictedAt: { gte: cutoff } },
      take: 500,
    }) as Array<{ subjectId: string }>
    return new Set(rows.map(r => r.subjectId))
  } catch {
    // Fail OPEN here, unlike alerts. If the rotation store is unreadable the
    // worst outcome is repeating a name; suppressing everything would empty
    // the feed entirely, which is worse.
    return new Set()
  }
}

async function recordSurfaced(gems: HiddenGem[]): Promise<void> {
  for (const g of gems) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (prisma.underwriteCall as any).create({
        data: {
          id: makeCuid(), subjectType: "hidden_gem", subjectId: g.symbol,
          subjectLabel: `${g.symbol} — ${g.name}`,
          verdict: "surfaced", predictedScore: g.valuationScore ?? 0,
          rationale: { whyHidden: g.whyHidden, whyInteresting: g.whyInteresting },
          confidenceAtCall: g.obscurityScore,
          predictedAt: new Date().toISOString(),
          reviewAt: new Date(Date.now() + 90 * 86400000).toISOString(),
        },
      })
    } catch { /* recording must not block the result */ }
  }
}

export async function findHiddenGems(limit = 10): Promise<{
  gems: HiddenGem[]
  scanned: number
  qualified: number
  suppressedForRotation: number
  institutionallyHeldExcluded: number
}> {
  // Paginated past PostgREST's silent 1,000-row cap.
  const all: TickerRow[] = []
  const PAGE = 1000
  for (let skip = 0; skip < 20000; skip += PAGE) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page = await (prisma.ticker as any).findMany({ take: PAGE, skip }) as TickerRow[]
    all.push(...page)
    if (page.length < PAGE) break
  }

  // Which companies the elite filers already hold. Fetched once for the run.
  const institutional = new Set<string>()
  for (const filer of ELITE_FILERS) {
    const changes = await getFilerChanges(filer).catch(() => [])
    for (const c of changes) institutional.add(normalizeIssuer(c.issuer))
  }

  const seen = await recentlySurfaced()

  let qualified = 0
  let suppressedForRotation = 0
  let institutionallyHeldExcluded = 0

  const candidates: HiddenGem[] = []
  for (const t of all) {
    if (!passesSoundness(t)) continue
    qualified++

    const held = institutional.has(normalizeIssuer(t.name))
    if (held) { institutionallyHeldExcluded++; continue }
    if (seen.has(t.symbol)) { suppressedForRotation++; continue }

    const obscurity = obscurityScore(t, held)

    const whyHidden: string[] = [
      `About $${((t.revenueTtm ?? 0) / 1e9).toFixed(2)}B of revenue — small enough that few analysts publish on it, which is where reading filings carefully is worth the most.`,
      "Not held by any of the concentrated institutional managers this system tracks, so the thesis has not already been found and priced by someone with a research budget.",
    ]

    const whyInteresting: string[] = []
    if (t.valuationPercentile !== null) {
      whyInteresting.push(`Trading cheaper than ${t.valuationPercentile.toFixed(0)}% of its own history — the one axis measured to carry forward-return signal here (+5.35% out-of-sample).`)
    }
    if (t.fcfYieldPct !== null && t.fcfYieldPct > 0) {
      whyInteresting.push(`${t.fcfYieldPct.toFixed(1)}% free-cash-flow yield, so the discount attaches to real cash rather than an accounting profit.`)
    }
    if (t.piotroskiScore !== null) {
      whyInteresting.push(`Piotroski F-Score ${t.piotroskiScore}/9 — improving financial trend, and Piotroski's documented outperformance was concentrated in exactly this size band.`)
    }

    const cautions: string[] = []
    if (t.shortTrend === "building") {
      cautions.push("Short interest is building — someone with capital at risk disagrees, and at this size a crowded short is harder to exit.")
    }
    if ((t.revenueTtm ?? 0) < 500_000_000) {
      cautions.push("Small enough that liquidity and filing depth are both real constraints; position sizing matters more than the thesis.")
    }
    if (t.benfordConformity === "marginal") {
      cautions.push("Reported figures deviate mildly from the Benford distribution. Within normal accounting practice, but worth reading the filings closely.")
    }
    if (cautions.length === 0) {
      cautions.push("No material caution surfaced — which means none was found, not that none exists.")
    }

    candidates.push({
      symbol: t.symbol, name: t.name, sector: t.sector, revenueTtm: t.revenueTtm,
      valuationScore: t.valuationScore, valuationPercentile: t.valuationPercentile,
      qualityScore: t.qualityScore, piotroskiScore: t.piotroskiScore, fcfYieldPct: t.fcfYieldPct,
      obscurityScore: obscurity, whyHidden, whyInteresting, cautions,
    })
  }

  // Ranked on obscurity x cheapness, not cheapness alone — the point of this
  // list is the companies nobody has examined, so being overlooked has to
  // actually count toward the ranking rather than being a filter only.
  candidates.sort((a, b) =>
    (b.obscurityScore * (b.valuationScore ?? 0)) - (a.obscurityScore * (a.valuationScore ?? 0)))

  // One per sector. Cheapness clusters by industry, so without this the list
  // becomes a single macro bet presented as several independent finds.
  const perSector = new Map<string, number>()
  const gems: HiddenGem[] = []
  for (const c of candidates) {
    const key = c.sector ?? "unknown"
    if ((perSector.get(key) ?? 0) >= 1) continue
    perSector.set(key, 1)
    gems.push(c)
    if (gems.length >= limit) break
  }

  await recordSurfaced(gems)

  return { gems, scanned: all.length, qualified, suppressedForRotation, institutionallyHeldExcluded }
}
