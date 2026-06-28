// On-demand full enrichment — fills a scraped lead's blank fields (beds, baths,
// sqft, year, lot, owner, last sale) AND live AVM/comps/rent in one call, then
// returns a patch the client merges into the lead. Key-gated (RentCast free
// tier) and graceful: returns { configured:false } with no key, never throws.

export const maxDuration = 30

import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { fetchPropertyRecord, valuateProperty, isValuationConfigured } from "@/lib/property-valuation"
import { enrichPropertyFromWeb } from "@/lib/property-enrichment"
import { enrichFromParcel } from "@/lib/parcel-enrich"

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "ap2026admin"

function isAuthorized(request: NextRequest, user: unknown): boolean {
  if (user) return true
  return request.headers.get("x-admin-password") === ADMIN_PASSWORD
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "")
}

// Set a patch key only if the value is present and the key isn't already filled.
function set(patch: Record<string, unknown>, key: string, value: unknown): void {
  if (value != null && value !== "" && patch[key] == null) patch[key] = value
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
    // Our own free web+AI enrichment runs ALWAYS; RentCast (if configured) is
    // layered on top for accuracy. RentCast values win on overlap.
    const [web, record, valuation, parcel] = await Promise.all([
      enrichPropertyFromWeb(p).catch(() => null),
      isValuationConfigured() ? fetchPropertyRecord(p).catch(() => null) : Promise.resolve(null),
      isValuationConfigured() ? valuateProperty(p).catch(() => null) : Promise.resolve(null),
      enrichFromParcel(p.address, p.state).catch(() => null),
    ])

    if (!web && !record && !valuation && !parcel) {
      return Response.json({ configured: true, found: false, note: "Couldn't find public details for this address. Try a more complete address." })
    }

    const patch: Record<string, unknown> = {}
    const sources: string[] = []

    // RentCast property record (most accurate) wins first.
    if (record) {
      sources.push("RentCast records")
      set(patch, "beds", record.beds); set(patch, "baths", record.baths); set(patch, "sqft", record.sqft)
      set(patch, "yearBuilt", record.yearBuilt); set(patch, "lotSize", record.lotSize); set(patch, "propertyType", record.propertyType)
      set(patch, "purchasePrice", record.lastSalePrice); set(patch, "purchaseDate", record.lastSaleDate)
      set(patch, "ownerName", record.ownerName); set(patch, "mailingAddress", record.mailingAddress)
      if (record.mailingAddress) {
        const absentee = !norm(record.mailingAddress).includes(norm(p.address))
        set(patch, "isAbsentee", absentee)
      }
    }

    // Our own keyless county-parcel data (real public assessor facts) — fills
    // before the weaker web extraction. We intentionally don't use assessed
    // value as the market value (CA Prop-13 understates it); real sqft drives
    // the comp-based ARV instead.
    if (parcel) {
      sources.push(parcel.source)
      set(patch, "sqft", parcel.sqft); set(patch, "beds", parcel.beds); set(patch, "baths", parcel.baths)
      set(patch, "yearBuilt", parcel.yearBuilt); set(patch, "propertyType", parcel.propertyType)
      set(patch, "ownerName", parcel.ownerName); set(patch, "mailingAddress", parcel.mailingAddress)
      if (parcel.mailingAddress) set(patch, "isAbsentee", !norm(parcel.mailingAddress).includes(norm(p.address)))
    }

    // Our own web extraction fills any remaining gaps.
    if (web) {
      sources.push(web.source)
      set(patch, "beds", web.beds); set(patch, "baths", web.baths); set(patch, "sqft", web.sqft)
      set(patch, "yearBuilt", web.yearBuilt); set(patch, "lotSize", web.lotSize); set(patch, "propertyType", web.propertyType)
      set(patch, "purchasePrice", web.lastSalePrice); set(patch, "purchaseDate", web.lastSaleDate)
      set(patch, "ownerName", web.ownerName)
    }

    // Value: RentCast AVM preferred; else web-estimated value.
    const totalLiens = typeof body.totalLiens === "number" ? body.totalLiens : 0
    let avm: number | null = null
    if (valuation) {
      sources.push(valuation.source)
      avm = valuation.value
      set(patch, "avmValue", valuation.value); patch.estimatedValue = valuation.value
      set(patch, "avmConfidence", valuation.confidence); set(patch, "valuationSource", valuation.source)
      set(patch, "rentEstimate", valuation.rentEstimate); set(patch, "rentToValue", valuation.rentToValue)
      if (valuation.comps?.length) set(patch, "comps", valuation.comps)
    } else if (web?.estimatedValue) {
      avm = web.estimatedValue
      patch.estimatedValue = web.estimatedValue
      set(patch, "valuationSource", web.source)
    }

    // Recompute equity from the best value we have.
    if (avm != null && avm > 0) {
      const equityDollars = Math.max(0, Math.round(avm - totalLiens))
      patch.estimatedEquity = equityDollars
      patch.equityPercent = Math.round((equityDollars / avm) * 100)
    }

    return Response.json({
      configured: true,
      found: Object.keys(patch).length > 0,
      patch,
      sources: Array.from(new Set(sources)),
      premium: isValuationConfigured(),
    })
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Enrichment failed", patch: {} }, { status: 200 })
  }
}
