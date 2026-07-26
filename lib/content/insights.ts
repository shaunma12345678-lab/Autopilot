// Steering & hook insights — the self-tuning brain (features #1, #3, #4).
// Joins every logged outcome back to the steering that produced it and the
// hook that was posted, then ranks each lever by a BLENDED score that weighs
// real business (redemptions/revenue = customers through the door) far above
// reach (percentile). The result: "for THIS account, these objectives / tones
// / formats / hook styles actually bring people in" — fed back as the default
// steering for the next run. Server-only, best-effort.

import { prisma } from "@/lib/prisma"
import { hookStyle, type HookStyle } from "@/lib/content/attribution"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const P = () => prisma as any

interface IdeaRow {
  id: string; hooks: string[]; angle: string; title: string
  steering: { goal?: string | null; tone?: string[]; formats?: string[] } | null
  format: string
}
interface OutcomeRow {
  ideaId: string; actualPercentile: number | null
  redemptions: number | null; revenue: number | null; hookUsed: string | null
}

// A single 0-100 "business impact" per post: reach percentile, but heavily
// boosted by real redemptions/revenue when the business tracked them. This is
// what makes the engine optimize for foot traffic, not vanity reach.
function impact(o: OutcomeRow): number {
  const reach = o.actualPercentile ?? 50
  const redemptionBoost = o.redemptions != null ? Math.min(40, o.redemptions * 4) : 0
  const revenueBoost = o.revenue != null ? Math.min(30, o.revenue / 25) : 0
  return Math.min(100, reach * 0.6 + redemptionBoost + revenueBoost)
}

interface LeverStat { value: string; label: string; n: number; avgImpact: number; totalRedemptions: number; totalRevenue: number }

function rankLever(
  pairs: Array<{ values: string[]; impact: number; redemptions: number; revenue: number }>,
  labelOf: (v: string) => string,
): LeverStat[] {
  const agg = new Map<string, { n: number; sum: number; red: number; rev: number }>()
  for (const p of pairs) {
    for (const v of p.values) {
      if (!v) continue
      const a = agg.get(v) ?? { n: 0, sum: 0, red: 0, rev: 0 }
      a.n++; a.sum += p.impact; a.red += p.redemptions; a.rev += p.revenue
      agg.set(v, a)
    }
  }
  return [...agg.entries()]
    .map(([value, a]) => ({ value, label: labelOf(value), n: a.n, avgImpact: Math.round(a.sum / a.n), totalRedemptions: a.red, totalRevenue: Math.round(a.rev) }))
    .filter((s) => s.n >= 2)                       // need at least a little signal
    .sort((a, b) => b.avgImpact - a.avgImpact)
}

export interface ContentInsights {
  n: number                                        // outcomes with enough data
  ready: boolean                                   // enough to make a recommendation
  byGoal: LeverStat[]
  byTone: LeverStat[]
  byFormat: LeverStat[]
  byHookStyle: LeverStat[]
  recommend: { goal?: string; tone?: string[]; formats?: string[]; hookStyle?: string }
  topPosts: Array<{ title: string; impact: number; redemptions: number | null; revenue: number | null }>
  summary: string
}

const GOAL_LABEL: Record<string, string> = {
  customers: "Bring in customers", awareness: "Awareness/reach", appointments: "Appointments",
  "sell-item": "Sell an item", leads: "Capture leads", loyalty: "Loyalty",
}

export async function contentInsights(brandProfileId: string): Promise<ContentInsights> {
  const empty: ContentInsights = { n: 0, ready: false, byGoal: [], byTone: [], byFormat: [], byHookStyle: [], recommend: {}, topPosts: [], summary: "Log a few 'I posted this' outcomes (with redemptions when you can) and the engine will learn which objective, tone, format, and hook style bring the most people through your door." }
  try {
    const ideas = await P().contentIdea.findMany({ where: { brandProfileId }, take: 600 }) as IdeaRow[]
    if (!ideas.length) return empty
    const byId = new Map(ideas.map((i) => [i.id, i]))
    const outcomes = (await P().contentOutcome.findMany({ take: 600 }) as OutcomeRow[])
      .filter((o) => byId.has(o.ideaId) && (o.actualPercentile != null || o.redemptions != null))
    if (outcomes.length < 3) return { ...empty, n: outcomes.length }

    const rows = outcomes.map((o) => {
      const idea = byId.get(o.ideaId)!
      const usedHook = o.hookUsed ?? idea.hooks?.[0] ?? idea.title
      return {
        idea, o, imp: impact(o),
        goal: idea.steering?.goal ? [idea.steering.goal] : [],
        tone: idea.steering?.tone ?? [],
        format: [idea.format],
        hookStyle: [hookStyle(usedHook) as string],
      }
    })
    const mk = (sel: (r: typeof rows[number]) => string[]) => rows.map((r) => ({ values: sel(r), impact: r.imp, redemptions: r.o.redemptions ?? 0, revenue: r.o.revenue ?? 0 }))

    const byGoal = rankLever(mk((r) => r.goal), (v) => GOAL_LABEL[v] ?? v)
    const byTone = rankLever(mk((r) => r.tone), (v) => v)
    const byFormat = rankLever(mk((r) => r.format), (v) => v)
    const byHookStyle = rankLever(mk((r) => r.hookStyle), (v) => v)

    const recommend: ContentInsights["recommend"] = {}
    if (byGoal[0]) recommend.goal = byGoal[0].value
    if (byTone.length) recommend.tone = byTone.slice(0, 2).map((t) => t.value)
    if (byFormat.length) recommend.formats = byFormat.slice(0, 2).map((f) => f.value)
    if (byHookStyle[0]) recommend.hookStyle = byHookStyle[0].value

    const topPosts = rows.sort((a, b) => b.imp - a.imp).slice(0, 5)
      .map((r) => ({ title: r.idea.title, impact: Math.round(r.imp), redemptions: r.o.redemptions, revenue: r.o.revenue }))

    const ready = outcomes.length >= 5
    const parts: string[] = []
    if (byGoal[0]) parts.push(`${GOAL_LABEL[byGoal[0].value] ?? byGoal[0].value} posts perform best (impact ${byGoal[0].avgImpact}${byGoal[0].totalRedemptions ? `, ${byGoal[0].totalRedemptions} redemptions` : ""})`)
    if (byHookStyle[0]) parts.push(`${byHookStyle[0].label} hooks win`)
    if (byFormat[0]) parts.push(`${byFormat[0].label} is your strongest format`)
    const withRedemptions = outcomes.filter((o) => (o.redemptions ?? 0) > 0).length
    const summary = ready
      ? `Learned from ${outcomes.length} posts${withRedemptions ? ` (${withRedemptions} with tracked walk-ins)` : ""}: ${parts.join("; ")}. The next run pre-loads this steering — tweak as you like.`
      : `${outcomes.length} posts logged so far — a couple more (especially with redemption counts) and the recommendations sharpen. Early read: ${parts.join("; ") || "still gathering"}.`

    return { n: outcomes.length, ready, byGoal, byTone, byFormat, byHookStyle, recommend, topPosts, summary }
  } catch {
    return empty
  }
}

export type { HookStyle }
