// Cash generators — companies that actually convert profit into cash.
//
// WHY THIS IS ITS OWN SCREEN RATHER THAN A COLUMN. Every other list here ranks
// on price or on business quality. This one asks a question those cannot: does
// the reported profit turn into money the company actually holds?
//
// That distinction is where most accounting failures live. Revenue can be
// recognised early, expenses capitalised, receivables allowed to swell — and
// every one of those flatters earnings while cash conversion falls. A company
// with rising profit and falling cash conversion is telling you something the
// income statement is designed not to say.
//
// So this ranks on CONVERSION, not on the size of the cash flow. A large
// company generating large cash is not interesting; a company converting a high
// share of its stated profit into cash, consistently, is.
//
// Same discipline as hidden gems: rotation so the list changes, one per sector
// so it is not a single macro bet, and hard soundness gates so nothing here is
// cheap because it is failing.
import { prisma } from "@/lib/prisma"

export interface CashGenerator {
  symbol: string
  name: string
  sector: string | null
  revenueTtm: number | null
  freeCashFlowTtm: number | null
  fcfYieldPct: number | null
  fcfMarginPct: number | null
  accrualsRatioPct: number | null
  accountingQualityScore: number | null
  conversionScore: number
  reasons: string[]
  cautions: string[]
}

interface Row {
  symbol: string; name: string; sector: string | null; dataConfidence: string
  revenueTtm: number | null; freeCashFlowTtm: number | null; fcfYieldPct: number | null
  fcfMarginPct: number | null; accrualsRatioPct: number | null
  accountingQualityScore: number | null; qualityScore: number | null
  goingConcernHits: number | null; hasRestatement: boolean | null
  beneishFlag: boolean | null; altmanZone: string | null
}

const MIN_REVENUE = 150_000_000
const ROTATION_DAYS = 21

function makeCuid(): string {
  const c = "abcdefghijklmnopqrstuvwxyz0123456789"
  return `c${Array.from({ length: 24 }, () => c[Math.floor(Math.random() * c.length)]).join("")}`
}

export async function findCashGenerators(limit = 10): Promise<{
  rows: CashGenerator[]; scanned: number; qualified: number; suppressed: number
}> {
  const all: Row[] = []
  const PAGE = 1000
  for (let skip = 0; skip < 20000; skip += PAGE) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page = await (prisma.ticker as any).findMany({ take: PAGE, skip }) as Row[]
    all.push(...page)
    if (page.length < PAGE) break
  }

  const cutoff = new Date(Date.now() - ROTATION_DAYS * 86400000).toISOString()
  let seen = new Set<string>()
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prior = await (prisma.underwriteCall as any).findMany({
      where: { subjectType: "cash_generator", predictedAt: { gte: cutoff } }, take: 500,
    }) as Array<{ subjectId: string }>
    seen = new Set(prior.map(p => p.subjectId))
  } catch { /* fail open — repeating a name beats an empty list */ }

  let qualified = 0, suppressed = 0
  const candidates: CashGenerator[] = []

  for (const t of all) {
    if (t.dataConfidence !== "high" && t.dataConfidence !== "medium") continue
    if ((t.goingConcernHits ?? 0) > 0 || t.hasRestatement || t.beneishFlag) continue
    if (t.altmanZone === "distress") continue
    if ((t.revenueTtm ?? 0) < MIN_REVENUE) continue
    // The screen is about cash, so no cash disqualifies outright.
    if (t.freeCashFlowTtm === null || t.freeCashFlowTtm <= 0) continue
    if (t.fcfMarginPct === null) continue
    qualified++

    if (seen.has(t.symbol)) { suppressed++; continue }

    // Conversion quality, not cash size. Accruals ratio is the core term: it is
    // the standard quality-of-earnings measure, and negative values mean cash
    // exceeds reported profit, which is the healthy direction.
    const marginTerm = Math.min(t.fcfMarginPct, 40) * 1.5
    const accrualTerm = t.accrualsRatioPct !== null ? Math.max(-20, Math.min(20, -t.accrualsRatioPct)) * 1.5 : 0
    const qualityTerm = (t.accountingQualityScore ?? 50) * 0.4
    const conversionScore = Math.round(marginTerm + accrualTerm + qualityTerm)

    const reasons: string[] = [
      `Converts ${t.fcfMarginPct.toFixed(1)}% of revenue into free cash flow.`,
    ]
    if (t.accrualsRatioPct !== null && t.accrualsRatioPct < 0) {
      reasons.push(`Accruals ratio is ${t.accrualsRatioPct.toFixed(1)}% — cash generation exceeds reported profit, which is the direction that indicates earnings are real rather than timing.`)
    }
    if (t.fcfYieldPct !== null && t.fcfYieldPct > 0) {
      reasons.push(`${t.fcfYieldPct.toFixed(1)}% free-cash-flow yield on the current price.`)
    }

    const cautions: string[] = []
    if (t.accrualsRatioPct !== null && t.accrualsRatioPct > 5) {
      cautions.push(`Accruals ratio is positive at ${t.accrualsRatioPct.toFixed(1)}% — reported profit is running ahead of cash, which is the pattern that precedes most earnings disappointments.`)
    }
    if ((t.qualityScore ?? 0) < 55) {
      cautions.push("Generates cash but the wider business does not score as sound — strong conversion inside a weak business is a cash-flow fact, not an investment case.")
    }
    if (cautions.length === 0) cautions.push("No material caution surfaced on cash quality.")

    candidates.push({
      symbol: t.symbol, name: t.name, sector: t.sector, revenueTtm: t.revenueTtm,
      freeCashFlowTtm: t.freeCashFlowTtm, fcfYieldPct: t.fcfYieldPct,
      fcfMarginPct: t.fcfMarginPct, accrualsRatioPct: t.accrualsRatioPct,
      accountingQualityScore: t.accountingQualityScore,
      conversionScore, reasons, cautions,
    })
  }

  candidates.sort((a, b) => b.conversionScore - a.conversionScore)

  const perSector = new Map<string, number>()
  const rows: CashGenerator[] = []
  for (const c of candidates) {
    const k = c.sector ?? "unknown"
    if ((perSector.get(k) ?? 0) >= 1) continue
    perSector.set(k, 1)
    rows.push(c)
    if (rows.length >= limit) break
  }

  for (const r of rows) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (prisma.underwriteCall as any).create({
        data: {
          id: makeCuid(), subjectType: "cash_generator", subjectId: r.symbol,
          subjectLabel: `${r.symbol} — ${r.name}`, verdict: "surfaced",
          predictedScore: r.conversionScore, rationale: { reasons: r.reasons },
          confidenceAtCall: r.conversionScore,
          predictedAt: new Date().toISOString(),
          reviewAt: new Date(Date.now() + 90 * 86400000).toISOString(),
        },
      })
    } catch { /* recording must not block the result */ }
  }

  return { rows, scanned: all.length, qualified, suppressed }
}
