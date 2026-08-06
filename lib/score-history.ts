// Score history + deterioration detection — the basis of a sell signal.
//
// WHY THIS EXISTS: BUY / HOLD / PASS is a SCREENING vocabulary. It answers
// "is this worth starting a position in?" for something you don't own. SELL is
// a different kind of statement — it only means anything if you already hold
// the asset, and it isn't the opposite of BUY. PASS means "don't start";
// SELL means "what you own has changed."
//
// That distinction is why a sell signal can't be derived from a single
// snapshot. A company scoring 45 today might have scored 45 for five years
// (persistently mediocre — that's a PASS, and always was) or might have scored
// 80 last quarter and fallen apart (that's the case worth flagging to a
// holder). Identical score, opposite meaning. Only history separates them.
//
// So SELL here means DETERIORATION AGAINST ITS OWN BASELINE, not a market
// timing call — plus a set of hard events where the thesis has objectively
// broken regardless of trajectory.
import { prisma } from "./prisma"

const DETERIORATION_LOOKBACK_DAYS = 120
const MATERIAL_QUALITY_DROP = 15   // points
const MATERIAL_RISK_RISE = 20      // points
const MATERIAL_FORWARD_DROP = 20   // points

export interface SnapshotInput {
  subjectType: "stock" | "crypto"
  subjectId: string
  symbol: string
  qualityScore: number | null
  riskScore: number | null
  forwardScore: number | null
  actionSignal: string | null
  priceUsd: number | null
  /** Crypto only: top-10 holder share. Tracked over time this becomes an
   *  accumulation/distribution signal — see detectHolderTrend below. */
  top10HolderPct?: number | null
}

export async function captureSnapshot(input: SnapshotInput): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma.scoreSnapshot as any).create({
      data: {
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        symbol: input.symbol,
        qualityScore: input.qualityScore,
        riskScore: input.riskScore,
        forwardScore: input.forwardScore,
        actionSignal: input.actionSignal,
        priceUsd: input.priceUsd,
        top10HolderPct: input.top10HolderPct ?? null,
      },
    })
  } catch { /* history is additive; never block scoring on it */ }
}

export interface DeteriorationResult {
  /** True when a holder should be told the thesis has weakened. */
  shouldSell: boolean
  reasons: string[]
  qualityDelta: number | null
  riskDelta: number | null
  forwardDelta: number | null
  baselineDate: string | null
}

export interface HardExitEvent {
  active: boolean
  reason: string
}

// Detects material degradation against the asset's own history, plus hard
// events where the thesis has objectively broken.
export async function detectDeterioration(params: {
  subjectType: "stock" | "crypto"
  symbol: string
  qualityScore: number | null
  riskScore: number | null
  forwardScore: number | null
  hardExits?: HardExitEvent[]
}): Promise<DeteriorationResult> {
  const empty: DeteriorationResult = {
    shouldSell: false, reasons: [], qualityDelta: null,
    riskDelta: null, forwardDelta: null, baselineDate: null,
  }

  const reasons: string[] = []

  // Hard exits don't need history — these are events, not trends.
  for (const e of params.hardExits ?? []) {
    if (e.active) reasons.push(e.reason)
  }

  try {
    const cutoff = new Date(Date.now() - DETERIORATION_LOOKBACK_DAYS * 86400000).toISOString()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const history = await (prisma.scoreSnapshot as any).findMany({
      where: { subjectType: params.subjectType, symbol: params.symbol, capturedAt: { gte: cutoff } },
      orderBy: { capturedAt: "asc" },
      take: 200,
    }) as Array<{ qualityScore: number | null; riskScore: number | null; forwardScore: number | null; capturedAt: string }>

    if (history.length === 0) {
      return { ...empty, shouldSell: reasons.length > 0, reasons }
    }

    // Baseline is the BEST the asset looked in the window, not the oldest
    // reading — deterioration is measured from the peak of the thesis.
    const bestQuality = history.reduce((best, h) =>
      (h.qualityScore ?? -1) > (best.qualityScore ?? -1) ? h : best, history[0])

    const qualityDelta = params.qualityScore !== null && bestQuality.qualityScore !== null
      ? params.qualityScore - bestQuality.qualityScore : null
    const riskDelta = params.riskScore !== null && bestQuality.riskScore !== null
      ? params.riskScore - bestQuality.riskScore : null
    const forwardDelta = params.forwardScore !== null && bestQuality.forwardScore !== null
      ? params.forwardScore - bestQuality.forwardScore : null

    const baselineDate = String(bestQuality.capturedAt).slice(0, 10)

    if (qualityDelta !== null && qualityDelta <= -MATERIAL_QUALITY_DROP) {
      reasons.push(`Fundamental strength has fallen ${Math.abs(qualityDelta)} points since ${baselineDate} (${bestQuality.qualityScore} → ${params.qualityScore}). The case that supported holding this has weakened materially.`)
    }
    if (riskDelta !== null && riskDelta >= MATERIAL_RISK_RISE) {
      reasons.push(`Risk has risen ${riskDelta} points since ${baselineDate} (${bestQuality.riskScore} → ${params.riskScore}).`)
    }
    if (forwardDelta !== null && forwardDelta <= -MATERIAL_FORWARD_DROP) {
      reasons.push(`Forward indicators have dropped ${Math.abs(forwardDelta)} points since ${baselineDate} — backlog, reinvestment or growth trajectory are deteriorating.`)
    }

    return {
      shouldSell: reasons.length > 0,
      reasons,
      qualityDelta, riskDelta, forwardDelta, baselineDate,
    }
  } catch {
    return { ...empty, shouldSell: reasons.length > 0, reasons }
  }
}

export interface TrajectoryPoint {
  date: string
  qualityScore: number | null
  riskScore: number | null
  forwardScore: number | null
  priceUsd: number | null
}

// Historical trajectory for the detail chart — what HAS happened, which is the
// honest alternative to projecting a price line into the future.
export async function getTrajectory(
  subjectType: "stock" | "crypto",
  symbol: string,
  limit = 60
): Promise<TrajectoryPoint[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await (prisma.scoreSnapshot as any).findMany({
      where: { subjectType, symbol },
      orderBy: { capturedAt: "asc" },
      take: limit,
    }) as Array<Record<string, unknown>>

    return rows.map(r => ({
      date: String(r.capturedAt).slice(0, 10),
      qualityScore: (r.qualityScore as number) ?? null,
      riskScore: (r.riskScore as number) ?? null,
      forwardScore: (r.forwardScore as number) ?? null,
      priceUsd: (r.priceUsd as number) ?? null,
    }))
  } catch {
    return []
  }
}

// ── On-chain accumulation vs distribution ─────────────────────────────────
//
// This is the crypto answer to "can we see what people are actually doing",
// and it works where the equity equivalent doesn't. Institutional 13F holdings
// arrive 45 days late and are self-reported. On-chain holder data is
// real-time and cryptographically verifiable — nobody can misreport it.
//
// Tracking top-10 holder share across snapshots turns a static concentration
// number into a direction: large wallets accumulating, or distributing into
// retail. Distribution into a rising price is the classic exit pattern.
export interface HolderTrend {
  direction: "accumulating" | "distributing" | "stable" | "unknown"
  changePct: number | null
  note: string
}

export async function detectHolderTrend(symbol: string): Promise<HolderTrend> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await (prisma.scoreSnapshot as any).findMany({
      where: { subjectType: "crypto", symbol },
      orderBy: { capturedAt: "asc" },
      take: 100,
    }) as Array<{ top10HolderPct: number | null; capturedAt: string }>

    const pts = rows.filter(r => typeof r.top10HolderPct === "number")
    if (pts.length < 2) {
      return { direction: "unknown", changePct: null, note: "Not enough holder history yet — this builds over successive scans." }
    }

    const first = pts[0].top10HolderPct as number
    const last = pts[pts.length - 1].top10HolderPct as number
    const changePct = last - first

    if (changePct >= 2) {
      return { direction: "accumulating", changePct,
        note: `Top-10 wallets have grown their share by ${changePct.toFixed(1)} points. Large holders are accumulating — though it also means concentration risk is rising.` }
    }
    if (changePct <= -2) {
      return { direction: "distributing", changePct,
        note: `Top-10 wallets have reduced their share by ${Math.abs(changePct).toFixed(1)} points. Large holders are distributing into the market — worth understanding who is buying the other side.` }
    }
    return { direction: "stable", changePct, note: `Top-10 holder share has moved less than 2 points — no clear accumulation or distribution.` }
  } catch {
    return { direction: "unknown", changePct: null, note: "Holder history unavailable." }
  }
}
