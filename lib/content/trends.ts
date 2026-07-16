// Trend ingestion (spec §5.4) — pluggable adapters behind one interface, all
// normalized into TrendSignal rows. v1 adapters: our keyless news layer (works
// from datacenters) and manual entry (what Shaun sees that no API surfaces).
// Saturation is scored aggressively; getActiveTrends applies recency decay and
// filters the played-out. Server-only, best-effort.

import { prisma } from "@/lib/prisma"
import { newsSweep } from "@/lib/own-access"
import { runAgent } from "@/lib/claude"

export interface RawTrendSignal {
  platform: string
  kind: string          // sound, format, topic, meme, news, seasonal
  label: string
  description?: string
  velocity?: number     // 0-100
  saturation?: number   // 0-100, high = played out
  sourceUrl?: string
}

export interface TrendAdapter {
  id: string
  fetch(opts: { niche: string }): Promise<RawTrendSignal[]>
}

const EXTRACT_SYSTEM =
  "You extract CONTENT TRENDS from news headlines for short-form creators in a niche. " +
  'Return raw JSON: { "trends": [{ "platform": "TikTok/Reels"|"Shorts"|"X"|"all", "kind": "topic"|"news"|"seasonal"|"format", "label": string ≤ 60 chars, "description": string ≤ 120 chars (the content angle it enables), "velocity": 0-100 (how fast it is rising), "saturation": 0-100 (how played-out — be harsh; anything mainstream for weeks is 70+) }] }. ' +
  "Only trends actually supported by the headlines. Max 6. Never invent."

// Adapter 1: the news layer — headlines → extracted content trends.
const newsAdapter: TrendAdapter = {
  id: "news-rss",
  async fetch({ niche }) {
    const items = await newsSweep([`${niche} trend`, `${niche} viral`, `${niche} news this week`], 7).catch(() => [])
    if (!items.length) return []
    const corpus = items.map((n) => `- (${n.publishedAt || "recent"}) ${n.title} — ${n.snippet.slice(0, 120)}`).join("\n")
    try {
      const out = await runAgent(EXTRACT_SYSTEM, `Niche: ${niche}\n\nHeadlines:\n${corpus}`, { jsonMode: true, maxTokens: 900 })
      const obj = typeof out === "string" ? JSON.parse(out.match(/\{[\s\S]*\}/)?.[0] ?? "{}") : out as Record<string, unknown>
      const raw = Array.isArray((obj as Record<string, unknown>).trends) ? ((obj as Record<string, unknown>).trends as unknown[]) : []
      return raw
        .filter((t): t is Record<string, unknown> => !!t && typeof t === "object")
        .map((t) => ({
          platform: typeof t.platform === "string" ? t.platform.slice(0, 20) : "all",
          kind: typeof t.kind === "string" ? t.kind.slice(0, 20) : "topic",
          label: typeof t.label === "string" ? t.label.slice(0, 80) : "",
          description: typeof t.description === "string" ? t.description.slice(0, 160) : undefined,
          velocity: typeof t.velocity === "number" ? Math.max(0, Math.min(100, t.velocity)) : undefined,
          saturation: typeof t.saturation === "number" ? Math.max(0, Math.min(100, t.saturation)) : undefined,
        }))
        .filter((t) => t.label.length > 2)
    } catch {
      return []
    }
  },
}

const ADAPTERS: TrendAdapter[] = [newsAdapter]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const trendModel = () => (prisma as any).trendSignal

// Cron entry: pull every adapter, dedupe by label against the recent window.
export async function refreshTrends(niche: string): Promise<number> {
  try {
    const results = await Promise.allSettled(ADAPTERS.map((a) => a.fetch({ niche })))
    const fresh: RawTrendSignal[] = []
    for (const r of results) if (r.status === "fulfilled") fresh.push(...r.value)
    if (!fresh.length) return 0

    const recent = await trendModel().findMany({ orderBy: { capturedAt: "desc" }, take: 100 }).catch(() => []) as Array<{ label: string }>
    const have = new Set(recent.map((t) => t.label.toLowerCase()))
    let added = 0
    for (const t of fresh) {
      if (have.has(t.label.toLowerCase())) continue
      await trendModel().create({ data: {
        id: crypto.randomUUID(),
        platform: t.platform, kind: t.kind, label: t.label,
        description: t.description ?? null,
        velocity: t.velocity ?? null, saturation: t.saturation ?? null,
        sourceUrl: t.sourceUrl ?? null,
        capturedAt: new Date().toISOString(),
      } }).catch(() => null)
      added++
    }
    return added
  } catch {
    return 0
  }
}

export async function addManualTrend(t: RawTrendSignal): Promise<boolean> {
  try {
    await trendModel().create({ data: {
      id: crypto.randomUUID(),
      platform: t.platform || "all", kind: t.kind || "topic", label: t.label.slice(0, 80),
      description: t.description?.slice(0, 200) ?? null,
      velocity: t.velocity ?? null, saturation: t.saturation ?? null,
      sourceUrl: t.sourceUrl ?? null,
      capturedAt: new Date().toISOString(),
    } })
    return true
  } catch {
    return false
  }
}

export interface ActiveTrend { platform: string; kind: string; label: string; description: string | null; velocity: number | null; saturation: number | null; capturedAt: string }

// Fresh + unsaturated, recency-decayed: saturated or stale trends are filtered,
// the rest sorted by (velocity − saturation) with an age penalty.
export async function getActiveTrends(platform?: string): Promise<ActiveTrend[]> {
  try {
    const rows = await trendModel().findMany({ orderBy: { capturedAt: "desc" }, take: 60 }).catch(() => []) as ActiveTrend[]
    const now = Date.now()
    return rows
      .filter((t) => (t.saturation ?? 40) < 70)
      .filter((t) => !platform || t.platform === platform || t.platform === "all")
      .filter((t) => now - Date.parse(t.capturedAt) < 21 * 86400000)
      .map((t) => ({ t, s: (t.velocity ?? 50) - (t.saturation ?? 40) - ((now - Date.parse(t.capturedAt)) / 86400000) * 1.5 }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 12)
      .map((x) => x.t)
  } catch {
    return []
  }
}
