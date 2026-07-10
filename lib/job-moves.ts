// Jobs moving in / out — our own web+AI layer that answers "which employers are
// coming and going?" for a city. Metasearches recent news (expansions, HQ
// relocations, plant openings, layoffs, closures), then AI-extracts ONLY the
// employers named verbatim in the snippets (anti-hallucination), each with the
// job count when reported and a one-line note. Cached in AgentMemory per city
// for 7 days so repeat views are instant and cheap. Server-only, never throws.

import { prisma } from "@/lib/prisma"
import { resolveLearningBusinessId } from "@/lib/learning-store"
import { webSearchMeta } from "@/lib/search"
import { runAgent } from "@/lib/claude"

const SLUG = "re-job-moves"
const TTL_MS = 7 * 24 * 60 * 60 * 1000

export interface JobMove {
  company: string
  jobs: number | null    // announced job count when the article states one
  note: string           // what's happening, one line
}

export interface JobMoves {
  inbound: JobMove[]     // expansions, relocations, openings
  outbound: JobMove[]    // layoffs, closures, departures
  at: string
  sources: number        // how many web results informed this
}

function keyFor(city: string, state: string): string {
  return `${city.toLowerCase().trim()}:${(state || "").toUpperCase().trim()}`
}

async function loadCached(bizId: string, key: string): Promise<JobMoves | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mem = prisma.agentMemory as any
    const row = await mem.findFirst({ where: { businessId: bizId, agentSlug: SLUG, key } })
    if (row?.value) {
      const parsed = JSON.parse(row.value) as JobMoves
      if (parsed?.at && Date.now() - Date.parse(parsed.at) < TTL_MS) return parsed
    }
  } catch { /* first run */ }
  return null
}

async function saveCached(bizId: string, key: string, moves: JobMoves): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mem = prisma.agentMemory as any
    const value = JSON.stringify(moves)
    await mem.upsert({
      where:  { businessId: bizId, agentSlug: SLUG, key },
      create: { id: crypto.randomUUID(), businessId: bizId, agentSlug: SLUG, key, value, updatedAt: new Date().toISOString() },
      update: { value, updatedAt: new Date().toISOString() },
    })
  } catch { /* best-effort */ }
}

const SYSTEM =
  "You extract employer moves from news snippets about a city. Return raw JSON: " +
  '{ "inbound": [{ "company": string, "jobs": number|null, "note": string }], "outbound": [same] }. ' +
  "inbound = companies expanding, relocating to, opening facilities, or announcing hiring IN this city/metro. outbound = layoffs, plant/office closures, or companies leaving. " +
  "STRICT RULES: only include a company whose NAME appears verbatim in the snippets. Only include a jobs number that appears in the text (else null). Each note ≤ 12 words, factual. Skip anything older than ~2 years when a date is visible. Max 6 per list. If nothing qualifies, return empty arrays. Never invent."

const year = new Date().getFullYear()

export async function discoverJobMoves(city: string, state: string): Promise<JobMoves | null> {
  const c = city.trim(), st = (state || "").trim()
  if (!c) return null
  const key = keyFor(c, st)

  const bizId = await resolveLearningBusinessId().catch(() => null)
  if (bizId) {
    const cached = await loadCached(bizId, key)
    if (cached) return cached
  }

  try {
    const place = [c, st].filter(Boolean).join(" ")
    const queries = [
      `${place} company expansion new jobs ${year}`,
      `${place} headquarters relocation opening facility hiring`,
      `${place} layoffs plant closing ${year}`,
    ]
    const chunks: string[] = []
    let sources = 0
    for (const q of queries) {
      const r = await webSearchMeta(q, 6).catch(() => null)
      for (const res of r?.results ?? []) {
        if (!res.content) continue
        chunks.push(`[${res.title}] ${res.content}`.slice(0, 500))
        sources++
      }
    }
    if (!chunks.length) return null

    const out = await runAgent(SYSTEM, `City: ${place}\n\nNews snippets:\n${chunks.slice(0, 24).join("\n---\n")}`, { model: "haiku", jsonMode: true, maxTokens: 900 })
    const obj = typeof out === "string" ? (() => { try { const m = out.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : null } catch { return null } })() : (out as Record<string, unknown>)
    if (!obj) return null

    const clean = (arr: unknown): JobMove[] => (Array.isArray(arr) ? arr : [])
      .filter((x): x is Record<string, unknown> => !!x && typeof x === "object" && typeof (x as Record<string, unknown>).company === "string")
      .map((x) => ({
        company: String(x.company).trim().slice(0, 80),
        jobs: typeof x.jobs === "number" && Number.isFinite(x.jobs) && x.jobs > 0 ? Math.round(x.jobs) : null,
        note: typeof x.note === "string" ? x.note.trim().slice(0, 120) : "",
      }))
      .filter((x) => x.company.length > 1)
      .slice(0, 6)

    const moves: JobMoves = { inbound: clean(obj.inbound), outbound: clean(obj.outbound), at: new Date().toISOString(), sources }
    if (bizId && (moves.inbound.length || moves.outbound.length)) await saveCached(bizId, key, moves)
    return moves
  } catch {
    return null
  }
}
