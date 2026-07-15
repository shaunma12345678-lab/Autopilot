// Voice/text assistant — conversational, agentic, and GROUNDED. Two steps:
// (1) classify the question + extract an action; (2) when it's about a market
// or a specific property, fetch OUR live data server-side (Census/BLS/Zillow
// fundamentals, the rental deep-dive, county parcel records, metro anchors)
// and compose the answer FROM those verified numbers — the model is told to
// use only what we hand it, so real-estate questions get real answers, never
// invented stats. Search requests still return an executable action for the
// client. Uses Groq. Robust: safe fallbacks, never throws.

export const maxDuration = 60

import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { runAgent } from "@/lib/claude"
import { fetchFundamentals } from "@/lib/market-fundamentals"
import { buildRentalIntel } from "@/lib/rental-intel"
import { enrichFromParcel } from "@/lib/parcel-enrich"
import { analyzeDeal } from "@/lib/deal-analysis"
import type { ForeclosureLead } from "@/lib/agents/foreclosure-agent"

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? ""   // no fallback: unset env disables admin access

function isAuthorized(request: NextRequest, user: unknown): boolean {
  if (user) return true
  return ADMIN_PASSWORD.length > 0 && request.headers.get("x-admin-password") === ADMIN_PASSWORD
}

function safeParse(s: string): Record<string, unknown> | null {
  try { const m = s.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : null } catch { return null }
}

function firstSentence(text: string): string {
  return text.split(/(?<=[.!?])\s/)[0] ?? text
}

export interface VoiceSearchAction {
  searchType: "city" | "zip" | "county"
  city?: string
  state?: string
  zip?: string
  county?: string
  leadType?: string
  maxLeads?: number
}

const LEAD_TYPES = "foreclosure, predicted, probate, taxdelq, vacant, absentee, liens, code, divorce, eviction, bankruptcy, highequity, motivated"

const CLASSIFY_SYSTEM =
  "You route a real-estate investor's question. Return raw JSON: " +
  '{ "intent": "search"|"market"|"address"|"general", "search": {...}|null, "market": { "city": string, "state": string (2-letter) }|null, "address": { "address": string, "city"?: string, "state"?: string, "zip"?: string }|null }. ' +
  "intent=search when they want to FIND/GET deals or leads somewhere (search: { searchType: 'city'|'zip'|'county', city?, state?, zip?, county?, leadType?, maxLeads? } — " +
  `leadType one of: ${LEAD_TYPES}; for refinements reuse the previous area unless a new one is named). ` +
  "intent=market when they ask ABOUT a city/metro/market — rents, prices, vacancy, cash flow, appreciation, jobs, whether it's good for rentals/flips/STR/investing. " +
  "intent=address when they ask about ONE specific property address (worth, owner, good deal, what to offer). " +
  "intent=general for everything else (deal math, negotiation, how-to, the app). Fill only the object matching the intent; the rest null."

const ANSWER_SYSTEM =
  "You are DealPilot, the AI assistant for a real estate investor/wholesaler on the AutoPilot platform. You hold a conversation — build on it. " +
  "Return raw JSON: { \"spoken\": string, \"detail\": string }. " +
  '"spoken": 1-2 conversational sentences with the headline answer (read aloud — no markdown, no lists). ' +
  '"detail": the FULL detailed written answer — numbers worked step by step, word-for-word scripts when outreach is involved, exact section names when the app is involved. Plain text, short paragraphs, simple dash lists. ' +
  "CRITICAL DATA RULES: when a VERIFIED DATA block is provided, answer FROM it — cite its numbers precisely and note what they mean for the investor; do not add statistics from memory. When NO data block is provided and the question needs live stats, say which platform section has it (📈 Markets for city stats, 🏚 Real Estate to find deals, 🤝 Cash Buyers for buyers, /analyze for one address) and offer to run it — NEVER invent numbers."

// ── Grounding: build a verified-data digest from OUR engines ─────────────────

async function marketDigest(city: string, state: string): Promise<string | null> {
  try {
    const f = await fetchFundamentals(city, state).catch(() => null)
    const r = await buildRentalIntel(city, state, f).catch(() => null)
    if (!f && !r) return null
    const L: string[] = [`VERIFIED DATA for ${city}, ${state} (our live engines — Census ACS, BLS, Zillow Research, Freddie Mac):`]
    if (f) {
      L.push(`- Population ${f.population?.toLocaleString() ?? "n/a"}, growth ${f.popGrowth5yr ?? "n/a"}%${f.growthFrom ? ` (${f.growthFrom})` : ""}, moved-in last yr ${f.inboundMigrationPct ?? "n/a"}%`)
      L.push(`- Jobs YoY ${f.jobGrowthPct ?? "n/a"}%${f.jobsNote ? ` (${f.jobsNote})` : ""}, unemployment ${f.unemploymentRate ?? "n/a"}%, poverty ${f.povertyRate ?? "n/a"}%, median income $${f.medianIncome?.toLocaleString() ?? "n/a"}`)
      L.push(`- Median home value $${f.medianHomeValue?.toLocaleString() ?? "n/a"}, median rent $${f.medianRent ?? "n/a"} (1bd $${f.rent1br ?? "n/a"} / 2bd $${f.rent2br ?? "n/a"} / 3bd $${f.rent3br ?? "n/a"}), gross yield ${f.grossYield ?? "n/a"}%, price-to-income ${f.priceToIncome ?? "n/a"}x`)
      L.push(`- Vacancy ${f.vacancyRate ?? "n/a"}% (rental vacancy ${f.rentalVacancyPct ?? "n/a"}%), occupancy ${f.occupancyPct ?? "n/a"}%, renter share ${f.renterSharePct ?? "n/a"}%`)
      L.push(`- Demand proxies: vacation-home share ${f.seasonalSharePct ?? "n/a"}%, healthcare employment ${f.healthcareSharePct ?? "n/a"}%, college share ${f.collegeSharePct ?? "n/a"}%`)
    }
    if (r) {
      L.push(`- Zillow trend (${r.metro ?? "metro"}): rent $${r.zoriRent ?? "n/a"}/mo, rent YoY ${r.rentYoY ?? "n/a"}% (3yr ${r.rent3yrAnnual ?? "n/a"}%/yr), price YoY ${r.priceYoY ?? "n/a"}%, 3-mo momentum ${r.priceMomentum ?? "n/a"}%, worst 10-yr drawdown -${r.drawdown10y ?? "n/a"}%`)
      L.push(`- Today's 30-yr rate ${r.mortgageRate ?? "n/a"}%; median-door payment ~$${r.monthlyPayment?.toLocaleString() ?? "n/a"}/mo → cash flow ${r.cashflowGap != null ? `${r.cashflowGap >= 0 ? "+" : ""}$${r.cashflowGap}/mo` : "n/a"}`)
      if (r.landlord) L.push(`- Landlord law (${r.landlord.state}): grade ${r.landlord.grade}, ~${r.landlord.evictionDays}-day eviction${r.landlord.rentControl ? ", rent control present" : ""}`)
      if (r.strRule) L.push(`- STR rule: ${r.strRule.status.toUpperCase()} — ${r.strRule.note}`)
      L.push(`- Rental grades: LTR ${r.ltr.grade} ${r.ltr.score} · MTR ${r.mtr.grade} ${r.mtr.score} · STR ${r.str.grade} ${r.str.score} → best: ${r.bestRental}. ${r.verdict}`)
    }
    return L.join("\n")
  } catch {
    return null
  }
}

async function addressDigest(a: { address: string; city?: string; state?: string; zip?: string }): Promise<string | null> {
  try {
    const state = (a.state ?? "CA").toUpperCase()
    const [parcel, f] = await Promise.all([
      enrichFromParcel(a.address, state).catch(() => null),
      a.city ? fetchFundamentals(a.city, state).catch(() => null) : Promise.resolve(null),
    ])
    const anchor = f?.medianHomeValue ?? null
    const lead = {
      attomId: 0, address: a.address, city: a.city ?? "", state, zip: a.zip ?? "",
      ownerName: parcel?.ownerName ?? "", isAbsentee: false, mailingAddress: parcel?.mailingAddress ?? null,
      foreclosureType: "", foreclosureStage: "PRE_FORECLOSURE", recordingDate: "", daysOnFile: 0,
      estimatedValue: null, avmValue: null, purchasePrice: null, purchaseDate: null,
      totalLiens: 0, lienCount: 0, estimatedEquity: null, equityPercent: null, taxDelinquent: false,
      propertyType: parcel?.propertyType ?? null, beds: parcel?.beds ?? null, baths: parcel?.baths ?? null,
      sqft: parcel?.sqft ?? null, yearBuilt: parcel?.yearBuilt ?? null, lotSize: null,
      score: 50, priority: "WARM", scoreReason: "", distressSignals: [], dealCalc: null, outreach: null,
      rentEstimate: f?.medianRent ?? null, comps: [],
    } as unknown as ForeclosureLead
    const d = analyzeDeal(lead, undefined, anchor ? { fallbackValue: anchor } : undefined)
    if (!parcel && !anchor) return null
    const L: string[] = [`VERIFIED DATA for ${a.address}${a.city ? `, ${a.city}` : ""}, ${state} (county records + our underwrite):`]
    if (parcel) L.push(`- County parcel (${parcel.source}): owner ${parcel.ownerName ?? "n/a"}, mailing ${parcel.mailingAddress ?? "n/a"}, ${parcel.sqft ?? "n/a"} sqft, ${parcel.beds ?? "n/a"}bd/${parcel.baths ?? "n/a"}ba, built ${parcel.yearBuilt ?? "n/a"}, type ${parcel.propertyType ?? "n/a"}`)
    else L.push("- No county parcel layer covers this address yet (facts unknown — recommend ✨ Enrich in Real Estate)")
    if (d.hasValue) L.push(`- Underwrite (${d.valueEstimated ? "value modeled from area median — verify with comps" : "valued"}): ARV ~$${Math.round(d.arv).toLocaleString()}, rehab ~$${Math.round(d.repairCost).toLocaleString()}, MAO $${Math.round(d.mao).toLocaleString()}, projected ${d.headlineLabel.toLowerCase()} ~$${Math.round(d.headlineProfit).toLocaleString()}, grade ${d.grade}${d.verdict ? `, verdict: ${d.verdict.call} — ${d.verdict.reason}` : ""}`)
    if (f?.medianRent) L.push(`- Area rent ~$${f.medianRent}/mo (median)`)
    return L.join("\n")
  } catch {
    return null
  }
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!isAuthorized(request, user)) return Response.json({ error: "Unauthorized" }, { status: 401 })

  let body: {
    transcript?: string
    history?: Array<{ you?: string; ai?: string }>
    custom?: string
    lastSearch?: { area?: string; count?: number; summary?: string }
  }
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }) }
  const transcript = (body.transcript ?? "").trim().slice(0, 800)
  if (!transcript) return Response.json({ answer: "", detail: "", action: null })

  const custom = typeof body.custom === "string" ? body.custom.trim().slice(0, 600) : ""
  const history = (Array.isArray(body.history) ? body.history : [])
    .slice(-8)
    .map((t) => `Investor: ${String(t.you ?? "").slice(0, 300)}\nYou: ${String(t.ai ?? "").slice(0, 300)}`)
    .join("\n")
  const last = body.lastSearch?.area
    ? `\nMost recent search: ${body.lastSearch.area} — ${body.lastSearch.count ?? 0} results.`
    : ""
  const convo =
    (custom ? `The investor's saved focus (always respect this): "${custom}"\n\n` : "") +
    (history ? `Conversation so far:\n${history}\n` : "") + last

  try {
    // Step 1 — route the question.
    const routed = await runAgent(CLASSIFY_SYSTEM, `${convo}\nInvestor just said: "${transcript}"`, { jsonMode: true, maxTokens: 350 })
    const route = (typeof routed === "string" ? safeParse(routed) : routed as Record<string, unknown>) ?? {}
    const intent = String(route.intent ?? "general")

    // Search stays an executable client action (validated).
    if (intent === "search" && route.search && typeof route.search === "object") {
      const raw = route.search as Record<string, unknown>
      const st = String(raw.searchType ?? "")
      const s: VoiceSearchAction = {
        searchType: st === "zip" ? "zip" : st === "county" ? "county" : "city",
        city: typeof raw.city === "string" ? raw.city.trim().slice(0, 60) : undefined,
        state: typeof raw.state === "string" ? raw.state.trim().toUpperCase().slice(0, 2) : undefined,
        zip: typeof raw.zip === "string" ? raw.zip.replace(/[^0-9]/g, "").slice(0, 5) : undefined,
        county: typeof raw.county === "string" ? raw.county.trim().slice(0, 60) : undefined,
        leadType: typeof raw.leadType === "string" && raw.leadType.trim() ? raw.leadType.trim().toLowerCase() : undefined,
        maxLeads: typeof raw.maxLeads === "number" ? Math.min(Math.max(Math.round(raw.maxLeads), 25), 300) : 100,
      }
      const valid = (s.searchType === "zip" && s.zip) || (s.searchType === "county" && s.county) || (s.searchType === "city" && s.city)
      if (valid) {
        const area = s.searchType === "zip" ? `ZIP ${s.zip}` : s.searchType === "county" ? `${s.county} County` : `${s.city}${s.state ? `, ${s.state}` : ""}`
        return Response.json({
          answer: `On it — pulling ${s.leadType ?? ""} deals in ${area} now.`.replace(/\s+/g, " "),
          detail: `Searching ${area}${s.leadType ? ` for ${s.leadType} properties` : ""} — results appear below the moment they land. Tell me how to refine them.`,
          action: { search: s },
        })
      }
    }

    // Step 2 — ground market/address questions in OUR data, then compose.
    let dataBlock: string | null = null
    let grounded: { kind: string; label: string } | null = null
    if (intent === "market" && route.market && typeof route.market === "object") {
      const m = route.market as Record<string, unknown>
      const city = typeof m.city === "string" ? m.city.trim() : ""
      const state = typeof m.state === "string" ? m.state.trim().toUpperCase().slice(0, 2) : ""
      if (city) {
        dataBlock = await marketDigest(city, state)
        if (dataBlock) grounded = { kind: "market", label: `${city}, ${state}` }
      }
    } else if (intent === "address" && route.address && typeof route.address === "object") {
      const ad = route.address as Record<string, unknown>
      const address = typeof ad.address === "string" ? ad.address.trim() : ""
      if (address) {
        dataBlock = await addressDigest({
          address,
          city: typeof ad.city === "string" ? ad.city.trim() : undefined,
          state: typeof ad.state === "string" ? ad.state.trim() : undefined,
          zip: typeof ad.zip === "string" ? ad.zip.trim() : undefined,
        })
        if (dataBlock) grounded = { kind: "address", label: address }
      }
    }

    const userPrompt = `${convo}\n${dataBlock ? `${dataBlock}\n` : ""}\nInvestor just said: "${transcript}"`
    const out = await runAgent(ANSWER_SYSTEM, userPrompt, { jsonMode: true, maxTokens: 1400 })
    const obj = typeof out === "string" ? safeParse(out) : (out as Record<string, unknown>)
    const spoken = typeof obj?.spoken === "string" ? obj.spoken.trim() : ""
    const detail = typeof obj?.detail === "string" ? obj.detail.trim() : ""

    if (!spoken && !detail) {
      const raw = (typeof out === "string" ? out : JSON.stringify(out)).trim()
      return Response.json({ answer: firstSentence(raw) || "I didn't catch that — try again.", detail: raw, action: null, grounded })
    }
    return Response.json({ answer: spoken || firstSentence(detail), detail: detail || spoken, action: null, grounded })
  } catch {
    return Response.json({ answer: "The assistant is unavailable right now — try again in a moment.", detail: "", action: null })
  }
}
