// On-demand full enrichment — fills a scraped lead's blank fields (beds, baths,
// sqft, year, lot, owner, last sale) AND live AVM/comps/rent in one call, then
// returns a patch the client merges into the lead. Key-gated (RentCast free
// tier) and graceful: returns { configured:false } with no key, never throws.

export const maxDuration = 25

import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { fetchPropertyRecord, valuateProperty, isValuationConfigured } from "@/lib/property-valuation"

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "ap2026admin"

function isAuthorized(request: NextRequest, user: unknown): boolean {
  if (user) return true
  return request.headers.get("x-admin-password") === ADMIN_PASSWORD
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "")
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!isAuthorized(request, user)) return Response.json({ error: "Unauthorized" }, { status: 401 })

  if (!isValuationConfigured()) {
    return Response.json({
      configured: false,
      note: "Property enrichment is off. Add RENTCAST_API_KEY (free 50/mo at rentcast.io) to auto-fill beds, baths, sqft, owner, last sale & live value.",
    })
  }

  let body: { address?: string; city?: string; state?: string; zip?: string; totalLiens?: number }
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }) }
  if (!body.address) return Response.json({ error: "address is required" }, { status: 400 })

  const p = { address: body.address, city: body.city ?? "", state: body.state ?? "", zip: body.zip ?? "" }

  try {
    const [record, valuation] = await Promise.all([
      fetchPropertyRecord(p).catch(() => null),
      valuateProperty(p).catch(() => null),
    ])
    if (!record && !valuation) {
      return Response.json({ configured: true, found: false, note: "No public record found for this address." })
    }

    const avm = valuation?.value ?? null
    const totalLiens = typeof body.totalLiens === "number" ? body.totalLiens : 0
    const equityDollars = avm != null && avm > 0 ? Math.max(0, Math.round(avm - totalLiens)) : null
    const equityPercent = avm != null && avm > 0 && equityDollars != null ? Math.round((equityDollars / avm) * 100) : null

    // Absentee = owner's mailing address differs from the property.
    const isAbsentee = record?.mailingAddress
      ? !norm(record.mailingAddress).includes(norm(p.address)) && norm(record.mailingAddress) !== norm([p.address, p.city, p.state, p.zip].join(""))
      : null

    // A patch of ForeclosureLead-compatible fields (all optional).
    const patch: Record<string, unknown> = {}
    if (record) {
      if (record.beds != null) patch.beds = record.beds
      if (record.baths != null) patch.baths = record.baths
      if (record.sqft != null) patch.sqft = record.sqft
      if (record.yearBuilt != null) patch.yearBuilt = record.yearBuilt
      if (record.lotSize != null) patch.lotSize = record.lotSize
      if (record.propertyType) patch.propertyType = record.propertyType
      if (record.lastSalePrice != null) patch.purchasePrice = record.lastSalePrice
      if (record.lastSaleDate) patch.purchaseDate = record.lastSaleDate
      if (record.ownerName) patch.ownerName = record.ownerName
      if (record.mailingAddress) patch.mailingAddress = record.mailingAddress
      if (isAbsentee != null) patch.isAbsentee = isAbsentee
    }
    if (valuation) {
      patch.avmValue = valuation.value
      patch.estimatedValue = valuation.value
      patch.avmConfidence = valuation.confidence
      patch.valuationSource = valuation.source
      if (valuation.rentEstimate != null) patch.rentEstimate = valuation.rentEstimate
      if (valuation.rentToValue != null) patch.rentToValue = valuation.rentToValue
      if (valuation.comps?.length) patch.comps = valuation.comps
      if (equityDollars != null) patch.estimatedEquity = equityDollars
      if (equityPercent != null) patch.equityPercent = equityPercent
    }

    return Response.json({ configured: true, found: true, patch, record, valuation })
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Enrichment failed" }, { status: 500 })
  }
}
