// Build track record — what was generated, and what score it earned by
// actually rendering.
//
// WHAT THIS REPLACES. lib/agents/website-agent.ts tracked quality with two
// module-level variables:
//
//   let _qualityBaseline = 8.0
//   let _totalGenerated  = 0
//
// On Vercel every function invocation may land on a cold container, so both
// reset constantly. The "rising quality baseline" surfaced in the admin UI
// was therefore fiction in production — it measured how many sites this
// particular container had built, which is usually one.
//
// Persisting it makes the number real, and recording each build's VERIFIED
// score (from lib/agents/site-verifier.ts) rather than its keyword-heuristic
// score makes the trend mean something: it tracks how often generated sites
// actually render clean, which is the only quality signal here that can't be
// gamed by emitting code that merely mentions a technique.
//
// EVERY WRITE IS BEST-EFFORT. Site generation must never fail because a
// statistics row could not be saved — including when the table does not yet
// exist, which is the normal state between a deploy and its migration.
import { prisma } from "@/lib/prisma"
import type { VerificationReport } from "@/lib/agents/site-verifier"

export interface BuildStats {
  /** Mean verified score across builds that were actually rendered. */
  verifiedBaseline: number | null
  /** How many builds have a real render score behind them. */
  verifiedCount: number
  totalBuilds: number
  /** Share of rendered builds that passed with no fatal issues. */
  passRatePct: number | null
}

export interface RecordBuildInput {
  slug: string
  title: string
  businessType?: string | null
  heuristicScore?: number | null
}

/**
 * Records a generation. Returns the row id so a later render pass can attach
 * its verified score, or null when persistence is unavailable.
 */
export async function recordBuild(input: RecordBuildInput): Promise<string | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (prisma.siteBuild as any).create({
      data: {
        slug: input.slug,
        title: input.title,
        businessType: input.businessType ?? null,
        heuristicScore: input.heuristicScore ?? null,
      },
    })
    return (row as { id?: string } | null)?.id ?? null
  } catch {
    return null
  }
}

/** Attaches a verification result to a previously recorded build. */
export async function attachVerification(
  buildId: string,
  report: VerificationReport,
  repair?: { attempted: boolean; succeeded: boolean }
): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma.siteBuild as any).update({
      where: { id: buildId },
      data: {
        verifiedScore: report.score,
        passed: report.passed,
        fatalCount: report.issues.filter(i => i.severity === "fatal").length,
        majorCount: report.issues.filter(i => i.severity === "major").length,
        minorCount: report.issues.filter(i => i.severity === "minor").length,
        issues: report.issues,
        repairAttempted: repair?.attempted ?? false,
        repairSucceeded: repair?.succeeded ?? null,
      },
    })
  } catch { /* statistics are never worth failing a build over */ }
}

interface BuildRow { verifiedScore: number | null; passed: boolean | null }

export async function getBuildStats(): Promise<BuildStats> {
  const empty: BuildStats = { verifiedBaseline: null, verifiedCount: 0, totalBuilds: 0, passRatePct: null }
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await (prisma.siteBuild as any).findMany({
      orderBy: { createdAt: "desc" },
      take: 500,
    }) as BuildRow[]

    if (!Array.isArray(rows) || rows.length === 0) return empty

    const verified = rows.filter(r => typeof r.verifiedScore === "number")
    if (verified.length === 0) {
      return { ...empty, totalBuilds: rows.length }
    }

    const mean = verified.reduce((s, r) => s + (r.verifiedScore ?? 0), 0) / verified.length
    const passes = verified.filter(r => r.passed === true).length

    return {
      verifiedBaseline: Math.round(mean * 10) / 10,
      verifiedCount: verified.length,
      totalBuilds: rows.length,
      passRatePct: Math.round((passes / verified.length) * 100),
    }
  } catch {
    return empty
  }
}
