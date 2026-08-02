// Scoring-accuracy panel — rendered as a tab inside the Markets section.
//
// Async server component: queries directly rather than going through an API
// route, matching the pattern the other dashboard pages use.
import { prisma } from "@/lib/prisma"

const TIER_LABEL: Record<string, string> = {
  strong: "Strong", mixed: "Mixed", weak: "Weak",
  // legacy rows recorded before the descriptive-tier reframe
  buy: "Strong (legacy)", hold: "Mixed (legacy)", pass: "Weak (legacy)",
}

interface UnderwriteCallRow {
  id: string
  subjectType: string
  subjectLabel: string
  verdict: string
  predictedScore: number
  predictedAt: string
  reviewAt: string
  actualOutcome: string | null
  correct: boolean | null
}

export default async function TrackRecordPanel() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const matured = await (prisma.underwriteCall as any).findMany({
    where: { actualOutcome: { not: null }, correct: { not: null } },
    orderBy: { actualOutcomeAt: "desc" },
    take: 200,
  }).catch(() => []) as UnderwriteCallRow[]

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pendingRows = await (prisma.underwriteCall as any).findMany({
    where: { actualOutcome: null },
    select: { id: true },
    take: 1000,
  }).catch(() => []) as { id: string }[]
  const pending = pendingRows.length

  const correctCount = matured.filter(c => c.correct === true).length
  const accuracy = matured.length > 0 ? Math.round((correctCount / matured.length) * 100) : null

  const byTier: Record<string, { total: number; correct: number }> = {}
  for (const c of matured) {
    byTier[c.verdict] = byTier[c.verdict] ?? { total: 0, correct: 0 }
    byTier[c.verdict].total++
    if (c.correct) byTier[c.verdict].correct++
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 space-y-2">
        <p className="text-xs text-amber-300">
          <strong>Methodology, stated in full so the number can be checked.</strong> Every tracked
          company scored above the data-confidence bar is logged — nothing is excluded after the fact
          and no result is cherry-picked. Each entry is graded once, 90 days after it was recorded,
          against the closing price on the review date. &ldquo;Strong&rdquo; counts as correct if the price rose,
          &ldquo;Weak&rdquo; if it fell, and &ldquo;Mixed&rdquo; if the price moved less than 10% either way. The list below
          is every graded entry to date.
        </p>
        <p className="text-xs text-amber-300">
          <strong>Stocks only.</strong> A real-estate accuracy record needs a genuine closed-deal
          outcome signal (did the lead sell, at what price) that this app doesn&apos;t capture yet.
          Publishing a number without that data would mean fabricating it.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-gray-900/60 border border-gray-700/40 rounded-2xl px-4 py-3">
          <p className="text-[10px] text-gray-500 font-medium">Overall Accuracy</p>
          <p className="text-2xl font-black text-white">{accuracy !== null ? `${accuracy}%` : "—"}</p>
        </div>
        <div className="bg-gray-900/60 border border-gray-700/40 rounded-2xl px-4 py-3">
          <p className="text-[10px] text-gray-500 font-medium">Assessments Graded</p>
          <p className="text-2xl font-black text-white">{matured.length}</p>
        </div>
        <div className="bg-gray-900/60 border border-gray-700/40 rounded-2xl px-4 py-3">
          <p className="text-[10px] text-gray-500 font-medium">Pending Review</p>
          <p className="text-2xl font-black text-white">{pending}</p>
        </div>
        <div className="bg-gray-900/60 border border-gray-700/40 rounded-2xl px-4 py-3">
          <p className="text-[10px] text-gray-500 font-medium">Review Window</p>
          <p className="text-2xl font-black text-white">90d</p>
        </div>
      </div>

      {Object.keys(byTier).length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {Object.entries(byTier).map(([tier, stats]) => (
            <div key={tier} className="bg-gray-900/60 border border-gray-700/40 rounded-2xl px-4 py-3">
              <p className="text-[10px] text-gray-500 font-medium">{TIER_LABEL[tier] ?? tier}</p>
              <p className="text-lg font-bold text-white">{stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0}%</p>
              <p className="text-[10px] text-gray-600">{stats.correct}/{stats.total} correct</p>
            </div>
          ))}
        </div>
      )}

      {matured.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-700/50 px-6 py-12 text-center">
          <p className="text-sm text-gray-500">
            Nothing has reached its review date yet — each assessment is graded 90 days after it was recorded.
          </p>
        </div>
      ) : (
        <div className="grid gap-2">
          {matured.slice(0, 25).map(c => (
            <div key={c.id} className="flex items-center justify-between rounded-xl border border-gray-700/40 bg-gray-900/60 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-white">{c.subjectLabel}</p>
                <p className="text-[10px] text-gray-500 mt-0.5">
                  Described as <strong>{TIER_LABEL[c.verdict] ?? c.verdict}</strong> at score {c.predictedScore} on {new Date(c.predictedAt).toLocaleDateString()}
                </p>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${c.correct ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" : "bg-red-500/15 text-red-300 border-red-500/30"}`}>
                {c.correct ? "Correct" : "Missed"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
