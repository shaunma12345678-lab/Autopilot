// Analysis track record — logs every stock assessment when it's made and
// checks it against real price history 90 days later, publishing aggregate
// accuracy as a substantiated trust signal rather than a claim.
//
// COMPLIANCE NOTE (deliberate, do not "simplify" this back):
// This records a descriptive STRENGTH TIER (strong/mixed/weak), never a
// buy/sell/hold recommendation. The distinction is not cosmetic — providing
// personalized or recommendation-shaped advice about securities for
// compensation is what triggers investment-adviser regulation. Everything here
// is impersonal, applies uniformly to every tracked company, and describes
// fundamentals rather than instructing anyone to transact. See the disclaimer
// in components/dashboard/MarketsDisclaimer.tsx.
//
// Scope, stated honestly: STOCKS ONLY. A real-estate track record needs a
// genuine closed-deal outcome signal (did the lead sell, at what price) that
// this app doesn't capture yet. Backtesting against nothing would produce a
// fabricated number, which is worse than the feature not existing.
import { prisma } from "@/lib/prisma"
import { fetchStockPrice } from "@/lib/price-feed"

const REVIEW_WINDOW_DAYS = 90
const MIN_DAYS_BETWEEN_CALLS = 30 // don't log a new assessment every 20-min re-score cycle

function makeCuid(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789"
  return `c${Array.from({ length: 24 }, () => chars[Math.floor(Math.random() * chars.length)]).join("")}`
}

function tierFromScore(score: number): "strong" | "mixed" | "weak" {
  if (score >= 65) return "strong"
  if (score >= 45) return "mixed"
  return "weak"
}

export async function logStockUnderwriteCall(ticker: {
  id: string; symbol: string; name: string; qualityScore: number | null
  qualityReasons: unknown; priceUsd: number | null; dataConfidence: string
  strengthTier?: string | null; riskScore?: number | null
}): Promise<void> {
  // Only log confidently-scored companies — an "insufficient data" reading
  // isn't an assessment worth grading.
  if (ticker.qualityScore === null || ticker.dataConfidence === "insufficient" || ticker.priceUsd === null) return

  try {
    const cutoff = new Date(Date.now() - MIN_DAYS_BETWEEN_CALLS * 86400000).toISOString()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recent = await (prisma.underwriteCall as any).findFirst({
      where: { subjectType: "stock", subjectId: ticker.id, predictedAt: { gte: cutoff } },
    })
    if (recent) return

    const reviewAt = new Date(Date.now() + REVIEW_WINDOW_DAYS * 86400000)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma.underwriteCall as any).create({
      data: {
        id: makeCuid(),
        subjectType: "stock",
        subjectId: ticker.id,
        subjectLabel: `${ticker.symbol} — ${ticker.name}`,
        verdict: ticker.strengthTier ?? tierFromScore(ticker.qualityScore),
        predictedScore: ticker.qualityScore,
        rationale: {
          priceAtCall: ticker.priceUsd,
          qualityReasons: ticker.qualityReasons,
          riskScore: ticker.riskScore ?? null,
        },
        confidenceAtCall: ticker.qualityScore,
        reviewAt: reviewAt.toISOString(),
      },
    })
  } catch {
    // best-effort logging — never let this break the scoring pipeline
  }
}

export interface BacktestResult {
  reviewed: number
  correct: number
  incorrect: number
}

export async function backtestMaturedStockCalls(): Promise<BacktestResult> {
  const now = new Date().toISOString()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const matured = await (prisma.underwriteCall as any).findMany({
    where: { subjectType: "stock", reviewAt: { lte: now }, actualOutcome: null },
    take: 20,
  }) as Array<{ id: string; subjectId: string; subjectLabel: string; verdict: string; rationale: { priceAtCall?: number } }>

  let correct = 0
  let incorrect = 0

  for (const call of matured) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ticker = await (prisma.ticker as any).findFirst({ where: { id: call.subjectId } })
    const priceAtCall = call.rationale?.priceAtCall

    if (!ticker || typeof priceAtCall !== "number" || priceAtCall <= 0) {
      // Ticker deleted or rationale malformed — close it out rather than
      // retrying the same broken row on every cron pass.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (prisma.underwriteCall as any).update({
        where: { id: call.id },
        data: { actualOutcome: "still_open", actualOutcomeAt: now },
      })
      continue
    }

    const quote = await fetchStockPrice(ticker.symbol)
    if (!quote) continue // transient fetch failure — leave for the next pass

    const pctChange = ((quote.price - priceAtCall) / priceAtCall) * 100

    // Grading a DESCRIPTIVE tier, not a trade call: did companies we described
    // as fundamentally strong subsequently outperform those we called weak?
    // Legacy rows may still carry the old buy/pass/hold values, so both
    // vocabularies are handled.
    const tier = call.verdict
    const isCorrect =
      (tier === "strong" || tier === "buy") ? pctChange > 0 :
      (tier === "weak" || tier === "pass") ? pctChange <= 0 :
      Math.abs(pctChange) < 10 // mixed/hold: described as unremarkable, graded as such

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma.underwriteCall as any).update({
      where: { id: call.id },
      data: {
        actualOutcome: pctChange > 0 ? "price_up" : "price_down",
        actualOutcomeAt: now,
        correct: isCorrect,
      },
    })

    if (isCorrect) correct++
    else incorrect++
  }

  return { reviewed: matured.length, correct, incorrect }
}
