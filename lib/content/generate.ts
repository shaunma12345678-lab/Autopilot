// The generation pipeline (spec §5.1) — multi-stage, never one giant prompt:
//   context assembly → divergent (wide, 30+) → harsh critique (kill ≥ half) →
//   per-dimension scoring → hook multiplication → rank, persist, return.
// Every stage's raw output is persisted (AgentMemory `content-runs`) so runs
// are inspectable and future prompt evolution has evidence. Server-only.

import { prisma } from "@/lib/prisma"
import { resolveLearningBusinessId } from "@/lib/learning-store"
import { runAgent } from "@/lib/claude"
import { assembleContext, type RunBrief } from "@/lib/content/voice"
import { DIVERGENT_SYSTEM, CRITIQUE_SYSTEM, SCORE_SYSTEM, HOOKS_SYSTEM, PROMPT_VERSION } from "@/lib/content/prompts"
import { normalizeWeights, sanitizeDimensions, compositeScore, type DimensionWeights } from "@/lib/content/score"

interface Premise { title: string; premise: string; angle: string; platform: string; format: string }

export interface GeneratedIdea {
  id: string
  platform: string
  format: string
  title: string
  premise: string
  hooks: string[]
  angle: string
  whyItTravels: string
  viralityScore: number
  scoreBreakdown: Record<string, unknown>
  confidence: number
}

export interface RunResult {
  runId: string
  profileName: string
  ideas: GeneratedIdea[]
  stages: { divergent: number; survivors: number; scored: number }
}

// Ad-hoc runs (no saved profile) still need a BrandProfile row so their ideas
// persist and the Script/outline/caption buttons can find them later — a
// sentinel profile holds every ad-hoc idea. Context assembly never uses it.
const ADHOC_PROFILE_ID = "bp-adhoc-001"

async function ensureAdhocProfile(): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const P = prisma as any
  try {
    const existing = await P.brandProfile.findFirst({ where: { id: ADHOC_PROFILE_ID } })
    if (existing) return ADHOC_PROFILE_ID
    await P.brandProfile.create({ data: {
      id: ADHOC_PROFILE_ID, name: "Ad-hoc briefs", niche: "described per run",
      platforms: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    } })
    return ADHOC_PROFILE_ID
  } catch {
    return null
  }
}

function parse(out: unknown): Record<string, unknown> | null {
  if (out && typeof out === "object") return out as Record<string, unknown>
  if (typeof out === "string") { try { const m = out.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : null } catch { return null } }
  return null
}

async function logStage(runId: string, stage: string, payload: unknown): Promise<void> {
  try {
    const bizId = await resolveLearningBusinessId()
    if (!bizId) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mem = prisma.agentMemory as any
    await mem.upsert({
      where:  { businessId: bizId, agentSlug: "content-runs", key: `${runId}:${stage}` },
      create: { id: crypto.randomUUID(), businessId: bizId, agentSlug: "content-runs", key: `${runId}:${stage}`, value: JSON.stringify(payload).slice(0, 60000), updatedAt: new Date().toISOString() },
      update: { value: JSON.stringify(payload).slice(0, 60000) },
    })
  } catch { /* inspection is best-effort */ }
}

export async function runGeneration(profileId: string | null, brief: RunBrief): Promise<RunResult | null> {
  const runId = crypto.randomUUID()
  const want = Math.min(Math.max(brief.count ?? 10, 4), 24)

  // Stage 1 — context.
  const ctx = await assembleContext(profileId, brief)
  await logStage(runId, "context", { block: ctx.block, promptVersion: PROMPT_VERSION })

  // Stage 2 — divergent generation, wide. Ask for ~3× what the user wants.
  const rawCount = Math.min(Math.max(want * 3, 24), 40)
  const divOut = await runAgent(DIVERGENT_SYSTEM, `${ctx.block}\n\nGenerate ${rawCount} premises.`, { jsonMode: true, maxTokens: 6000 })
  const premisesRaw = (parse(divOut)?.premises ?? []) as unknown[]
  const premises: Premise[] = premisesRaw
    .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
    .map((p) => ({
      title: String(p.title ?? "").slice(0, 80),
      premise: String(p.premise ?? "").slice(0, 300),
      angle: String(p.angle ?? "").slice(0, 200),
      platform: String(p.platform ?? ctx.platforms[0] ?? "TikTok/Reels").slice(0, 24),
      format: String(p.format ?? "reel").slice(0, 16),
    }))
    .filter((p) => p.title.length > 4 && p.premise.length > 20)
  if (premises.length < 4) return null
  await logStage(runId, "divergent", premises)

  // Stage 3 — harsh critique. If the model under-kills, we still cap survivors.
  const listText = premises.map((p, i) => `${i}. [${p.platform}/${p.format}] ${p.title} — ${p.premise} (angle: ${p.angle})`).join("\n")
  const critOut = await runAgent(CRITIQUE_SYSTEM, `${ctx.block.slice(0, 1500)}\n\nPREMISES:\n${listText}`, { jsonMode: true, maxTokens: 1500 })
  const crit = parse(critOut)
  let survivorIdx = ((crit?.survivors ?? []) as unknown[]).map(Number).filter((i) => Number.isInteger(i) && i >= 0 && i < premises.length)
  if (!survivorIdx.length) survivorIdx = premises.map((_, i) => i)   // critique failed — keep all rather than lose the run
  survivorIdx = [...new Set(survivorIdx)].slice(0, Math.max(want + 4, 12))
  const survivors = survivorIdx.map((i) => premises[i])
  await logStage(runId, "critique", { survivors: survivorIdx, kills: crit?.kills ?? [], killRate: 1 - survivorIdx.length / premises.length })

  // Load this profile's learned weights (defaults until the loop has data).
  let weights: DimensionWeights = normalizeWeights(null)
  if (profileId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prof = await (prisma as any).brandProfile.findFirst({ where: { id: profileId } }).catch(() => null)
    weights = normalizeWeights(prof?.weights ?? null)
  }

  // Stage 4 — per-dimension scoring.
  const survText = survivors.map((p, i) => `${i}. [${p.platform}/${p.format}] ${p.title} — ${p.premise} (angle: ${p.angle})`).join("\n")
  const scoreOut = await runAgent(SCORE_SYSTEM, `${ctx.block.slice(0, 2500)}\n\nIDEAS:\n${survText}`, { jsonMode: true, maxTokens: 6000 })
  const scoredRaw = (parse(scoreOut)?.scored ?? []) as unknown[]
  interface ScoredRow { p: Premise; dims: ReturnType<typeof sanitizeDimensions>; rationales: Record<string, unknown>; confidence: number; whyItTravels: string; composite: number }
  const scored: ScoredRow[] = []
  for (const s of scoredRaw) {
    if (!s || typeof s !== "object") continue
    const row = s as Record<string, unknown>
    const idx = Number(row.index)
    if (!Number.isInteger(idx) || idx < 0 || idx >= survivors.length) continue
    const dims = sanitizeDimensions(row.dimensions)
    if (!dims) continue
    scored.push({
      p: survivors[idx],
      dims,
      rationales: (row.rationales && typeof row.rationales === "object" ? row.rationales : {}) as Record<string, unknown>,
      confidence: Math.max(0, Math.min(1, Number(row.confidence) || 0.5)),
      whyItTravels: String(row.whyItTravels ?? "").slice(0, 600),
      composite: compositeScore(dims, weights),
    })
  }
  if (!scored.length) return null
  scored.sort((a, b) => b.composite - a.composite)
  const top = scored.slice(0, want)
  await logStage(runId, "scored", top.map((t) => ({ title: t.p.title, composite: t.composite, dims: t.dims })))

  // Stage 5 — hook multiplication for the winners.
  const hookText = top.map((t, i) => `${i}. ${t.p.title} — ${t.p.premise}`).join("\n")
  const hooksOut = await runAgent(HOOKS_SYSTEM, `${ctx.block.slice(0, 1200)}\n\nIDEAS:\n${hookText}`, { jsonMode: true, maxTokens: 2500 })
  const hookedRaw = (parse(hooksOut)?.hooked ?? []) as unknown[]
  const hooksByIdx = new Map<number, string[]>()
  for (const h of hookedRaw) {
    if (!h || typeof h !== "object") continue
    const row = h as Record<string, unknown>
    const idx = Number(row.index)
    const hooks = (Array.isArray(row.hooks) ? row.hooks : []).filter((x): x is string => typeof x === "string").map((x) => x.slice(0, 140)).slice(0, 4)
    if (Number.isInteger(idx) && hooks.length) hooksByIdx.set(idx, hooks)
  }

  // Stage 6 — persist + return. Ad-hoc runs persist under the sentinel
  // profile so expansion (Script/outline/caption/shotlist) can find the ideas.
  const persistProfileId = profileId ?? await ensureAdhocProfile()
  const ideas: GeneratedIdea[] = []
  for (let i = 0; i < top.length; i++) {
    const t = top[i]
    const id = crypto.randomUUID()
    const idea: GeneratedIdea = {
      id,
      platform: t.p.platform,
      format: t.p.format,
      title: t.p.title,
      premise: t.p.premise,
      hooks: hooksByIdx.get(i) ?? [t.p.title],
      angle: t.p.angle,
      whyItTravels: t.whyItTravels || t.p.angle,
      viralityScore: t.composite,
      scoreBreakdown: { dimensions: t.dims, rationales: t.rationales, weights, promptVersion: PROMPT_VERSION },
      confidence: t.confidence,
    }
    ideas.push(idea)
    if (persistProfileId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (prisma as any).contentIdea.create({ data: {
        id, brandProfileId: persistProfileId, runId,
        platform: idea.platform, format: idea.format, title: idea.title, premise: idea.premise,
        hooks: idea.hooks, angle: idea.angle, whyItTravels: idea.whyItTravels,
        viralityScore: idea.viralityScore, scoreBreakdown: idea.scoreBreakdown, confidence: idea.confidence,
        status: "new", createdAt: new Date().toISOString(),
      } }).catch(() => null)
    }
  }

  return { runId, profileName: ctx.profileName, ideas, stages: { divergent: premises.length, survivors: survivors.length, scored: scored.length } }
}
