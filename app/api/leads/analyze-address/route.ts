// Analyze ANY address — not just distressed/foreclosure. Enriches + values it
// with our own systems and returns the full deal math (MAO, ROI, profit,
// verdict, equity) so you can judge whether any property is a good deal.

export const maxDuration = 30

import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { enrichPropertyFromWeb } from "@/lib/property-enrichment"
import { estimateValueFromWeb } from "@/lib/own-valuation"
import { valuateProperty, fetchPropertyRecord, isValuationConfigured } from "@/lib/property-valuation"
import { analyzeDeal } from "@/lib/deal-analysis"
import type { ForeclosureLead } from "@/lib/agents/foreclosure-agent"

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "ap2026admin"
function isAuthorized(request: NextRequest, user: unknown): boolean {
  if (user) return true
  return request.headers.get("x-admin-password") === ADMIN_PASSWORD
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!isAuthorized(request, user)) return Response.json({ error: "Unauthorized" }, { status: 401 })

  let body: { address?: string; city?: string; state?: string; zip?: string; totalLiens?: number }
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }) }
  if (!body.address) return Response.json({ error: "address is required" }, { status: 400 })
  const p = { address: body.address, city: body.city ?? "", state: body.state ?? "", zip: body.zip ?? "" }

  try {
    const [web, record, rcVal, webVal] = await Promise.all([
      enrichPropertyFromWeb(p).catch(() => null),
      isValuationConfigured() ? fetchPropertyRecord(p).catch(() => null) : Promise.resolve(null),
      isValuationConfigured() ? valuateProperty(p).catch(() => null) : Promise.resolve(null),
      estimateValueFromWeb(p).catch(() => null),
    ])

    const value = rcVal?.value ?? webVal?.value ?? web?.estimatedValue ?? 0
    const comps = (rcVal?.comps ?? webVal?.comps ?? []).slice(0, 6)
    const beds = record?.beds ?? web?.beds ?? null
    const baths = record?.baths ?? web?.baths ?? null
    const sqft = record?.sqft ?? web?.sqft ?? null
    const yearBuilt = record?.yearBuilt ?? web?.yearBuilt ?? null
    const owner = record?.ownerName ?? web?.ownerName ?? null
    const rent = rcVal?.rentEstimate ?? webVal?.rentEstimate ?? null

    // Build a minimal lead so the standard underwrite applies to any property.
    const lead = {
      attomId: 0, address: p.address, city: p.city, state: p.state, zip: p.zip,
      ownerName: owner ?? "", ownerName2: null, ownerType: "individual", isAbsentee: false, mailingAddress: null, yearsOwned: null,
      phone: null, email: null, linkedInUrl: null, contactConfidence: null,
      foreclosureType: "", foreclosureStage: "PRE_FORECLOSURE", recordingDate: "", daysOnFile: 0, defaultAmount: null, lender: null, auctionDate: null,
      estimatedValue: value || null, avmValue: rcVal?.value ?? null, avmConfidence: rcVal?.confidence ?? null, purchasePrice: record?.lastSalePrice ?? web?.lastSalePrice ?? null, purchaseDate: record?.lastSaleDate ?? web?.lastSaleDate ?? null,
      totalLiens: body.totalLiens ?? 0, lienCount: 0, estimatedEquity: null, equityPercent: null, taxDelinquent: false,
      propertyType: record?.propertyType ?? web?.propertyType ?? null, beds, baths, sqft, yearBuilt, lotSize: record?.lotSize ?? web?.lotSize ?? null,
      score: 50, priority: "WARM", scoreBreakdown: { equity: 0, distress: 0, stage: 0, owner: 0, property: 0 }, scoreReason: "", distressSignals: [],
      dealCalc: null, outreach: null, rentEstimate: rent, comps,
    } as unknown as ForeclosureLead

    const a = analyzeDeal(lead)

    return Response.json({
      found: value > 0 || Boolean(beds || sqft || owner),
      property: { beds, baths, sqft, yearBuilt, owner, type: lead.propertyType },
      value, comps,
      analysis: {
        hasValue: a.hasValue, arv: a.arv, mao: a.mao, repairCost: a.repairCost,
        profit: a.headlineProfit, label: a.headlineLabel, roi: a.roiPct,
        equityPercent: a.equityPercent, grade: a.grade,
        verdict: a.verdict, exit: a.exit, rental: a.rental, profitRange: a.profitRange,
        whyGood: a.whyGood,
      },
    })
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Analysis failed" }, { status: 500 })
  }
}
