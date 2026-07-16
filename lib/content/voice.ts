// Context assembly (spec §5.1 stage 1) — everything the model must SEE before
// ideating: who the business is (profile first, the Business record as
// fallback, plus whatever the user typed in the brief), what its area's real
// numbers say (our market engines, when a city is given), what's trending and
// not yet saturated, what's worked and flopped before, and the last ~50 titles
// so novelty is enforceable. Server-only. Best-effort per source.

import { prisma } from "@/lib/prisma"
import { fetchFundamentals } from "@/lib/market-fundamentals"
import { newsSweep } from "@/lib/own-access"
import { getActiveTrends } from "@/lib/content/trends"

export interface RunBrief {
  description?: string    // "just describe it" free text
  city?: string
  state?: string
  platforms?: string[]
  count?: number          // how many ideas the user wants back
}

export interface AssembledContext {
  block: string
  profileName: string
  platforms: string[]
}

interface ProfileRow {
  id: string; name: string; niche: string
  audienceNotes: string | null; voiceRules: string | null; platforms: string[]
}

export async function assembleContext(profileId: string | null, brief: RunBrief): Promise<AssembledContext> {
  const parts: string[] = []
  let profileName = "Ad-hoc business"
  let platforms = brief.platforms?.length ? brief.platforms : ["TikTok/Reels", "Shorts", "X"]

  // 1) Who the business is — profile first, Business record as fallback.
  let profile: ProfileRow | null = null
  if (profileId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    profile = await (prisma as any).brandProfile.findFirst({ where: { id: profileId } }).catch(() => null) as ProfileRow | null
  }
  if (profile) {
    profileName = profile.name
    if (!brief.platforms?.length && profile.platforms?.length) platforms = profile.platforms
    parts.push(`BUSINESS: ${profile.name} — ${profile.niche}`)
    if (profile.audienceNotes) parts.push(`AUDIENCE: ${profile.audienceNotes}`)
    if (profile.voiceRules) parts.push(`VOICE RULES (hard constraints): ${profile.voiceRules}`)
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const biz = await (prisma.business as any).findFirst({ orderBy: { createdAt: "asc" } }).catch(() => null)
    if (biz) {
      profileName = biz.name ?? profileName
      parts.push(`BUSINESS: ${biz.name ?? "the business"}${biz.type ? ` — ${biz.type}` : ""}${biz.location ? ` in ${biz.location}` : ""}${biz.description ? `. ${String(biz.description).slice(0, 300)}` : ""}`)
    }
  }
  if (brief.description?.trim()) {
    parts.push(`OWNER'S OWN DESCRIPTION (weigh this heaviest — it's how they see the business today): ${brief.description.trim().slice(0, 600)}`)
  }
  parts.push(`ENABLED PLATFORMS: ${platforms.join(", ")}`)

  // 2) The area's real numbers + fresh local headlines, when a city is given.
  if (brief.city?.trim()) {
    const city = brief.city.trim(), state = (brief.state ?? "").trim().toUpperCase()
    const [f, news] = await Promise.all([
      fetchFundamentals(city, state).catch(() => null),
      newsSweep([`${city} ${state} local news`, `${city} ${state} ${profile?.niche ?? "business"}`], 5).catch(() => []),
    ])
    const facts: string[] = []
    if (f?.population) facts.push(`population ${f.population.toLocaleString()}${f.popGrowth5yr != null ? ` (${f.popGrowth5yr > 0 ? "+" : ""}${f.popGrowth5yr}% growth)` : ""}`)
    if (f?.medianHomeValue) facts.push(`median home $${f.medianHomeValue.toLocaleString()}`)
    if (f?.medianRent) facts.push(`median rent $${f.medianRent}/mo`)
    if (f?.medianIncome) facts.push(`median income $${Math.round(f.medianIncome / 1000)}k`)
    if (f?.inboundMigrationPct != null) facts.push(`${f.inboundMigrationPct}% of residents moved in last year`)
    if (facts.length) parts.push(`AREA (${city}, ${state}) REAL NUMBERS — usable in hooks: ${facts.join("; ")}`)
    if (news.length) parts.push(`FRESH LOCAL HEADLINES:\n${news.slice(0, 5).map((n) => `- (${n.publishedAt || "recent"}) ${n.title}`).join("\n")}`)
  }

  // 3) Live trends — unsaturated only (saturated ones are liabilities).
  const trends = await getActiveTrends().catch(() => [])
  if (trends.length) {
    parts.push(`ACTIVE TRENDS (unsaturated — riding or subverting these is a plus):\n${trends.slice(0, 8).map((t) => `- [${t.platform}/${t.kind}] ${t.label}${t.description ? ` — ${t.description.slice(0, 90)}` : ""}`).join("\n")}`)
  }

  if (profile) {
    // 4) What's worked / flopped for THIS account (wins teach, flops teach more).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const exemplars = await (prisma as any).contentExemplar.findMany({ where: { brandProfileId: profile.id }, orderBy: { createdAt: "desc" }, take: 6 }).catch(() => []) as Array<{ hook: string | null; whyItWorked: string | null; isOwn: boolean; platform: string }>
    if (exemplars.length) {
      parts.push(`PROVEN EXEMPLARS (this voice's wins${exemplars.some((e) => !e.isOwn) ? " + competitor references" : ""}):\n${exemplars.map((e) => `- [${e.platform}] "${e.hook ?? "—"}"${e.whyItWorked ? ` → worked because: ${e.whyItWorked.slice(0, 120)}` : ""}`).join("\n")}`)
    }

    // 5) Novelty guard — the last ~50 titles must not be regenerated.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recent = await (prisma as any).contentIdea.findMany({ where: { brandProfileId: profile.id }, orderBy: { createdAt: "desc" }, take: 50 }).catch(() => []) as Array<{ title: string }>
    if (recent.length) parts.push(`RECENT TITLES (do NOT regenerate anything close to these):\n${recent.map((r) => `- ${r.title}`).join("\n")}`)
  }

  return { block: parts.join("\n\n"), profileName, platforms }
}
