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
import { getSteerHints, steerHintDirectives } from "@/lib/content/steer-hints"

export interface RunBrief {
  description?: string    // "just describe it" free text
  city?: string
  state?: string
  platforms?: string[]
  count?: number          // how many ideas the user wants back
  mode?: ContentMode
  // ── Steering: the commands that make output specific to what you want ──
  goal?: ContentGoal      // #1 what a "win" is — the pipeline optimizes for it
  formats?: string[]      // #2 formats you demand (carousel, talking-head, …)
  audience?: string       // #3 the exact persona to speak to
  tone?: string[]         // #4 tone dials (funny, authoritative, heartfelt, …)
  avoid?: string          // #6 hard negative constraints ("never mention price")
  reference?: string      // #7 a video/post to reverse-engineer the structure of
  cta?: string            // #8 the exact call to action to drive to
  offer?: string          // #8 the specific offer/hook to feature
  series?: number         // #9 make a connected N-part series
  durationSec?: number    // #10 target length in seconds (per platform)
}

// What the whole pipeline optimizes for: business = customer acquisition,
// individual = personal brand, skit = viral Reels/TikTok comedy anchored in
// the business, ad = direct-response advertisements that convert.
export type ContentMode = "business" | "individual" | "skit" | "ad"

// #1 — the concrete objective every idea must serve. Each reshapes scoring.
export type ContentGoal = "customers" | "awareness" | "appointments" | "sell-item" | "leads" | "loyalty"

const GOAL_DIRECTIVE: Record<ContentGoal, string> = {
  customers:    "OBJECTIVE: drive foot traffic / new paying customers. Every idea ends by making the viewer want to come in and buy.",
  awareness:    "OBJECTIVE: maximum reach & new eyeballs. Optimize for shares and saves above all — broad relatability over narrow selling.",
  appointments: "OBJECTIVE: booked appointments/consults. Each idea builds enough trust + urgency that the viewer books; the CTA is 'book now'.",
  "sell-item":  "OBJECTIVE: sell a SPECIFIC product/service/listing. Show the exact item vividly, the transformation it delivers, and why now.",
  leads:        "OBJECTIVE: capture leads (DM, form, link). Ideas open a loop the viewer must DM/click to close — lead magnet logic.",
  loyalty:      "OBJECTIVE: repeat business from existing customers. Insider value, community, and reasons to come back — retention over acquisition.",
}

// The retention + conversion science that makes viewers "get stuck" and act.
// Applied to EVERY divergent run so ideas are engineered to hold attention and
// convert, not just be clever.
const STICK_AND_CONVERT =
  "ATTENTION ENGINEERING (make viewers GET STUCK): the first 1.5 seconds must pattern-interrupt — a bold claim, a visual anomaly, motion, or a question the brain can't leave unanswered. " +
  "Open an information gap in the first line and DON'T pay it off until the end (the 'open loop' that beats the scroll). Build in a re-watch reason (a detail you only catch the second time) and a reason to send it to one specific person. Front-load the payoff tease; never bury the point behind a slow intro. " +
  "CONVERSION (turn attention into money): every idea must carry an implicit or explicit next step toward the OBJECTIVE — show the product/result concretely, reduce the viewer's perceived risk, and end on ONE unambiguous action. No idea that entertains but sells nothing survives when the objective is commercial."

// Assemble all steering commands into directives the whole pipeline obeys.
function steeringDirectives(brief: RunBrief): string[] {
  const out: string[] = []
  const goal = brief.goal
  if (goal && GOAL_DIRECTIVE[goal]) out.push(GOAL_DIRECTIVE[goal])
  if (brief.audience?.trim()) out.push(`TARGET AUDIENCE (write to THIS person — their pains, language, and desires drive the hook): ${brief.audience.trim().slice(0, 300)}`)
  if (brief.tone?.length) out.push(`TONE (hard style constraint — every idea must sound like this): ${brief.tone.join(", ")}.`)
  if (brief.formats?.length) out.push(`REQUIRED FORMATS: at least most ideas MUST use these exact formats — ${brief.formats.join(", ")}. Set each idea's "format" field accordingly.`)
  if (brief.offer?.trim()) out.push(`FEATURE THIS OFFER prominently in the relevant ideas: ${brief.offer.trim().slice(0, 200)}`)
  if (brief.cta?.trim()) out.push(`CALL TO ACTION — every idea must drive to exactly this: "${brief.cta.trim().slice(0, 160)}".`)
  if (brief.reference?.trim()) out.push(`REFERENCE TO REVERSE-ENGINEER (copy its STRUCTURE/mechanics — hook shape, pacing, format — NOT its topic; apply that skeleton to THIS business): ${brief.reference.trim().slice(0, 400)}`)
  if (brief.series && brief.series > 1) out.push(`SERIES MODE: produce a CONNECTED ${Math.min(brief.series, 12)}-part series — a shared theme/character/format across the parts, each titled "Part N: …", each standing alone yet pulling the viewer to the next. Number them in order.`)
  if (brief.durationSec && brief.durationSec > 0) out.push(`TARGET LENGTH: ~${brief.durationSec}s of content — pace the idea for that runtime on its platform.`)
  if (brief.avoid?.trim()) out.push(`HARD "DO NOT" LIST (an idea that violates ANY of these is an automatic fail): ${brief.avoid.trim().slice(0, 300)}`)
  return out
}

// Proven viral skit structures — the evergreen floor. Live trend formats from
// the daily hunter layer on top of these so skit ideas ride what's working NOW.
const SKIT_STRUCTURES = [
  "POV: you're the customer/employee in a hyper-specific relatable moment",
  "Expectation vs reality — what people think we do vs what actually happens",
  "Types of customers — rapid-fire characters everyone recognizes",
  "Staff overreaction — a tiny everyday thing treated as life-or-death",
  "Overheard conversation — camera catches an absurd but believable exchange",
  "The new employee's first day — everything that can go wrong, escalating",
  "Boss made us do it — staff reluctantly performing something ridiculous",
  "Silent skit to a trending sound — the audio carries the joke, business is the set",
  "Recurring character series — one exaggerated persona customers come back for",
  "Reply-to-comment skit — act out an answer to a real (or plausible) comment",
]

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
  } else if (!brief.description?.trim()) {
    // Only fall back to the platform's Business record when the user gave us
    // NOTHING — if they described the business, that description IS the
    // business (a coffee-shop brief must never inherit our own record).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const biz = await (prisma.business as any).findFirst({ orderBy: { createdAt: "asc" } }).catch(() => null)
    if (biz) {
      profileName = biz.name ?? profileName
      parts.push(`BUSINESS: ${biz.name ?? "the business"}${biz.type ? ` — ${biz.type}` : ""}${biz.location ? ` in ${biz.location}` : ""}${biz.description ? `. ${String(biz.description).slice(0, 300)}` : ""}`)
    }
  }
  if (brief.description?.trim()) {
    profileName = profile ? profileName : brief.description.trim().slice(0, 40)
    parts.push(`THE BUSINESS (the owner's own words — this DEFINES what the business is; every idea must be about THIS business): ${brief.description.trim().slice(0, 600)}`)
  }
  const mode: ContentMode = brief.mode ?? "business"
  if (mode === "individual") {
    parts.push("GOAL: grow this INDIVIDUAL's personal audience and brand — ideas are posts they personally make; personality, story, and expertise are the product.")
  } else if (mode === "skit") {
    parts.push(
      "GOAL — SKIT MODE: every single idea is a complete COMEDY SKIT in the style of viral Instagram Reels / TikToks. Each premise must name: the characters, the hyper-relatable tension the audience recognizes in the first second, the escalation, and the punchline. " +
      "Anchor every skit in THIS business's real everyday world — its staff, customers, product, and place ARE the set and cast — so laughing at it makes viewers want to show up and spend. " +
      "Optimize for maximum viral chance: instantly relatable, replayable, sendable to a friend, duet/stitch-able. Prefer the freshest 'format' entries in ACTIVE TRENDS when one fits; otherwise build on these proven structures:\n" +
      SKIT_STRUCTURES.map((s) => `- ${s}`).join("\n"))
  } else if (mode === "ad") {
    parts.push(
      "GOAL — AD MODE: every idea is an ADVERTISEMENT built to convert viewers into paying customers and make this business money. Each premise must contain: a scroll-stopping opening, the product/offer shown vividly and specifically, a concrete reason to act NOW (offer, event, scarcity, deadline), and ONE clear call to action. " +
      "Native to the platform — it should feel like a creator's video, never a corporate commercial — but its job is direct revenue. Vary the vehicles: testimonial-style, demo/result, founder-to-camera, before/after, offer reveal, us-vs-the-usual-way.")
  } else {
    parts.push("GOAL: bring PAYING CUSTOMERS through the door. Every idea must be a post THIS business itself would publish to attract ITS OWN customers — signature products, offers, events, behind-the-scenes, staff skits, customer moments, local hooks. Industry commentary or content about other businesses is off-goal.")
  }

  // Steering commands (objective, audience, tone, formats, offer, CTA,
  // reference, series, length, don'ts) + the attention/conversion science.
  for (const d of steeringDirectives(brief)) parts.push(d)
  // "More like this / less like this" learned from the operator's thumbs.
  for (const d of steerHintDirectives(await getSteerHints(profileId).catch(() => ({ more: [], less: [] })))) parts.push(d)
  parts.push(STICK_AND_CONVERT)

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
    parts.push(`ACTIVE TRENDS (unsaturated; USE ONLY those genuinely relevant to THIS business — ignore the rest):\n${trends.slice(0, 8).map((t) => `- [${t.platform}/${t.kind}] ${t.label}${t.description ? ` — ${t.description.slice(0, 90)}` : ""}`).join("\n")}`)
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
