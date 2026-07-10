// Free public deal analyzer — the "try before you buy" teaser. Anyone can run
// a handful of instant analyses per day: our own enrichment (county parcel +
// web + RentCast when keyed) → value → full underwrite → verdict. Returns the
// headline numbers only (no owner/contact data, no comps detail) with a CTA to
// the real platform. Rate-limited per IP + honeypot; never throws.

export const maxDuration = 60

import { NextRequest } from "next/server"
import { enrichPropertyFromWeb } from "@/lib/property-enrichment"
import { estimateValueFromWeb } from "@/lib/own-valuation"
import { valuateProperty, fetchPropertyRecord, isValuationConfigured } from "@/lib/property-valuation"
import { enrichFromParcel } from "@/lib/parcel-enrich"
import { analyzeDeal } from "@/lib/deal-analysis"
import type { ForeclosureLead } from "@/lib/agents/foreclosure-agent"

const DAILY_PER_IP = 5
const ipCounts = new Map<string, { day: string; n: number }>()

function allow(ip: string): boolean {
  const day = new Date().toISOString().slice(0, 10)
  const cur = ipCounts.get(ip)
  if (!cur || cur.day !== day) { ipCounts.set(ip, { day, n: 1 }); return true }
  if (cur.n >= DAILY_PER_IP) return false
  cur.n += 1
  return true
}

export async function POST(request: NextRequest) {
  let body: { address?: string; city?: string; state?: string; zip?: string; website?: string }
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }) }
  if (typeof body.website === "string" && body.website.trim()) return Response.json({ error: "Something went wrong." }, { status: 400 })

  const address = (body.address ?? "").trim().slice(0, 160)
  if (!address) return Response.json({ error: "Enter a property address." }, { status: 400 })

  const ip = (request.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim()
  if (!allow(ip)) {
    return Response.json({ error: "You've used today's free analyses. Sign in for unlimited — or come back tomorrow." }, { status: 429 })
  }

  const p = { address, city: (body.city ?? "").trim().slice(0, 80), state: (body.state ?? "").trim().slice(0, 2).toUpperCase(), zip: (body.zip ?? "").trim().slice(0, 10) }

  try {
    const [web, record, rcVal, webVal, parcel] = await Promise.all([
      enrichPropertyFromWeb(p).catch(() => null),
      isValuationConfigured() ? fetchPropertyRecord(p).catch(() => null) : Promise.resolve(null),
      isValuationConfigured() ? valuateProperty(p).catch(() => null) : Promise.resolve(null),
      estimateValueFromWeb(p).catch(() => null),
      enrichFromParcel(address, p.state || "CA").catch(() => null),
    ])

    const value = rcVal?.value ?? webVal?.value ?? web?.estimatedValue ?? 0
    const beds = record?.beds ?? parcel?.beds ?? web?.beds ?? null
    const baths = record?.baths ?? parcel?.baths ?? web?.baths ?? null
    const sqft = record?.sqft ?? parcel?.sqft ?? web?.sqft ?? null
    const yearBuilt = record?.yearBuilt ?? parcel?.yearBuilt ?? web?.yearBuilt ?? null

    const lead = {
      attomId: 0, address: p.address, city: p.city, state: p.state, zip: p.zip,
      ownerName: "", ownerName2: null, ownerType: "individual", isAbsentee: false, mailingAddress: null, yearsOwned: null,
      phone: null, email: null, linkedInUrl: null, contactConfidence: null,
      foreclosureType: "", foreclosureStage: "PRE_FORECLOSURE", recordingDate: "", daysOnFile: 0, defaultAmount: null, lender: null, auctionDate: null,
      estimatedValue: value || null, avmValue: rcVal?.value ?? null, avmConfidence: rcVal?.confidence ?? null, purchasePrice: null, purchaseDate: null,
      totalLiens: 0, lienCount: 0, estimatedEquity: null, equityPercent: null, taxDelinquent: false,
      propertyType: record?.propertyType ?? parcel?.propertyType ?? null, beds, baths, sqft, yearBuilt, lotSize: null,
      score: 50, priority: "WARM", scoreBreakdown: { equity: 0, distress: 0, stage: 0, owner: 0, property: 0 }, scoreReason: "", distressSignals: [],
      dealCalc: null, outreach: null, rentEstimate: rcVal?.rentEstimate ?? webVal?.rentEstimate ?? null, comps: [],
    } as unknown as ForeclosureLead

    const a = analyzeDeal(lead)
    const found = value > 0 || Boolean(beds || sqft)

    return Response.json({
      found,
      property: { beds, baths, sqft, yearBuilt, type: lead.propertyType },
      value: Math.round(value),
      analysis: found && a.hasValue ? {
        arv: Math.round(a.arv),
        mao: Math.round(a.mao),
        repairs: Math.round(a.repairCost),
        profit: Math.round(a.headlineProfit),
        roi: a.roiPct,
        grade: a.grade,
        verdict: a.verdict?.call ?? "",
        reason: a.verdict?.reason ?? "",
      } : null,
      note: found ? null : "We couldn't find enough public data on this address — full accounts get deeper enrichment (county records + live valuation).",
    })
  } catch {
    return Response.json({ error: "Analysis failed — try again in a moment." }, { status: 500 })
  }
}
