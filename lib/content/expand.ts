// Idea → deliverable expansion (spec §2): outline, full script, caption, shot
// list or a multi-platform pack — written in the profile's voice, checked, and
// persisted as ContentExpansion versions. Server-only.
//
// WRITE → CHECK → REVISE. This used to be a single model call whose output went
// straight to the database. That left the one stage a customer actually reads
// as the only stage in the pipeline with no quality gate, while premises got
// generated wide, culled by a critique pass and scored on eleven dimensions.
//
// The check is deterministic (lib/content/prose-check.ts), which is the point:
// a model asked to grade its own copy approves it. Truncation, invented
// figures, missing sections and leftover placeholders are all settled by
// pattern-matching, and the revision pass is then handed the specific defects
// rather than "make it better".

import { prisma } from "@/lib/prisma"
import { runAgent } from "@/lib/claude"
import { EXPAND_SYSTEM, EXPAND_REVISE_SYSTEM } from "@/lib/content/prompts"
import { checkProse, issuesAsInstructions, type ProseReport } from "@/lib/content/prose-check"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const P = () => prisma as any

interface KindSpec {
  /** Output ceiling. A five-section pack cannot be written in a caption's budget. */
  maxTokens: number
  requiredSections?: string[]
  requireCta: boolean
}

// The old flat 1800-token budget silently truncated the repurpose pack, which
// asks for five complete deliverables — the copy simply stopped mid-section and
// was saved that way, because nothing looked at it.
const KIND_SPECS: Record<string, KindSpec> = {
  outline:  { maxTokens: 1_200, requireCta: true },
  script:   { maxTokens: 2_500, requireCta: true },
  caption:  { maxTokens: 700,  requireCta: true },
  shotlist: { maxTokens: 1_800, requireCta: false },
  repurpose: {
    maxTokens: 6_000,
    requireCta: true,
    requiredSections: [
      "=== TIKTOK / REEL",
      "=== INSTAGRAM CAROUSEL",
      "=== EMAIL",
      "=== X / THREAD",
      "=== GOOGLE BUSINESS",
    ],
  },
}

const BODY_LIMIT = 24_000

export interface ExpansionResult {
  body: string
  version: number
  /** Surfaced so the operator sees what was checked, not just the copy. */
  report: {
    score: number
    passed: boolean
    revised: boolean
    issues: ProseReport["issues"]
    stats: ProseReport["stats"]
  }
}

function asText(out: unknown): string {
  return (typeof out === "string" ? out : JSON.stringify(out)).trim()
}

export async function expandIdea(ideaId: string, kind: string): Promise<ExpansionResult | null> {
  const system = EXPAND_SYSTEM[kind]
  const spec = KIND_SPECS[kind]
  if (!system || !spec) return null

  try {
    const idea = await P().contentIdea.findFirst({ where: { id: ideaId } })
    if (!idea) return null
    // The ad-hoc sentinel profile carries no real identity — the run context
    // (the owner's own description) is the business for those ideas.
    const profileRow = await P().brandProfile.findFirst({ where: { id: idea.brandProfileId } }).catch(() => null)
    const profile = profileRow?.id === "bp-adhoc-001" ? null : profileRow

    // Pull the FULL grounding the generation run saw (business description,
    // area numbers, trends, exemplars) so the expansion is ultra-specific to
    // the exact situation — not a generic take on the title.
    let runContext = ""
    try {
      const { resolveLearningBusinessId } = await import("@/lib/learning-store")
      const bizId = await resolveLearningBusinessId()
      if (bizId) {
        const row = await P().agentMemory.findFirst({ where: { businessId: bizId, agentSlug: "content-runs", key: `${idea.runId}:context` } })
        if (row?.value) {
          const parsed = JSON.parse(row.value) as { block?: string }
          if (parsed?.block) runContext = String(parsed.block).slice(0, 3000)
        }
      }
    } catch { /* expansion still works without it */ }

    const context = [
      runContext ? `RUN CONTEXT (the business's exact situation & real numbers — use these):\n${runContext}` : "",
      profile ? `BUSINESS: ${profile.name} — ${profile.niche}` : "",
      profile?.voiceRules ? `VOICE RULES: ${profile.voiceRules}` : "",
      `PLATFORM: ${idea.platform} · FORMAT: ${idea.format}`,
      `TITLE: ${idea.title}`,
      `PREMISE: ${idea.premise}`,
      `ANGLE: ${idea.angle}`,
      `BEST HOOK: ${idea.hooks?.[0] ?? idea.title}`,
    ].filter(Boolean).join("\n")

    const checkOptions = {
      kind,
      context,
      requiredSections: spec.requiredSections,
      requireCta: spec.requireCta,
    }

    // ── Draft ────────────────────────────────────────────────────────────────
    const draft = asText(await runAgent(system, context, { maxTokens: spec.maxTokens })).slice(0, BODY_LIMIT)
    if (draft.length < 20) return null

    let best = draft
    let report = checkProse(draft, checkOptions)
    let revised = false

    // ── Revise, once, against the specific defects ───────────────────────────
    // One pass rather than a loop: the second attempt fixes named problems,
    // whereas a third tends to rewrite around them and lose the good copy.
    if (!report.passed) {
      try {
        const revision = asText(await runAgent(
          EXPAND_REVISE_SYSTEM,
          `${context}\n\nDRAFT:\n${draft}\n\nDEFECTS FOUND BY THE EDITOR:\n${issuesAsInstructions(report)}`,
          { maxTokens: spec.maxTokens },
        )).slice(0, BODY_LIMIT)

        if (revision.length >= 20) {
          const revisedReport = checkProse(revision, checkOptions)
          // Kept only if it is genuinely better — a revision that trades a
          // cliché for a truncation is not an improvement.
          if (revisedReport.score > report.score) {
            best = revision
            report = revisedReport
            revised = true
          }
        }
      } catch { /* the draft stands if the revision call fails */ }
    }

    const prior = await P().contentExpansion.findMany({ where: { ideaId, kind }, take: 20 }).catch(() => []) as Array<{ version: number }>
    const version = prior.length ? Math.max(...prior.map((p) => p.version)) + 1 : 1
    await P().contentExpansion.create({ data: {
      id: crypto.randomUUID(), ideaId, kind, body: best, version, createdAt: new Date().toISOString(),
    } }).catch(() => null)

    return {
      body: best,
      version,
      report: {
        score: report.score,
        passed: report.passed,
        revised,
        issues: report.issues,
        stats: report.stats,
      },
    }
  } catch {
    return null
  }
}
