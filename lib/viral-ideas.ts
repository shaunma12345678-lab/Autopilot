// Viral Content Engine — content ideas for THIS business and ITS situation,
// not generic "post value content" advice. Three stages:
//   1. GROUND — pull the business's real ammunition: its market's live numbers
//      (Census/Zillow/PMMS via our engines), fresh local news (our RSS layer),
//      and the operator's own results. Hooks built on real numbers stop thumbs;
//      hooks built on vibes don't.
//   2. GENERATE against a curated library of proven viral FORMATS (contrarian
//      take, data-drop, myth-bust, receipts-listicle, POV story, stitch-bait),
//      each idea required to cite a specific fact from the grounding block.
//   3. SELF-SCORE — the model rates every candidate on hook strength, emotion,
//      specificity, and shareability, and only the ranked winners return, each
//      as a complete package: hook, beat-by-beat script, caption, hashtags,
//      platform. Cached per business+market for a day. Never throws.

import { prisma } from "@/lib/prisma"
import { resolveLearningBusinessId } from "@/lib/learning-store"
import { runAgent } from "@/lib/claude"
import { newsSweep } from "@/lib/own-access"
import { fetchFundamentals } from "@/lib/market-fundamentals"
import { buildRentalIntel } from "@/lib/rental-intel"

const SLUG = "re-viral-ideas"
const TTL_MS = 24 * 60 * 60 * 1000

export interface ViralIdea {
  hook: string            // the first 2 seconds / first line
  format: string          // which viral format it uses
  platform: string        // where it hits hardest
  score: number           // the model's self-rated virality 0-100
  whyItWorks: string      // the psychology, one line
  beats: string[]         // the script, beat by beat
  caption: string
  hashtags: string[]
}

export interface ViralIdeasResult {
  ideas: ViralIdea[]
  groundedOn: string[]    // which real facts fed the ideas
  at: string
}

const FORMATS = `VIRAL FORMATS (pick the best fit per idea):
- CONTRARIAN: "Everyone says X. The data says the opposite." Needs a real number that surprises.
- DATA-DROP: "I analyzed N properties/homes in {city}. Here's what nobody tells you." Receipts on screen.
- MYTH-BUST: kill a belief the audience holds, with the specific fact that kills it.
- RECEIPTS-LISTICLE: "3 signs a {city} homeowner is about to sell" — each sign a real signal.
- POV-STORY: first-person walk-through of one deal/situation, tension → number → payoff.
- STITCH-BAIT: a question or hot take engineered to make locals and agents reply/duet.
- LOCAL-NEWS-JACK: react to a fresh local headline within 48h, tie it to what it means for homeowners/investors.`

const SYSTEM =
  "You are a short-form content strategist for real estate businesses. Generate SPECIFIC, filmable content ideas grounded ONLY in the facts provided — every hook must contain or set up a real number/fact from the GROUNDING block (never invent statistics). " +
  FORMATS +
  ' Return raw JSON: { "ideas": [{ "hook": string (the exact opening line, ≤120 chars, no hashtags), "format": string, "platform": "TikTok/Reels"|"Shorts"|"X"|"LinkedIn", "score": number (0-100 — self-rate ruthlessly on: scroll-stopping hook 40%, emotional charge 20%, specificity/receipts 25%, share-trigger 15%; most ideas deserve 40-65, reserve 80+ for genuinely exceptional), "whyItWorks": string ≤ 20 words, "beats": [4-6 short script beats], "caption": string ≤ 200 chars, "hashtags": [4-6 without #] }] }. ' +
  "Generate 10 candidates internally, self-score, and return ONLY the top 6 sorted by score. Vary the formats. Write like a creator, not a marketer."

async function loadCached(bizId: string, key: string): Promise<ViralIdeasResult | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mem = prisma.agentMemory as any
    const row = await mem.findFirst({ where: { businessId: bizId, agentSlug: SLUG, key } })
    if (row?.value) {
      const parsed = JSON.parse(row.value) as ViralIdeasResult
      if (parsed?.at && Date.now() - Date.parse(parsed.at) < TTL_MS && parsed.ideas?.length) return parsed
    }
  } catch { /* first run */ }
  return null
}

async function saveCached(bizId: string, key: string, data: ViralIdeasResult): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mem = prisma.agentMemory as any
    const value = JSON.stringify(data)
    await mem.upsert({
      where:  { businessId: bizId, agentSlug: SLUG, key },
      create: { id: crypto.randomUUID(), businessId: bizId, agentSlug: SLUG, key, value, updatedAt: new Date().toISOString() },
      update: { value, updatedAt: new Date().toISOString() },
    })
  } catch { /* best-effort */ }
}

// Stage 1: the grounding block — this business's real ammunition.
async function gatherGrounding(city: string, state: string, situation: string): Promise<{ block: string; facts: string[] }> {
  const facts: string[] = []
  const [f, news] = await Promise.all([
    fetchFundamentals(city, state).catch(() => null),
    newsSweep([`${city} ${state} housing market`, `${city} ${state} real estate news`], 6).catch(() => []),
  ])
  const r = f ? await buildRentalIntel(city, state, f).catch(() => null) : null

  if (f?.medianHomeValue) facts.push(`Median home value in ${city}: $${f.medianHomeValue.toLocaleString()}`)
  if (f?.medianRent) facts.push(`Median rent: $${f.medianRent}/mo${f.rent3br ? ` (3-bed $${f.rent3br})` : ""}`)
  if (r?.mortgageRate != null) facts.push(`Today's 30-yr mortgage rate: ${r.mortgageRate}% (Freddie Mac)`)
  if (r?.cashflowGap != null) facts.push(`The median ${city} house ${r.cashflowGap >= 0 ? `CASH-FLOWS +$${r.cashflowGap}/mo` : `loses $${Math.abs(r.cashflowGap)}/mo`} as a rental at today's rate (20% down)`)
  if (r?.rentYoY != null) facts.push(`Rents ${r.rentYoY >= 0 ? "up" : "down"} ${Math.abs(r.rentYoY)}% in 12 months (Zillow)`)
  if (r?.priceYoY != null) facts.push(`Prices ${r.priceYoY >= 0 ? "up" : "down"} ${Math.abs(r.priceYoY)}% in 12 months`)
  if (f?.inboundMigrationPct != null) facts.push(`${f.inboundMigrationPct}% of residents moved in within the last year`)
  if (f?.rentalVacancyPct != null) facts.push(`Rental vacancy: ${f.rentalVacancyPct}%`)
  if (f?.jobGrowthPct != null) facts.push(`Jobs ${f.jobGrowthPct >= 0 ? "+" : ""}${f.jobGrowthPct}% YoY (${state} statewide, BLS)`)
  for (const n of news.slice(0, 5)) facts.push(`LOCAL HEADLINE (${n.publishedAt || "recent"}): ${n.title}`)

  const block = [
    `BUSINESS: ${situation}`,
    `MARKET: ${city}, ${state}`,
    facts.length ? `GROUNDING (real, current facts — hooks must use these):\n- ${facts.join("\n- ")}` : "GROUNDING: (no live stats available — ideas must be situation-based, still no invented numbers)",
  ].join("\n")
  return { block, facts }
}

export async function viralIdeas(p: { city: string; state: string; situation?: string; fresh?: boolean }): Promise<ViralIdeasResult | null> {
  const city = p.city.trim(), state = p.state.trim().toUpperCase()
  if (!city) return null
  const situation = (p.situation ?? "").trim().slice(0, 400) ||
    "A local real-estate investor/wholesaler who buys houses for cash, helps distressed homeowners, and wants inbound sellers + credibility with local investors."
  const key = `${city.toLowerCase()}:${state}:${situation.slice(0, 40).toLowerCase().replace(/[^a-z0-9]/g, "")}`

  const bizId = await resolveLearningBusinessId().catch(() => null)
  if (bizId && !p.fresh) {
    const cached = await loadCached(bizId, key)
    if (cached) return cached
  }

  try {
    const { block, facts } = await gatherGrounding(city, state, situation)
    const out = await runAgent(SYSTEM, block, { jsonMode: true, maxTokens: 3200 })
    const obj = typeof out === "string" ? (() => { try { const m = out.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : null } catch { return null } })() : (out as Record<string, unknown>)
    const raw = Array.isArray((obj as Record<string, unknown>)?.ideas) ? ((obj as Record<string, unknown>).ideas as unknown[]) : []

    const ideas: ViralIdea[] = []
    for (const it of raw) {
      if (!it || typeof it !== "object") continue
      const i = it as Record<string, unknown>
      const hook = typeof i.hook === "string" ? i.hook.trim().slice(0, 160) : ""
      if (hook.length < 10) continue
      ideas.push({
        hook,
        format: typeof i.format === "string" ? i.format.slice(0, 40) : "DATA-DROP",
        platform: typeof i.platform === "string" ? i.platform.slice(0, 20) : "TikTok/Reels",
        score: typeof i.score === "number" ? Math.max(0, Math.min(100, Math.round(i.score))) : 50,
        whyItWorks: typeof i.whyItWorks === "string" ? i.whyItWorks.slice(0, 160) : "",
        beats: (Array.isArray(i.beats) ? i.beats : []).filter((b): b is string => typeof b === "string").map((b) => b.slice(0, 200)).slice(0, 6),
        caption: typeof i.caption === "string" ? i.caption.slice(0, 220) : "",
        hashtags: (Array.isArray(i.hashtags) ? i.hashtags : []).filter((h): h is string => typeof h === "string").map((h) => h.replace(/^#/, "").slice(0, 30)).slice(0, 6),
      })
      if (ideas.length >= 6) break
    }
    if (!ideas.length) return null
    ideas.sort((a, b) => b.score - a.score)

    const result: ViralIdeasResult = { ideas, groundedOn: facts.slice(0, 10), at: new Date().toISOString() }
    if (bizId) await saveCached(bizId, key, result)
    return result
  } catch {
    return null
  }
}
